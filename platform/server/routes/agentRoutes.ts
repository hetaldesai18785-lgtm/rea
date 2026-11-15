import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { encryptSecret, maskSecretHint } from "../crypto/security.js";
import type { PlatformDatabase } from "../db/database.js";
import { createAuthMiddleware, param } from "../middleware/auth.js";
import type { AgentOrchestrator } from "../services/agents/orchestrator.js";
import { readExistingBlueprint } from "../services/agents/blueprintCompiler.js";
import type { CheckpointService } from "../services/checkpoints/checkpoints.js";
import type { LlmRouter } from "../services/llm/router.js";
import type { SandboxRunner } from "../services/sandbox/runner.js";
import type { AgentConfigDto, AgentRole, LlmProviderDto } from "../../shared/types.js";

export const createAgentRouter = (deps: {
  db: PlatformDatabase;
  llm: LlmRouter;
  orchestrator: AgentOrchestrator;
  checkpoints: CheckpointService;
  sandbox: SandboxRunner;
}) => {
  const { db, llm, orchestrator, checkpoints, sandbox } = deps;
  const router = Router();
  const { requireAuth, requireProjectAccess } = createAuthMiddleware(db);

  router.use(["/projects", "/settings", "/billing"], requireAuth);

  router.get("/projects/:id/messages", requireProjectAccess, (req, res) => {
    const projectId = param(req, "id");
    const rows = db.all<{
      id: string;
      project_id: string;
      run_id: string | null;
      role: "user" | "assistant" | "agent" | "system";
      agent_role: AgentRole | null;
      content: string;
      attachments_json: string;
      plan_json: string | null;
      plan_status: "none" | "pending" | "approved" | "revised";
      checkpoint_id: string | null;
      created_at: string;
    }>("SELECT * FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC", [projectId]);

    res.json({
      messages: rows.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        runId: r.run_id,
        role: r.role,
        agentRole: r.agent_role,
        content: r.content,
        attachments: JSON.parse(r.attachments_json || "[]"),
        plan: r.plan_json ? JSON.parse(r.plan_json) : null,
        planStatus: r.plan_status,
        checkpointId: r.checkpoint_id,
        createdAt: r.created_at,
      })),
    });
  });

  router.get("/projects/:id/runs", requireProjectAccess, (req, res) => {
    const projectId = param(req, "id");
    const runs = db.all("SELECT * FROM agent_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 30", [
      projectId,
    ]);
    const steps = db.all("SELECT * FROM agent_steps WHERE project_id = ? ORDER BY created_at ASC LIMIT 300", [
      projectId,
    ]);
    res.json({ runs, steps });
  });

  router.post("/projects/:id/chat", requireProjectAccess, async (req, res) => {
    const projectId = param(req, "id");
    const schema = z.object({
      prompt: z.string().min(1).max(8000),
      mode: z.enum(["plan", "build", "modify", "debug", "test", "brainstorm"]).optional(),
      attachments: z.array(z.object({ name: z.string(), type: z.string(), size: z.number().optional() })).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }

    const proj = db.get<{ workspace_path: string; autonomy_mode: string }>(
      "SELECT workspace_path, autonomy_mode FROM projects WHERE id = ?",
      [projectId],
    )!;
    const hasBlueprint = Boolean(readExistingBlueprint(proj.workspace_path));
    const resolvedMode =
      parsed.data.mode ??
      (hasBlueprint ? "modify" : proj.autonomy_mode === "plan" ? "plan" : "build");

    const result = await orchestrator.executeRun({
      projectId,
      userId: req.auth!.user.id,
      prompt: parsed.data.prompt,
      mode: resolvedMode,
      attachments: parsed.data.attachments,
    });
    res.json(result);
  });

  router.post("/projects/:id/messages/:messageId/approve-plan", requireProjectAccess, async (req, res) => {
    const projectId = param(req, "id");
    const messageId = param(req, "messageId");
    const msg = db.get<{ id: string; content: string; plan_json: string | null }>(
      "SELECT id, content, plan_json FROM chat_messages WHERE id = ? AND project_id = ?",
      [messageId, projectId],
    );
    if (!msg || !msg.plan_json) {
      res.status(404).json({ error: "Plan proposal not found" });
      return;
    }
    db.run("UPDATE chat_messages SET plan_status = 'approved' WHERE id = ?", [msg.id]);

    // Find original user prompt that preceded this plan
    const lastUser = db.get<{ content: string }>(
      "SELECT content FROM chat_messages WHERE project_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1",
      [projectId],
    );

    const result = await orchestrator.executeRun({
      projectId,
      userId: req.auth!.user.id,
      prompt: lastUser?.content ?? msg.content,
      mode: "build",
    });
    res.json(result);
  });

  router.post("/projects/:id/runs/:runId/cancel", requireProjectAccess, (req, res) => {
    const cancelled = orchestrator.cancelRun(param(req, "runId"));
    res.json({ cancelled });
  });

  router.get("/projects/:id/checkpoints", requireProjectAccess, (req, res) => {
    res.json({ checkpoints: checkpoints.listCheckpoints(param(req, "id")) });
  });

  router.get("/projects/:id/checkpoints/:checkpointId/diff", requireProjectAccess, (req, res) => {
    const projectId = param(req, "id");
    const checkpointId = param(req, "checkpointId");
    const proj = db.get<{ workspace_path: string }>("SELECT workspace_path FROM projects WHERE id = ?", [
      projectId,
    ])!;
    try {
      const diffs = checkpoints.diffCheckpointWithWorkspace(
        projectId,
        checkpointId,
        proj.workspace_path,
      );
      res.json({ diffs });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : "Checkpoint not found" });
    }
  });

  router.post("/projects/:id/checkpoints/:checkpointId/rollback", requireProjectAccess, async (req, res) => {
    const projectId = param(req, "id");
    const checkpointId = param(req, "checkpointId");
    const schema = z.object({
      mode: z.enum(["messages_and_code", "messages_only"]).default("messages_and_code"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid rollback mode" });
      return;
    }
    const proj = db.get<{ workspace_path: string }>("SELECT workspace_path FROM projects WHERE id = ?", [
      projectId,
    ])!;
    checkpoints.rollbackToCheckpoint({
      projectId,
      checkpointId,
      workspacePath: proj.workspace_path,
      mode: parsed.data.mode,
    });
    if (parsed.data.mode === "messages_and_code") {
      await sandbox.startProject(projectId, proj.workspace_path);
    }
    res.json({ ok: true });
  });

  router.post("/projects/:id/fork", requireProjectAccess, (req, res) => {
    const schema = z.object({
      name: z.string().min(1).max(100),
      summary: z.string().max(2000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Fork name is required" });
      return;
    }
    const forked = checkpoints.forkProject({
      sourceProjectId: param(req, "id"),
      newName: parsed.data.name,
      summaryOverride: parsed.data.summary,
      userId: req.auth!.user.id,
    });
    res.status(201).json(forked);
  });

  // LLM Provider & 10-Agent Settings (API keys NEVER returned in responses!)
  router.get("/settings/llm-providers", (req, res) => {
    const rows = db.all<{
      id: string;
      provider: LlmProviderDto["provider"];
      label: string;
      base_url: string | null;
      encrypted_api_key: string | null;
      key_hint: string | null;
      default_model: string;
      status: LlmProviderDto["status"];
      created_at: string;
    }>("SELECT * FROM llm_providers WHERE user_id = ? ORDER BY created_at ASC", [req.auth!.user.id]);

    res.json({
      providers: rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        label: r.label,
        baseUrl: r.base_url,
        keyHint: r.key_hint,
        hasApiKey: Boolean(r.encrypted_api_key),
        defaultModel: r.default_model,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  });

  router.post("/settings/llm-providers", (req, res) => {
    const schema = z.object({
      id: z.string().optional(),
      provider: z.enum(["local-blueprint", "openai", "anthropic", "gemini", "openrouter", "openai-compatible"]),
      label: z.string().min(1).max(80),
      baseUrl: z.string().max(240).optional().nullable(),
      apiKey: z.string().max(400).optional(),
      defaultModel: z.string().min(1).max(120),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid LLM provider configuration" });
      return;
    }
    const now = new Date().toISOString();
    const d = parsed.data;
    const hasKey = Boolean(d.apiKey && d.apiKey.trim().length > 0);
    const id = d.id ?? `prov-${d.provider}-${randomUUID().slice(0, 8)}`;

    const existing = db.get<{ encrypted_api_key: string | null; key_hint: string | null }>(
      "SELECT encrypted_api_key, key_hint FROM llm_providers WHERE id = ? AND user_id = ?",
      [id, req.auth!.user.id],
    );

    const encKey = hasKey ? encryptSecret(d.apiKey!.trim()) : existing?.encrypted_api_key ?? null;
    const hint = hasKey ? maskSecretHint(d.apiKey!.trim()) : existing?.key_hint ?? null;
    const status = d.provider === "local-blueprint" || encKey ? "ready" : "requires_key";

    if (existing) {
      db.run(
        `UPDATE llm_providers SET label = ?, base_url = ?, encrypted_api_key = ?, key_hint = ?, default_model = ?, status = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [d.label, d.baseUrl ?? null, encKey, hint, d.defaultModel, status, now, id, req.auth!.user.id],
      );
    } else {
      db.run(
        `INSERT INTO llm_providers (id, user_id, provider, label, base_url, encrypted_api_key, key_hint, default_model, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, req.auth!.user.id, d.provider, d.label, d.baseUrl ?? null, encKey, hint, d.defaultModel, status, now, now],
      );
    }
    res.json({ ok: true, id, status, keyHint: hint });
  });

  router.post("/settings/llm-providers/:providerId/test", async (req, res) => {
    try {
      const result = await llm.testProviderById(req.auth!.user.id, param(req, "providerId"));
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : "Provider not found" });
    }
  });

  router.delete("/settings/llm-providers/:providerId", (req, res) => {
    db.run("DELETE FROM llm_providers WHERE id = ? AND user_id = ? AND provider != 'local-blueprint'", [
      param(req, "providerId"),
      req.auth!.user.id,
    ]);
    res.json({ ok: true });
  });

  router.get("/settings/agents", (req, res) => {
    const rows = db.all<{
      id: string;
      agent_role: AgentRole;
      provider_id: string | null;
      model_name: string;
      system_prompt_override: string | null;
      temperature: number;
      max_iterations: number;
      enabled: number;
      updated_at: string;
    }>("SELECT * FROM agent_configs WHERE user_id = ?", [req.auth!.user.id]);

    const agents: AgentConfigDto[] = rows.map((r) => ({
      id: r.id,
      agentRole: r.agent_role,
      providerId: r.provider_id,
      modelName: r.model_name,
      systemPromptOverride: r.system_prompt_override,
      temperature: r.temperature,
      maxIterations: r.max_iterations,
      enabled: r.enabled === 1,
      updatedAt: r.updated_at,
    }));
    res.json({ agents });
  });

  router.put("/settings/agents/:role", (req, res) => {
    const schema = z.object({
      providerId: z.string().nullable().optional(),
      modelName: z.string().min(1).max(120),
      systemPromptOverride: z.string().max(4000).nullable().optional(),
      temperature: z.number().min(0).max(2).optional(),
      maxIterations: z.number().int().min(1).max(200).optional(),
      enabled: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid agent settings" });
      return;
    }
    const now = new Date().toISOString();
    db.run(
      `UPDATE agent_configs
       SET provider_id = ?, model_name = ?, system_prompt_override = ?, temperature = ?, max_iterations = ?, enabled = ?, updated_at = ?
       WHERE user_id = ? AND agent_role = ?`,
      [
        parsed.data.providerId ?? null,
        parsed.data.modelName,
        parsed.data.systemPromptOverride ?? null,
        parsed.data.temperature ?? 0.2,
        parsed.data.maxIterations ?? 25,
        parsed.data.enabled === false ? 0 : 1,
        now,
        req.auth!.user.id,
        param(req, "role"),
      ],
    );
    res.json({ ok: true });
  });

  router.get("/billing/ledger", (req, res) => {
    const entries = db.all(
      "SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 60",
      [req.auth!.user.id],
    );
    res.json({
      creditsBalance: req.auth!.user.creditsBalance,
      entries,
    });
  });

  return router;
};
