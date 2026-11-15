import { Router } from "express";
import { z } from "zod";
import type { PlatformDatabase } from "../db/database.js";
import { createAuthMiddleware, param } from "../middleware/auth.js";
import type { McpManager } from "../services/mcp/mcpManager.js";
import type { ReaService } from "../services/rea/reaService.js";

export const createMcpReaRouter = (deps: {
  db: PlatformDatabase;
  mcp: McpManager;
  rea: ReaService;
}) => {
  const { db, mcp, rea } = deps;
  const router = Router();
  const { requireAuth } = createAuthMiddleware(db);

  router.use(["/mcp", "/rea"], requireAuth);

  // MCP Discovery, Registry, Permissions & Invocation
  router.get("/mcp/servers", (req, res) => {
    res.json({ servers: mcp.listServers(req.auth!.workspaceId) });
  });

  router.post("/mcp/servers", (req, res) => {
    const schema = z.object({
      name: z.string().min(1).max(80),
      scope: z.enum(["public", "private"]).optional(),
      transport: z.enum(["stdio", "http"]),
      command: z.string().max(200).nullable().optional(),
      args: z.array(z.string()).optional(),
      url: z.string().url().nullable().optional(),
      env: z.record(z.string()).optional(),
      permissionMode: z.enum(["read-only", "standard", "restricted"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid MCP configuration" });
      return;
    }
    const server = mcp.registerServer({
      workspaceId: req.auth!.workspaceId,
      name: parsed.data.name,
      scope: parsed.data.scope,
      transport: parsed.data.transport,
      command: parsed.data.command,
      args: parsed.data.args,
      url: parsed.data.url,
      env: parsed.data.env,
      permissionMode: parsed.data.permissionMode,
    });
    res.status(201).json({ server });
  });

  router.post("/mcp/servers/:serverId/connect", async (req, res) => {
    try {
      const server = await mcp.connectAndDiscover(param(req, "serverId"));
      res.json({ server });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : "Failed to connect MCP server" });
    }
  });

  router.patch("/mcp/servers/:serverId/permissions", (req, res) => {
    const schema = z.object({ permissionMode: z.enum(["read-only", "standard", "restricted"]) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid permission mode" });
      return;
    }
    const server = mcp.updatePermissions(param(req, "serverId"), parsed.data.permissionMode);
    res.json({ server });
  });

  router.post("/mcp/servers/:serverId/invoke", async (req, res) => {
    const schema = z.object({
      toolName: z.string().min(1),
      arguments: z.record(z.unknown()).default({}),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "toolName and arguments object required" });
      return;
    }
    try {
      const out = await mcp.invokeTool(param(req, "serverId"), parsed.data.toolName, parsed.data.arguments);
      res.json(out);
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : "Tool execution failed" });
    }
  });

  router.delete("/mcp/servers/:serverId", async (req, res) => {
    try {
      await mcp.deleteServer(param(req, "serverId"));
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Cannot delete server" });
    }
  });

  // Dedicated REA Reverse-Engineering Workbench Routes (Strictly separated from coding tools)
  router.get("/rea/status", async (_req, res) => {
    try {
      const [providers, doctor] = await Promise.all([rea.getProviders(), rea.getDoctor()]);
      res.json({ providers, doctor, catalog: rea.getCatalogSummary() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to inspect REA runtime" });
    }
  });

  router.post("/rea/inspect-api-contract", async (req, res) => {
    const pathParam = String(req.body?.path ?? "");
    if (!pathParam) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    try {
      const evidence = await rea.inspectApiContract(pathParam);
      res.json({ category: "reverse-engineering", evidence });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "REA API contract inspection failed" });
    }
  });

  router.post("/rea/analyze-js", async (req, res) => {
    const pathParam = String(req.body?.path ?? "");
    if (!pathParam) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    try {
      const evidence = await rea.analyzeJavaScriptApp(pathParam);
      res.json({ category: "reverse-engineering", evidence });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "REA JS analysis failed" });
    }
  });

  router.post("/rea/inspect-network", async (req, res) => {
    const pathParam = String(req.body?.path ?? "");
    if (!pathParam) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    try {
      const evidence = await rea.inspectWebNetworkCapture(pathParam);
      res.json({ category: "reverse-engineering", evidence });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "REA capture inspection failed" });
    }
  });

  router.post("/rea/environment-build", async (req, res) => {
    const pathParam = String(req.body?.path ?? "");
    if (!pathParam) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    try {
      const evidence = await rea.buildEnvironmentDryRun(pathParam);
      res.json({ category: "reverse-engineering", evidence });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "REA environment-build failed" });
    }
  });

  router.post("/rea/inspect-entropy", async (req, res) => {
    const pathParam = String(req.body?.path ?? "");
    if (!pathParam) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    try {
      const evidence = await rea.inspectBinaryEntropy(pathParam);
      res.json({ category: "reverse-engineering", evidence });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "REA entropy inspection failed" });
    }
  });

  return router;
};
