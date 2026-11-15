import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PlatformDatabase } from "../db/database.js";
import { DEFAULT_TEMPLATES, MARKETPLACE_INTEGRATIONS } from "../db/seed.js";
import { createAuthMiddleware, param } from "../middleware/auth.js";
import type { DeployService } from "../services/deploy/deployService.js";
import type { GitHubService } from "../services/github/githubService.js";

export const createGitHubDeployIntegrationRouter = (deps: {
  db: PlatformDatabase;
  github: GitHubService;
  deploy: DeployService;
}) => {
  const { db, github, deploy } = deps;
  const router = Router();
  const { requireAuth, requireAdmin, requireProjectAccess } = createAuthMiddleware(db);

  // Public templates & marketplace catalogs
  router.get("/templates", (_req, res) => {
    res.json({ templates: DEFAULT_TEMPLATES });
  });

  router.get("/integrations", (_req, res) => {
    res.json({ integrations: MARKETPLACE_INTEGRATIONS });
  });

  router.use(["/admin", "/audit-logs", "/projects", "/github", "/deployments"], requireAuth);

  router.get("/admin/overview", requireAdmin, (req, res) => {
    const users = db.get<{ c: number }>("SELECT COUNT(*) AS c FROM users")?.c ?? 0;
    const projects = db.get<{ c: number }>("SELECT COUNT(*) AS c FROM projects")?.c ?? 0;
    const deployments = db.get<{ c: number }>("SELECT COUNT(*) AS c FROM deployments")?.c ?? 0;
    const runs = db.get<{ c: number }>("SELECT COUNT(*) AS c FROM agent_runs")?.c ?? 0;
    const logs = db.all("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 80");
    res.json({
      stats: { users, projects, deployments, runs },
      auditLogs: logs,
      activeAdmin: req.auth!.user.email,
    });
  });

  const logAudit = (userId: string, projectId: string | null, action: string, target: string, confirmed: boolean) => {
    db.run(
      "INSERT INTO audit_logs (id, user_id, project_id, action, target, confirmed, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, '{}', ?)",
      [`aud-${randomUUID().slice(0, 10)}`, userId, projectId, action, target, confirmed ? 1 : 0, new Date().toISOString()],
    );
  };

  router.get("/audit-logs", (req, res) => {
    const logs = db.all("SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 60", [
      req.auth!.user.id,
    ]);
    res.json({ logs });
  });

  // Project Integrations
  router.get("/projects/:id/integrations", requireProjectAccess, (req, res) => {
    const configured = db.all("SELECT * FROM project_integrations WHERE project_id = ?", [param(req, "id")]);
    res.json({ configured });
  });

  router.put("/projects/:id/integrations/:integrationId", requireProjectAccess, (req, res) => {
    const projectId = param(req, "id");
    const integrationId = param(req, "integrationId");
    const item = MARKETPLACE_INTEGRATIONS.find((i) => i.id === integrationId);
    if (!item) {
      res.status(404).json({ error: "Integration not found" });
      return;
    }
    const existingSecrets = db.all<{ key_name: string }>(
      "SELECT key_name FROM project_secrets WHERE project_id = ? AND environment = 'preview'",
      [projectId],
    );
    const present = new Set(existingSecrets.map((s) => s.key_name));
    const missing = item.requiredEnvKeys.filter((k) => !present.has(k) && !process.env[k]);
    const status = missing.length === 0 ? "configured" : "requires_credentials";
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO project_integrations (id, project_id, integration_id, category, config_json, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, integration_id) DO UPDATE SET config_json = excluded.config_json, status = excluded.status, updated_at = excluded.updated_at`,
      [
        `pint-${randomUUID().slice(0, 8)}`,
        projectId,
        item.id,
        item.category,
        JSON.stringify(req.body ?? {}),
        status,
        now,
      ],
    );
    res.json({ ok: true, status, missingKeys: missing });
  });

  // GitHub Integration
  router.get("/github/status", async (req, res) => {
    const status = await github.getStatus(req.auth!.user.id);
    res.json(status);
  });

  router.post("/github/connect", async (req, res) => {
    const schema = z.object({ token: z.string().min(10), source: z.enum(["pat", "oauth"]).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Valid GitHub token required" });
      return;
    }
    try {
      const status = await github.connectToken(req.auth!.user.id, parsed.data.token, parsed.data.source ?? "pat");
      logAudit(req.auth!.user.id, null, "github.connect", status.username ?? "token", true);
      res.json(status);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to connect GitHub" });
    }
  });

  router.get("/github/repos", async (req, res) => {
    try {
      const repos = await github.listRepositories(req.auth!.user.id);
      res.json({ repos });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to list repositories" });
    }
  });

  router.post("/github/repos", async (req, res) => {
    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(400).optional(),
      isPrivate: z.boolean().optional(),
      confirmDestructive: z.boolean(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Repository name and confirmation flag required" });
      return;
    }
    try {
      const repo = await github.createRepository({ userId: req.auth!.user.id, ...parsed.data });
      logAudit(req.auth!.user.id, null, "github.create_repo", parsed.data.name, parsed.data.confirmDestructive);
      res.status(201).json({ repo });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create repo" });
    }
  });

  router.get("/projects/:id/git/status", requireProjectAccess, async (req, res) => {
    const proj = db.get<{ workspace_path: string }>("SELECT workspace_path FROM projects WHERE id = ?", [
      param(req, "id"),
    ])!;
    const gitStatus = await github.getProjectGitStatus(proj.workspace_path);
    res.json(gitStatus);
  });

  router.post("/projects/:id/git/commit", requireProjectAccess, async (req, res) => {
    const projectId = param(req, "id");
    const schema = z.object({
      message: z.string().min(1).max(200),
      branch: z.string().min(1).max(80).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Commit message required" });
      return;
    }
    const proj = db.get<{ workspace_path: string }>("SELECT workspace_path FROM projects WHERE id = ?", [
      projectId,
    ])!;
    const out = await github.initAndCommitLocal({
      projectId,
      workspacePath: proj.workspace_path,
      commitMessage: parsed.data.message,
      authorName: req.auth!.user.name,
      authorEmail: req.auth!.user.email,
      branch: parsed.data.branch,
    });
    res.json(out);
  });

  router.post("/projects/:id/git/clone", requireProjectAccess, async (req, res) => {
    const projectId = param(req, "id");
    const schema = z.object({
      repoFullName: z.string().min(3),
      branch: z.string().optional(),
      confirmDestructive: z.boolean(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Repository name and confirmation flag required" });
      return;
    }
    const proj = db.get<{ workspace_path: string }>("SELECT workspace_path FROM projects WHERE id = ?", [
      projectId,
    ])!;
    try {
      const out = await github.cloneRepoIntoProject({
        userId: req.auth!.user.id,
        projectId,
        workspacePath: proj.workspace_path,
        ...parsed.data,
      });
      logAudit(req.auth!.user.id, projectId, "github.clone", parsed.data.repoFullName, parsed.data.confirmDestructive);
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Clone failed" });
    }
  });

  router.post("/projects/:id/git/push", requireProjectAccess, async (req, res) => {
    const projectId = param(req, "id");
    const schema = z.object({
      repoFullName: z.string().min(3),
      branch: z.string().min(1),
      commitMessage: z.string().min(1),
      confirmDestructive: z.boolean(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Repo, branch, commitMessage and confirmDestructive required" });
      return;
    }
    const proj = db.get<{ workspace_path: string }>("SELECT workspace_path FROM projects WHERE id = ?", [
      projectId,
    ])!;
    try {
      const out = await github.pushToGitHub({
        userId: req.auth!.user.id,
        projectId,
        workspacePath: proj.workspace_path,
        ...parsed.data,
      });
      logAudit(req.auth!.user.id, projectId, "github.push", `${parsed.data.repoFullName}:${parsed.data.branch}`, parsed.data.confirmDestructive);
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Push failed" });
    }
  });

  router.post("/projects/:id/git/pr", requireProjectAccess, async (req, res) => {
    const projectId = param(req, "id");
    const schema = z.object({
      repoFullName: z.string().min(3),
      title: z.string().min(1),
      body: z.string().default(""),
      head: z.string().min(1),
      base: z.string().default("main"),
      confirmDestructive: z.boolean(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid PR payload" });
      return;
    }
    try {
      const pr = await github.createPullRequest({ userId: req.auth!.user.id, ...parsed.data });
      logAudit(req.auth!.user.id, projectId, "github.create_pr", parsed.data.repoFullName, parsed.data.confirmDestructive);
      res.status(201).json({ pullRequest: pr });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "PR creation failed" });
    }
  });

  // Deployments
  router.get("/deployments", (req, res) => {
    const rows = db.all(
      `SELECT d.* FROM deployments d
       JOIN projects p ON p.id = d.project_id
       JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
       WHERE wm.user_id = ?
       ORDER BY d.created_at DESC LIMIT 50`,
      [req.auth!.user.id],
    );
    res.json({
      deployments: (rows as Array<Record<string, unknown>>).map((r) => ({
        id: r.id,
        projectId: r.project_id,
        provider: r.provider,
        environment: r.environment,
        checkpointId: r.checkpoint_id,
        status: r.status,
        url: r.url,
        healthStatus: r.health_status,
        healthHttpCode: r.health_http_code,
        logsText: r.logs_text,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  });

  router.get("/projects/:id/deployments", requireProjectAccess, (req, res) => {
    res.json({ deployments: deploy.listDeployments(param(req, "id")) });
  });

  router.post("/projects/:id/deploy", requireProjectAccess, async (req, res) => {
    const projectId = param(req, "id");
    const schema = z.object({
      provider: z
        .enum(["managed-sandbox", "vercel", "netlify", "fly", "railway", "render", "cloudflare", "docker"])
        .default("managed-sandbox"),
      environment: z.enum(["preview", "production"]).default("production"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid deployment configuration" });
      return;
    }
    const proj = db.get<{ workspace_path: string; active_checkpoint_id: string | null }>(
      "SELECT workspace_path, active_checkpoint_id FROM projects WHERE id = ?",
      [projectId],
    )!;
    const baseOrigin =
      req.headers["x-forwarded-host"] && req.headers["x-forwarded-proto"]
        ? `${req.headers["x-forwarded-proto"]}://${req.headers["x-forwarded-host"]}`
        : "";

    const deployment = await deploy.deployProject({
      projectId,
      workspacePath: proj.workspace_path,
      checkpointId: proj.active_checkpoint_id,
      provider: parsed.data.provider,
      environment: parsed.data.environment,
      baseOrigin,
    });
    logAudit(req.auth!.user.id, projectId, "deploy.trigger", `${parsed.data.provider}:${deployment.status}`, true);
    res.status(deployment.status === "live" ? 201 : 400).json({ deployment });
  });

  router.post("/deployments/:deploymentId/stop", async (req, res) => {
    const existing = deploy.getDeployment(param(req, "deploymentId"));
    if (!existing) {
      res.status(404).json({ error: "Deployment not found" });
      return;
    }
    const updated = await deploy.stopDeployment(existing.id);
    res.json({ deployment: updated });
  });

  router.post("/deployments/:deploymentId/rollback", async (req, res) => {
    const existing = deploy.getDeployment(param(req, "deploymentId"));
    if (!existing) {
      res.status(404).json({ error: "Deployment not found" });
      return;
    }
    const proj = db.get<{ workspace_path: string }>("SELECT workspace_path FROM projects WHERE id = ?", [
      existing.projectId,
    ]);
    if (!proj) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const redeployed = await deploy.deployProject({
      projectId: existing.projectId,
      workspacePath: proj.workspace_path,
      checkpointId: existing.checkpointId,
      provider: existing.provider,
      environment: existing.environment,
    });
    res.json({ deployment: redeployed });
  });

  return router;
};
