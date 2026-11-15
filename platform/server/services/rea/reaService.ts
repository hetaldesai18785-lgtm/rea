import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { REA_CLI_SCRIPT, REPO_ROOT } from "../../config/env.js";

const execFileAsync = promisify(execFile);

export interface ReaCommandResult {
  evidence_id?: string;
  provider?: { id: string; name: string; version: string };
  operation?: string;
  confidence?: string;
  authority?: string;
  limitations?: string[];
  normalized_result?: unknown;
  [key: string]: unknown;
}

export class ReaService {
  async runCliJson(args: string[], timeoutMs = 45_000, allowNonZeroJson = false): Promise<ReaCommandResult> {
    try {
      const { stdout } = await execFileAsync(process.execPath, [REA_CLI_SCRIPT, ...args, "--json"], {
        cwd: REPO_ROOT,
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
        env: {
          PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
          HOME: process.env.HOME ?? "/tmp",
        },
      });
      return JSON.parse(stdout) as ReaCommandResult;
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; message?: string };
      if (allowNonZeroJson && typeof execErr.stdout === "string" && execErr.stdout.trim().startsWith("{")) {
        return JSON.parse(execErr.stdout) as ReaCommandResult;
      }
      throw err;
    }
  }

  async getProviders(): Promise<unknown> {
    return await this.runCliJson(["providers"]);
  }

  async getDoctor(): Promise<unknown> {
    return await this.runCliJson(["doctor"], 45_000, true);
  }

  getCatalogSummary(): unknown {
    const catalogPath = join(REPO_ROOT, "docs/public/product-catalog.json");
    if (!existsSync(catalogPath)) return null;
    return JSON.parse(readFileSync(catalogPath, "utf8"));
  }

  resolveSafeTargetPath(inputPath: string): string {
    const resolved = resolve(REPO_ROOT, inputPath);
    if (!resolved.startsWith(REPO_ROOT)) {
      throw new Error("REA inspection path must stay within repository/workspace bounds");
    }
    if (!existsSync(resolved)) {
      throw new Error(`Target path does not exist: ${inputPath}`);
    }
    return resolved;
  }

  async inspectApiContract(targetPath: string): Promise<ReaCommandResult> {
    const safePath = this.resolveSafeTargetPath(targetPath);
    return await this.runCliJson(["inspect-api-contract", safePath]);
  }

  async analyzeJavaScriptApp(targetPath: string): Promise<ReaCommandResult> {
    const safePath = this.resolveSafeTargetPath(targetPath);
    return await this.runCliJson(["analyze-javascript-application", safePath]);
  }

  async inspectWebNetworkCapture(harPath: string): Promise<ReaCommandResult> {
    const safePath = this.resolveSafeTargetPath(harPath);
    return await this.runCliJson(["inspect-web-network-capture", safePath]);
  }

  async buildEnvironmentDryRun(capturePath: string): Promise<ReaCommandResult> {
    const safePath = this.resolveSafeTargetPath(capturePath);
    return await this.runCliJson(["environment-build", safePath, "--dry-run"]);
  }

  async inspectBinaryEntropy(targetPath: string): Promise<ReaCommandResult> {
    const safePath = this.resolveSafeTargetPath(targetPath);
    return await this.runCliJson(["inspect-byte-entropy", safePath]);
  }
}
