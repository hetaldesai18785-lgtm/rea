import { Router } from "express";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import QRCode from "qrcode";
import { z } from "zod";
import { WORKSPACES_ROOT } from "../config/env.js";
import { slugify } from "../crypto/security.js";
import type { PlatformDatabase } from "../db/database.js";
import { createAuthMiddleware, param } from "../middleware/auth.js";
import type { AgentOrchestrator } from "../services/agents/orchestrator.js";
import type { CheckpointService } from "../services/checkpoints/checkpoints.js";
import { inspectProjectDatabase } from "../services/sandbox/dbInspector.js";
import type { SandboxRunner } from "../services/sandbox/runner.js";
import type { ProjectTestRunner } from "../services/sandbox/testRunner.js";
import type { ProjectDto } from "../../shared/types.js";

interface ProjectRow {
  id: string;
  workspace_id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string;
  app_type: ProjectDto["appType"];
  stack_frontend: string;
  stack_backend: string;
  stack_database: string;
  status: ProjectDto["status"];
  autonomy_mode: ProjectDto["autonomyMode"];
  hitl_mode: ProjectDto["hitlMode"];
  active_checkpoint_id: string | null;
  forked_from_project_id: string | null;
  github_repo: string | null;
  github_branch: string | null;
  workspace_path: string;
  created_at: string;
  updated_at: string;
}

export const createProjectRouter = (deps: {
  db: PlatformDatabase;
  sandbox: SandboxRunner;
  tests: ProjectTestRunner;
  checkpoints: CheckpointService;
  orchestrator: AgentOrchestrator;
}) => {
  const { db, sandbox, tests, checkpoints, orchestrator } = deps;
  const router = Router();
  const { requireAuth, requireProjectAccess } = createAuthMiddleware(db);

  const mapProject = (r: ProjectRow): ProjectDto => {
    const proc = sandbox.getState(r.id);
    const previewRunning = proc?.status === "running";
    return {
      id: r.id,
      workspaceId: r.workspace_id,
      ownerId: r.owner_id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      appType: r.app_type,
      stackFrontend: r.stack_frontend,
      stackBackend: r.stack_backend,
      stackDatabase: r.stack_database,
      status: r.status,
      autonomyMode: r.autonomy_mode,
      hitlMode: r.hitl_mode,
      activeCheckpointId: r.active_checkpoint_id,
      forkedFromProjectId: r.forked_from_project_id,
      githubRepo: r.github_repo,
      githubBranch: r.github_branch,
      previewRunning,
      previewPort: proc?.port ?? null,
      previewUrl: previewRunning ? `/preview/${r.id}/` : null,
      lastError: proc?.lastError ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  };

  router.use(requireAuth);

  router.get("/", (req, res) => {
    const rows = db.all<ProjectRow>(
      `SELECT p.* FROM projects p
       JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
       WHERE wm.user_id = ?
       ORDER BY p.updated_at DESC`,
      [req.auth!.user.id],
    );
    res.json({ projects: rows.map(mapProject) });
  });

  router.post("/", async (req, res) => {
    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(2000).optional(),
      appType: z.enum(["fullstack", "webapp", "api", "mobile-expo", "landing"]).optional(),
      stackFrontend: z.string().max(120).optional(),
      stackBackend: z.string().max(120).optional(),
      stackDatabase: z.string().max(120).optional(),
      autonomyMode: z.enum(["build", "plan"]).optional(),
      initialMode: z.enum(["build", "plan", "brainstorm"]).optional(),
      hitlMode: z.enum(["interactive", "auto"]).optional(),
      initialPrompt: z.string().max(4000).optional(),
      attachments: z.array(z.object({ name: z.string(), type: z.string(), size: z.number().optional() })).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid project data" });
      return;
    }

    const id = `proj-${randomUUID().slice(0, 10)}`;
    const workspaceId = req.auth!.workspaceId;
    const workspacePath = join(WORKSPACES_ROOT, workspaceId, id);
    mkdirSync(workspacePath, { recursive: true });

    const now = new Date().toISOString();
    const d = parsed.data;
    db.run(
      `INSERT INTO projects (id, workspace_id, owner_id, name, slug, description, app_type, stack_frontend, stack_backend, stack_database, status, autonomy_mode, hitl_mode, workspace_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      [
        id,
        workspaceId,
        req.auth!.user.id,
        d.name.trim(),
        slugify(d.name),
        d.description ?? d.initialPrompt ?? "",
        d.appType ?? "fullstack",
        d.stackFrontend ?? "React + TypeScript + Tailwind",
        d.stackBackend ?? "Node.js + Express/HTTP",
        d.stackDatabase ?? "SQLite / FileStore",
        d.autonomyMode ?? "build",
        d.hitlMode ?? "auto",
        workspacePath,
        now,
        now,
      ],
    );

    checkpoints.createCheckpoint({
      projectId: id,
      workspacePath,
      label: "Project initialized",
      summary: "Empty isolated sandbox workspace created",
    });

    if (d.initialPrompt && d.initialPrompt.trim().length > 0) {
      await orchestrator.executeRun({
        projectId: id,
        userId: req.auth!.user.id,
        prompt: d.initialPrompt.trim(),
        mode: d.initialMode ?? (d.autonomyMode === "plan" ? "plan" : "build"),
        attachments: d.attachments,
      });
    }

    const row = db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [id])!;
    res.status(201).json({ project: mapProject(row) });
  });

  router.get("/:id", requireProjectAccess, (req, res) => {
    const row = db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [param(req, "id")])!;
    res.json({ project: mapProject(row) });
  });

  router.patch("/:id", requireProjectAccess, (req, res) => {
    const schema = z.object({
      name: z.string().min(1).max(100).optional(),
      autonomyMode: z.enum(["build", "plan"]).optional(),
      hitlMode: z.enum(["interactive", "auto"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid update" });
      return;
    }
    const row = db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [param(req, "id")])!;
    const now = new Date().toISOString();
    db.run(
      "UPDATE projects SET name = ?, autonomy_mode = ?, hitl_mode = ?, updated_at = ? WHERE id = ?",
      [
        parsed.data.name ?? row.name,
        parsed.data.autonomyMode ?? row.autonomy_mode,
        parsed.data.hitlMode ?? row.hitl_mode,
        now,
        row.id,
      ],
    );
    const updated = db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [row.id])!;
    res.json({ project: mapProject(updated) });
  });

  router.delete("/:id", requireProjectAccess, async (req, res) => {
    const row = db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [param(req, "id")])!;
    await sandbox.stopProject(row.id);
    rmSync(row.workspace_path, { recursive: true, force: true });
    db.run("DELETE FROM projects WHERE id = ?", [row.id]);
    res.json({ ok: true });
  });

  router.get("/:id/files", requireProjectAccess, (req, res) => {
    const row = db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [param(req, "id")])!;
    res.json({ files: sandbox.listFiles(row.workspace_path) });
  });

  router.get("/:id/file", requireProjectAccess, (req, res) => {
    const pathParam = String(req.query.path ?? "");
    if (!pathParam) {
      res.status(400).json({ error: "Missing ?path= parameter" });
      return;
    }
    const row = db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [param(req, "id")])!;
    try {
      const content = sandbox.readFile(row.workspace_path, pathParam);
      res.json({ path: pathParam, content });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : "File not found" });
    }
  });

  router.put("/:id/file", requireProjectAccess, (req, res) => {
    const schema = z.object({ path: z.string().min(1), content: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid file write payload" });
      return;
    }
    const row = db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [param(req, "id")])!;
    try {
      sandbox.writeFile(row.workspace_path, parsed.data.path, parsed.data.content);
      res.json({ ok: true, path: parsed.data.path });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to write file" });
    }
  });

  router.delete("/:id/file", requireProjectAccess, (req, res) => {
    const pathParam = String(req.query.path ?? "");
    if (!pathParam) {
      res.status(400).json({ error: "Missing ?path= parameter" });
      return;
    }
    const row = db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [param(req, "id")])!;
    try {
      sandbox.deleteFile(row.workspace_path, pathParam);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to delete file" });
    }
  });

  router.post("/:id/terminal", requireProjectAccess, async (req, res) => {
    const schema = z.object({ command: z.string().min(1).max(500) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Command required" });
      return;
    }
    const row = db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [param(req, "id")])!;
    const out = await sandbox.execCommand(row.id, row.workspace_path, parsed.data.command);
    res.json(out);
  });

  router.post("/:id/preview/start", requireProjectAccess, async (req, res) => {
    const row = db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [param(req, "id")])!;
    const state = await sandbox.startProject(row.id, row.workspace_path);
    db.run("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?", [
      state.status === "running" ? "running" : "error",
      new Date().toISOString(),
      row.id,
    ]);
    res.json({ state, previewUrl: state.status === "running" ? `/preview/${row.id}/` : null });
  });

  router.post("/:id/preview/stop", requireProjectAccess, async (req, res) => {
    await sandbox.stopProject(param(req, "id"));
    res.json({ ok: true });
  });

  router.get("/:id/preview/status", requireProjectAccess, (req, res) => {
    const projectId = param(req, "id");
    const state = sandbox.getState(projectId);
    res.json({
      state: state ?? {
        projectId,
        port: 0,
        pid: null,
        status: "stopped",
        logs: [],
        problems: [],
        startedAt: null,
        lastError: null,
      },
    });
  });

  router.post("/:id/preview/report-error", requireProjectAccess, (req, res) => {
    const message = String(req.body?.message ?? "Unknown runtime error");
    sandbox.addProblem(param(req, "id"), "browser-preview", message);
    res.json({ ok: true });
  });

  router.get("/:id/mobile-qr", requireProjectAccess, async (req, res) => {
    const row = db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [param(req, "id")])!;
    const proto = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol || "http";
    const host = (req.headers["x-forwarded-host"] as string | undefined) || req.get("host") || "localhost:4100";
    const previewUrl = `${proto}://${host}/preview/${row.id}/`;
    const expUrl = `exp://${host}/--/studio/${row.id}`;
    const svg = await QRCode.toString(previewUrl, {
      type: "svg",
      width: 160,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
    const appJsonPath = join(row.workspace_path, "mobile/app.json");
    let expoConfig: Record<string, unknown> | null = null;
    if (existsSync(appJsonPath)) {
      try {
        expoConfig = JSON.parse(readFileSync(appJsonPath, "utf8")) as Record<string, unknown>;
      } catch {
        expoConfig = null;
      }
    }
    res.json({
      projectId: row.id,
      appType: row.app_type,
      previewUrl,
      expUrl,
      svg,
      expoConfig,
    });
  });

  router.get("/:id/db", requireProjectAccess, (req, res) => {
    const row = db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [param(req, "id")])!;
    res.json(inspectProjectDatabase(row.workspace_path));
  });

  router.post("/:id/api-test", requireProjectAccess, async (req, res) => {
    const schema = z.object({
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
      path: z.string().min(1),
      body: z.string().optional(),
      headers: z.record(z.string()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid API test request" });
      return;
    }
    const state = sandbox.getState(param(req, "id"));
    if (!state || state.status !== "running") {
      res.status(409).json({ error: "Preview server must be running to execute live API test" });
      return;
    }
    const cleanPath = parsed.data.path.startsWith("/") ? parsed.data.path : `/${parsed.data.path}`;
    const t0 = Date.now();
    try {
      const response = await fetch(`http://127.0.0.1:${state.port}${cleanPath}`, {
        method: parsed.data.method,
        headers: {
          ...(parsed.data.body ? { "Content-Type": "application/json" } : {}),
          ...(parsed.data.headers ?? {}),
        },
        body: parsed.data.method !== "GET" && parsed.data.body ? parsed.data.body : undefined,
        signal: AbortSignal.timeout(8000),
      });
      const text = await response.text();
      res.json({
        status: response.status,
        durationMs: Date.now() - t0,
        headers: Object.fromEntries(response.headers.entries()),
        body: text,
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : "Request failed" });
    }
  });

  router.get("/:id/tests", requireProjectAccess, (req, res) => {
    res.json({ testRuns: tests.listForProject(param(req, "id")) });
  });

  router.post("/:id/tests/run", requireProjectAccess, async (req, res) => {
    const row = db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", [param(req, "id")])!;
    const result = await tests.runTests(row.id, row.workspace_path, null);
    res.json({ testRun: result });
  });

  router.get("/:id/events", requireProjectAccess, (req, res) => {
    const projectId = param(req, "id");
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ projectId })}\n\n`);

    const onEvent = (evt: { event: string; payload: unknown }) => {
      res.write(`event: ${evt.event}\ndata: ${JSON.stringify(evt.payload)}\n\n`);
    };
    const onLog = (line: string) => {
      res.write(`event: log\ndata: ${JSON.stringify({ line })}\n\n`);
    };

    orchestrator.on(`project:${projectId}`, onEvent);
    sandbox.on(`log:${projectId}`, onLog);

    const keepalive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 15_000);

    req.on("close", () => {
      clearInterval(keepalive);
      orchestrator.off(`project:${projectId}`, onEvent);
      sandbox.off(`log:${projectId}`, onLog);
    });
  });

  return router;
};
