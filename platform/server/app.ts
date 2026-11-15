import express, { type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import httpProxy from "http-proxy";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CLIENT_DIST_DIR, SERVER_CONFIG } from "./config/env.js";
import type { PlatformDatabase } from "./db/database.js";
import { createAuthMiddleware, param } from "./middleware/auth.js";
import { createAgentRouter } from "./routes/agentRoutes.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createGitHubDeployIntegrationRouter } from "./routes/githubDeployIntegrationRoutes.js";
import { createMcpReaRouter } from "./routes/mcpReaRoutes.js";
import { createPaymentRouter } from "./routes/paymentRoutes.js";
import { createProjectRouter } from "./routes/projectRoutes.js";
import { createSecretRouter } from "./routes/secretRoutes.js";
import { AgentOrchestrator } from "./services/agents/orchestrator.js";
import { CheckpointService } from "./services/checkpoints/checkpoints.js";
import { DeployService } from "./services/deploy/deployService.js";
import { GitHubService } from "./services/github/githubService.js";
import { LlmRouter } from "./services/llm/router.js";
import { McpManager } from "./services/mcp/mcpManager.js";
import { PaymentService } from "./services/payments/paymentService.js";
import { ReaService } from "./services/rea/reaService.js";
import { SandboxRunner } from "./services/sandbox/runner.js";
import { ProjectTestRunner } from "./services/sandbox/testRunner.js";

export interface PlatformContext {
  app: express.Express;
  db: PlatformDatabase;
  sandbox: SandboxRunner;
  tests: ProjectTestRunner;
  checkpoints: CheckpointService;
  orchestrator: AgentOrchestrator;
  mcp: McpManager;
  rea: ReaService;
  github: GitHubService;
  deploy: DeployService;
  payments: PaymentService;
  shutdown: () => Promise<void>;
}

export interface PlatformAppOptions {
  postgresStatus?: {
    configured: boolean;
    connected: boolean;
    error?: string;
  };
}

export const createPlatformApp = (
  db: PlatformDatabase,
  options?: PlatformAppOptions,
): PlatformContext => {
  const app = express();
  app.set("trust proxy", true);

  const sandbox = new SandboxRunner(db);
  const tests = new ProjectTestRunner(db, sandbox);
  const checkpoints = new CheckpointService(db);
  const llm = new LlmRouter(db);
  const mcp = new McpManager(db);
  const rea = new ReaService();
  const github = new GitHubService(db);
  const deploy = new DeployService(db, sandbox);
  const payments = new PaymentService(db);
  const orchestrator = new AgentOrchestrator({ db, llm, sandbox, tests, checkpoints, rea });

  const { resolveSession } = createAuthMiddleware(db);
  const proxy = httpProxy.createProxyServer({ changeOrigin: false, xfwd: true });
  proxy.on("error", (_err, _req, res) => {
    if (res && "writeHead" in res && !res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Target sandbox service unavailable" }));
    }
  });

  app.use(cookieParser());

  // 1. Reverse Proxy for Live Sandbox Previews (mounted BEFORE express.json so request streams stay intact!)
  app.use("/preview/:projectId", (req: Request, res: Response) => {
    const projectId = param(req, "projectId");
    if (req.originalUrl === `/preview/${projectId}`) {
      res.redirect(302, `/preview/${projectId}/`);
      return;
    }
    const auth = resolveSession(req);
    if (!auth) {
      res.status(401).json({ error: "Preview authentication required" });
      return;
    }
    const project = db.get<{ workspace_id: string; owner_id: string }>(
      "SELECT workspace_id, owner_id FROM projects WHERE id = ?",
      [projectId],
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const member = db.get(
      "SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
      [project.workspace_id, auth.user.id],
    );
    if (!member && project.owner_id !== auth.user.id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const state = sandbox.getState(projectId);
    if (!state || state.status !== "running") {
      res
        .status(503)
        .send(
          `<html><body style="font-family:sans-serif;background:#0b1120;color:#e2e8f0;padding:32px;"><h2>Preview Not Running</h2><p>Start the project sandbox or trigger a Build in AetherForge Studio.</p></body></html>`,
        );
      return;
    }
    proxy.web(req, res, { target: `http://127.0.0.1:${state.port}` });
  });

  // 2. Reverse Proxy for Verified Live Deployments
  app.use("/deployed/:deploymentId", (req: Request, res: Response) => {
    const deploymentId = param(req, "deploymentId");
    if (req.originalUrl === `/deployed/${deploymentId}`) {
      res.redirect(302, `/deployed/${deploymentId}/`);
      return;
    }
    const port = deploy.getLivePort(deploymentId);
    if (!port) {
      res.status(404).json({ error: "Live deployment not running" });
      return;
    }
    proxy.web(req, res, { target: `http://127.0.0.1:${port}` });
  });

  // 2b. Stripe Webhook (mounted BEFORE express.json so raw HMAC signature buffer is preserved!)
  app.post(
    "/api/payments/webhooks/stripe",
    express.raw({ type: "application/json", limit: "2mb" }),
    (req: Request, res: Response) => {
      try {
        const raw = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}), "utf8");
        const sig = req.headers["stripe-signature"];
        const result = payments.verifyStripeWebhook(raw, Array.isArray(sig) ? sig[0] : sig);
        res.json(result);
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Invalid webhook signature" });
      }
    },
  );

  // 3. API JSON Middleware & Health
  app.use("/api", express.json({ limit: "8mb" }));

  app.get("/api/health", (_req, res) => {
    const postgresConfigured =
      options?.postgresStatus?.configured ?? Boolean(SERVER_CONFIG.databaseUrl);
    res.json({
      status: "ok",
      service: "AetherForge Studio",
      version: "1.0.0",
      database: {
        engine: "sql.js",
        postgresConfigured,
        postgresConnected: options?.postgresStatus?.connected ?? false,
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api/auth", createAuthRouter(db));
  app.use("/api/projects", createProjectRouter({ db, sandbox, tests, checkpoints, orchestrator }));
  app.use("/api", createAgentRouter({ db, llm, orchestrator, checkpoints, sandbox }));
  app.use("/api", createSecretRouter(db));
  app.use("/api", createMcpReaRouter({ db, mcp, rea }));
  app.use("/api", createPaymentRouter({ db, payments }));
  app.use("/api", createGitHubDeployIntegrationRouter({ db, github, deploy }));

  // 4. Serve built frontend static bundle in production
  if (existsSync(CLIENT_DIST_DIR)) {
    app.use(express.static(CLIENT_DIST_DIR));
    app.get(/^\/(?!api|preview|deployed).*/, (_req, res) => {
      res.sendFile(join(CLIENT_DIST_DIR, "index.html"));
    });
  }

  // Global error safety middleware
  app.use((err: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : "Internal server error";
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  });

  const shutdown = async () => {
    await Promise.all([sandbox.stopAll(), deploy.stopAll(), mcp.closeAll()]);
    db.close();
  };

  return { app, db, sandbox, tests, checkpoints, orchestrator, mcp, rea, github, deploy, payments, shutdown };
};
