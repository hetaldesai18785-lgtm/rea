import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer as createNetServer } from "node:net";
import { dirname, join, relative } from "node:path";
import { EventEmitter } from "node:events";
import { SERVER_CONFIG } from "../../config/env.js";
import { decryptSecret, redactSensitiveOutput, resolveContainedPath } from "../../crypto/security.js";
import type { PlatformDatabase } from "../../db/database.js";

export interface SandboxProcessState {
  projectId: string;
  port: number;
  pid: number | null;
  status: "starting" | "running" | "stopped" | "error";
  logs: string[];
  problems: Array<{ source: string; message: string; timestamp: string }>;
  startedAt: string;
  lastError: string | null;
}

const findFreePort = (startFrom: number): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.unref();
    srv.on("error", () => {
      resolve(findFreePort(startFrom + 1));
    });
    srv.listen(startFrom, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : startFrom;
      srv.close(() => resolve(port));
    });
  });

const isPrlimitAvailable = (): boolean => existsSync("/usr/bin/prlimit");

export class SandboxRunner extends EventEmitter {
  readonly #db: PlatformDatabase;
  readonly #processes = new Map<string, { proc: ChildProcess | null; state: SandboxProcessState }>();
  #nextPort = SERVER_CONFIG.sandboxBasePort;

  constructor(db: PlatformDatabase) {
    super();
    this.#db = db;
  }

  getProjectSecrets(projectId: string, environment: "preview" | "production"): Record<string, string> {
    const rows = this.#db.all<{ key_name: string; encrypted_value: string }>(
      "SELECT key_name, encrypted_value FROM project_secrets WHERE project_id = ? AND environment = ?",
      [projectId, environment],
    );
    const out: Record<string, string> = {};
    for (const r of rows) {
      try {
        out[r.key_name] = decryptSecret(r.encrypted_value);
      } catch {
        // Ignore corrupted secret entry
      }
    }
    return out;
  }

  buildSanitizedEnv(projectId: string, environment: "preview" | "production", port: number): NodeJS.ProcessEnv {
    const projectSecrets = this.getProjectSecrets(projectId, environment);
    // Strict isolation: NEVER forward platform LLM keys, GH_TOKEN, or master key to generated user apps!
    return {
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      HOME: process.env.HOME ?? "/tmp",
      NODE_ENV: environment === "production" ? "production" : "development",
      HOST: "127.0.0.1",
      PORT: String(port),
      ...projectSecrets,
    };
  }

  getState(projectId: string): SandboxProcessState | null {
    return this.#processes.get(projectId)?.state ?? null;
  }

  appendLog(projectId: string, line: string): void {
    const entry = this.#processes.get(projectId);
    if (!entry) return;
    const secrets = Object.values(this.getProjectSecrets(projectId, "preview"));
    const safeLine = redactSensitiveOutput(line, secrets);
    entry.state.logs.push(safeLine);
    if (entry.state.logs.length > 400) entry.state.logs.shift();
    this.emit(`log:${projectId}`, safeLine);
  }

  addProblem(projectId: string, source: string, message: string): void {
    const entry = this.#processes.get(projectId);
    if (!entry) return;
    entry.state.problems.unshift({
      source,
      message: message.slice(0, 800),
      timestamp: new Date().toISOString(),
    });
    if (entry.state.problems.length > 50) entry.state.problems.pop();
  }

  clearProblems(projectId: string): void {
    const entry = this.#processes.get(projectId);
    if (entry) entry.state.problems = [];
  }

  async stopProject(projectId: string): Promise<void> {
    const entry = this.#processes.get(projectId);
    if (!entry) return;
    const proc = entry.proc;
    entry.proc = null;
    entry.state.status = "stopped";
    entry.state.pid = null;
    if (proc && proc.pid) {
      try {
        process.kill(-proc.pid, "SIGTERM");
      } catch {
        try {
          proc.kill("SIGTERM");
        } catch {
          // Already dead
        }
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (proc.pid) {
            try {
              process.kill(-proc.pid, "SIGKILL");
            } catch {
              // ignore
            }
          }
          resolve();
        }, 1200);
        proc.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  async startProject(projectId: string, workspacePath: string): Promise<SandboxProcessState> {
    await this.stopProject(projectId);
    const entryScript = existsSync(join(workspacePath, "src/server.mjs"))
      ? "src/server.mjs"
      : existsSync(join(workspacePath, "server.mjs"))
        ? "server.mjs"
        : null;
    if (!entryScript) {
      const errorState: SandboxProcessState = {
        projectId,
        port: 0,
        pid: null,
        status: "error",
        logs: ["No runnable server entrypoint (src/server.mjs) found yet."],
        problems: [{ source: "sandbox", message: "Missing server entrypoint", timestamp: new Date().toISOString() }],
        startedAt: new Date().toISOString(),
        lastError: "Missing server entrypoint",
      };
      this.#processes.set(projectId, { proc: null, state: errorState });
      return errorState;
    }

    const port = await findFreePort(this.#nextPort);
    this.#nextPort = port + 1;
    if (this.#nextPort > SERVER_CONFIG.sandboxBasePort + 500) {
      this.#nextPort = SERVER_CONFIG.sandboxBasePort;
    }

    const env = this.buildSanitizedEnv(projectId, "preview", port);
    const state: SandboxProcessState = {
      projectId,
      port,
      pid: null,
      status: "starting",
      logs: [`[sandbox] Starting isolated preview server on 127.0.0.1:${port}...`],
      problems: [],
      startedAt: new Date().toISOString(),
      lastError: null,
    };

    const spawnCmd = isPrlimitAvailable() ? "prlimit" : process.execPath;
    const spawnArgs = isPrlimitAvailable()
      ? [
          "--fsize=67108864:67108864",
          "--core=0:0",
          "--nofile=1024:1024",
          "--",
          process.execPath,
          "--max-old-space-size=512",
          entryScript,
        ]
      : ["--max-old-space-size=512", entryScript];

    const child = spawn(spawnCmd, spawnArgs, {
      cwd: workspacePath,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    state.pid = child.pid ?? null;
    this.#processes.set(projectId, { proc: child, state });

    child.stdout?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        if (line.trim()) this.appendLog(projectId, line);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        if (line.trim()) {
          this.appendLog(projectId, `[stderr] ${line}`);
          this.addProblem(projectId, "runtime-stderr", line);
        }
      }
    });
    child.on("exit", (code, signal) => {
      const current = this.#processes.get(projectId);
      if (current && current.proc === child) {
        current.state.status = code === 0 ? "stopped" : "error";
        current.state.pid = null;
        if (code !== 0 && signal !== "SIGTERM") {
          current.state.lastError = `Process exited with code ${code ?? signal}`;
          this.addProblem(projectId, "process-exit", current.state.lastError);
        }
      }
    });

    // Wait for /health check up to 8 seconds
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (state.status === "error") break;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(800) });
        if (res.ok) {
          state.status = "running";
          this.appendLog(projectId, `[sandbox] Preview healthy (HTTP ${res.status})`);
          return state;
        }
      } catch {
        // retry shortly
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    if (state.status === "starting") {
      state.status = "error";
      state.lastError = "Preview server did not answer /health within 8s";
      this.addProblem(projectId, "healthcheck", state.lastError);
    }
    return state;
  }

  async execCommand(
    projectId: string,
    workspacePath: string,
    command: string,
    timeoutMs = 30_000,
  ): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> {
    const start = Date.now();
    // Validate working path exists
    mkdirSync(workspacePath, { recursive: true });
    const env = this.buildSanitizedEnv(projectId, "preview", 0);
    const secrets = Object.values(this.getProjectSecrets(projectId, "preview"));

    return await new Promise((resolve) => {
      const child = spawn("sh", ["-c", command], {
        cwd: workspacePath,
        env,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      const maxBytes = 256 * 1024;

      child.stdout?.on("data", (d: Buffer) => {
        if (stdout.length < maxBytes) stdout += d.toString("utf8");
      });
      child.stderr?.on("data", (d: Buffer) => {
        if (stderr.length < maxBytes) stderr += d.toString("utf8");
      });

      const timer = setTimeout(() => {
        if (child.pid) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            // ignore
          }
        }
        stderr += `\n[sandbox] Command timed out after ${timeoutMs}ms`;
      }, timeoutMs);

      child.on("exit", (code) => {
        clearTimeout(timer);
        const safeOut = redactSensitiveOutput(stdout, secrets);
        const safeErr = redactSensitiveOutput(stderr, secrets);
        this.appendLog(projectId, `$ ${command}\n${safeOut}${safeErr ? "\n" + safeErr : ""}`);
        resolve({
          exitCode: code ?? 1,
          stdout: safeOut,
          stderr: safeErr,
          durationMs: Date.now() - start,
        });
      });
    });
  }

  listFiles(workspacePath: string): Array<{ path: string; size: number; kind: "file" }> {
    if (!existsSync(workspacePath)) return [];
    const results: Array<{ path: string; size: number; kind: "file" }> = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          results.push({
            path: relative(workspacePath, full).replace(/\\/g, "/"),
            size: statSync(full).size,
            kind: "file",
          });
        }
      }
    };
    walk(workspacePath);
    return results.sort((a, b) => a.path.localeCompare(b.path));
  }

  readFile(workspacePath: string, relPath: string): string {
    const safePath = resolveContainedPath(workspacePath, relPath);
    return readFileSync(safePath, "utf8");
  }

  writeFile(workspacePath: string, relPath: string, content: string): void {
    const safePath = resolveContainedPath(workspacePath, relPath);
    mkdirSync(dirname(safePath), { recursive: true });
    writeFileSync(safePath, content, "utf8");
  }

  deleteFile(workspacePath: string, relPath: string): void {
    const safePath = resolveContainedPath(workspacePath, relPath);
    if (existsSync(safePath)) {
      rmSync(safePath, { recursive: true, force: true });
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.#processes.keys()].map((id) => this.stopProject(id)));
  }
}
