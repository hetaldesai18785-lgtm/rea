import { randomUUID } from "node:crypto";
import type {
  AgentRole,
  MarketplaceIntegrationDto,
  TemplateDto,
} from "../../shared/types.js";
import type { PlatformDatabase } from "./database.js";
import { encryptSecret, maskSecretHint } from "../crypto/security.js";

export const DEFAULT_TEMPLATES: TemplateDto[] = [
  {
    id: "tpl-saas-tasks",
    title: "SprintFlow SaaS Workspace",
    category: "SaaS & Productivity",
    appType: "fullstack",
    description:
      "Full-stack issue & sprint board with persistent database, priority/status filtering, search, inline analytics, and REST OpenAPI spec.",
    stackFrontend: "React + TypeScript + Tailwind",
    stackBackend: "Node.js + Express/HTTP",
    stackDatabase: "SQLite / FileStore",
    prompt:
      "Build a full-stack team task & sprint workspace app where users can create tasks with title, description, assignee, priority (low/medium/high), and status (todo/in_progress/done), filter by status and priority, search tasks, view completion metrics, and persist all items in the database.",
    tags: ["Full Stack", "CRUD", "REST API", "Dashboard"],
  },
  {
    id: "tpl-crm-pipeline",
    title: "PulseCRM Pipeline",
    category: "CRM & Sales",
    appType: "fullstack",
    description:
      "Deal pipeline, customer accounts, contact notes, revenue forecasting KPIs, and automated follow-up reminders.",
    stackFrontend: "React + TypeScript + Tailwind",
    stackBackend: "Node.js + Express/HTTP",
    stackDatabase: "SQLite / FileStore",
    prompt:
      "Build a modern CRM pipeline app where sales teams track leads and deals with company, contact email, deal value, stage (lead/qualified/proposal/won), and notes, including stage filtering and total pipeline value metrics.",
    tags: ["CRM", "Pipeline", "B2B"],
  },
  {
    id: "tpl-inventory-api",
    title: "StockLedger Inventory & API",
    category: "Operations & APIs",
    appType: "fullstack",
    description:
      "Warehouse stock tracker with SKU management, low-stock alerts, supplier logs, and documented OpenAPI endpoints.",
    stackFrontend: "React + TypeScript + Tailwind",
    stackBackend: "Node.js + Express/HTTP",
    stackDatabase: "SQLite / FileStore",
    prompt:
      "Build an inventory management web app and REST API where operators add products with SKU, name, category, quantity, reorder threshold, and price, highlight low-stock items, and adjust stock quantities.",
    tags: ["Inventory", "OpenAPI", "Operations"],
  },
  {
    id: "tpl-expense-ledger",
    title: "ClearBooks Expense Tracker",
    category: "Finance",
    appType: "fullstack",
    description:
      "Expense logger with category budgets, monthly burn breakdown, receipt notes, and CSV-ready ledger views.",
    stackFrontend: "React + TypeScript + Tailwind",
    stackBackend: "Node.js + Express/HTTP",
    stackDatabase: "SQLite / FileStore",
    prompt:
      "Build an expense tracker app where users log expenses with title, amount, category, date, and status, filter by category, and view monthly spend totals.",
    tags: ["Finance", "Analytics", "Forms"],
  },
  {
    id: "tpl-mobile-habits",
    title: "DailyPulse Mobile Tracker (Expo)",
    category: "Mobile (React Native + Expo)",
    appType: "mobile-expo",
    description:
      "Cross-platform iOS/Android Expo starter with FastAPI/Node backend sync, daily streak tracking, and mobile preview.",
    stackFrontend: "React Native + Expo",
    stackBackend: "Python + FastAPI / Node Sync",
    stackDatabase: "SQLite / MongoDB Schema",
    prompt:
      "Build a cross-platform mobile habit tracker with Expo React Native screens for daily check-ins, streak counters, category tags, and a synced REST API backend.",
    tags: ["Expo", "iOS", "Android", "Mobile"],
  },
  {
    id: "tpl-saas-checkout",
    title: "PayForge SaaS Checkout & Orders",
    category: "Payments & Commerce",
    appType: "fullstack",
    description:
      "Full-stack SaaS billing & checkout portal with Stripe/Razorpay webhook verification, persisted order ledger, and customer receipts.",
    stackFrontend: "React + TypeScript + Tailwind",
    stackBackend: "Node.js + Payment Webhooks",
    stackDatabase: "SQLite / FileStore",
    prompt:
      "Build a SaaS order and payment checkout portal with Stripe and Razorpay support, order status tracking, webhook verification, transaction ledger, and CSV export.",
    tags: ["Payments", "Stripe", "Razorpay", "Checkout"],
  },
  {
    id: "tpl-api-service",
    title: "GatewayKit REST & OpenAPI Service",
    category: "Backend APIs",
    appType: "api",
    description:
      "Structured backend API microservice with OpenAPI 3.0 spec, health probes, pagination, validation, and automated tests.",
    stackFrontend: "API Docs & Explorer",
    stackBackend: "Node.js / FastAPI",
    stackDatabase: "SQLite / PostgreSQL Schema",
    prompt:
      "Build a REST API service for managing webhook subscriptions and delivery logs with CRUD endpoints, status filtering, OpenAPI 3.0 contract, and health endpoint.",
    tags: ["REST", "OpenAPI", "Microservice"],
  },
];

export const MARKETPLACE_INTEGRATIONS: MarketplaceIntegrationDto[] = [
  {
    id: "openai",
    name: "OpenAI",
    category: "ai-llm",
    description: "GPT-4o / GPT-4.1 / o-series reasoning and code synthesis.",
    requiredEnvKeys: ["OPENAI_API_KEY"],
    playbookSummary: "Uses server-side bearer auth with streaming chat completions.",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    category: "ai-llm",
    description: "Claude Sonnet / Opus models for architecture and debugging.",
    requiredEnvKeys: ["ANTHROPIC_API_KEY"],
    playbookSummary: "Messages API v1 with tool-use schema validation.",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    category: "ai-llm",
    description: "Gemini 2.5 Pro/Flash multimodal generation and analysis.",
    requiredEnvKeys: ["GEMINI_API_KEY"],
    playbookSummary: "Google AI Studio REST integration.",
  },
  {
    id: "postgres",
    name: "PostgreSQL / Supabase",
    category: "databases",
    description: "Relational persistence, migrations, and row-level policies.",
    requiredEnvKeys: ["DATABASE_URL"],
    playbookSummary: "Connection pooling via pg / Prisma / Drizzle.",
  },
  {
    id: "mongodb",
    name: "MongoDB Atlas",
    category: "databases",
    description: "Document collections with flexible schema migrations.",
    requiredEnvKeys: ["MONGO_URL", "DB_NAME"],
    playbookSummary: "Official MongoDB driver with preview/prod database isolation.",
  },
  {
    id: "oauth-oidc",
    name: "OAuth 2.0 / OIDC Auth",
    category: "auth",
    description: "Social login (Google/GitHub) and Enterprise SSO integration.",
    requiredEnvKeys: ["AUTH_CLIENT_ID", "AUTH_CLIENT_SECRET", "AUTH_CALLBACK_URL"],
    playbookSummary: "Authorization code flow with PKCE and HTTP-only cookies.",
  },
  {
    id: "stripe",
    name: "Stripe Billing",
    category: "payments",
    description: "Checkout sessions, subscriptions, and webhook signature verification.",
    requiredEnvKeys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    playbookSummary: "Idempotent checkout + verified HMAC-SHA256 webhook endpoint.",
  },
  {
    id: "razorpay",
    name: "Razorpay Payments (UPI / Cards)",
    category: "payments",
    description: "Order creation, UPI/Card checkout, and HMAC-SHA256 payment verification.",
    requiredEnvKeys: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
    playbookSummary: "Order API + signed razorpay_order_id|razorpay_payment_id verification.",
  },
  {
    id: "resend",
    name: "Resend / SendGrid Email",
    category: "email-messaging",
    description: "Transactional emails, OTP codes, and notification templates.",
    requiredEnvKeys: ["RESEND_API_KEY", "EMAIL_FROM"],
    playbookSummary: "REST email delivery with retry backoff.",
  },
  {
    id: "s3-storage",
    name: "S3 / R2 Object Storage",
    category: "storage",
    description: "Presigned upload/download URLs for media and artifacts.",
    requiredEnvKeys: ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
    playbookSummary: "Signed direct-to-bucket upload pipeline.",
  },
  {
    id: "posthog",
    name: "PostHog / OpenTelemetry Analytics",
    category: "analytics",
    description: "Product funnel events, latency traces, and error telemetry.",
    requiredEnvKeys: ["ANALYTICS_API_KEY"],
    playbookSummary: "Non-blocking event batching with PII redaction.",
  },
  {
    id: "vercel-deploy",
    name: "Vercel / Netlify / Fly.io",
    category: "hosting",
    description: "Cloud edge and container hosting targets with health verification.",
    requiredEnvKeys: ["DEPLOY_PROVIDER_TOKEN"],
    playbookSummary: "Verified build -> deploy -> HTTP 200 readiness check.",
  },
  {
    id: "github-sync",
    name: "GitHub Repository Sync & PRs",
    category: "devops-github",
    description: "Two-way repository sync, branch creation, commits, and PR reviews.",
    requiredEnvKeys: ["GITHUB_TOKEN"],
    playbookSummary: "Authenticated GitHub API + git with destructive confirmation gates.",
  },
  {
    id: "rea-mcp",
    name: "REA Reverse-Engineering MCP",
    category: "mcp-tools",
    description: "246 reverse-engineering, OpenAPI, AST, browser, and AgentEnv tools.",
    requiredEnvKeys: [],
    playbookSummary: "Pre-wired local stdio MCP bridge with strict RE-vs-coding separation.",
  },
];

export const AGENT_ROLE_DEFAULTS: Array<{
  role: AgentRole;
  title: string;
  description: string;
  defaultPrompt: string;
}> = [
  {
    role: "supervisor",
    title: "Supervisor Agent",
    description: "Coordinates all 9 specialized agents, enforces budgets, checkpoints, and stop conditions.",
    defaultPrompt:
      "Decompose user intent, route subtasks across specialist agents, verify every build/test gate before declaring completion.",
  },
  {
    role: "planner",
    title: "Planner Agent",
    description: "Transforms natural language requirements into architecture plans, schemas, endpoints, and acceptance criteria.",
    defaultPrompt:
      "Produce structured ArchitecturePlan JSON covering data entities, API routes, UI screens, stack choices, and verifiable acceptance tests.",
  },
  {
    role: "uiux",
    title: "UI/UX Design Agent",
    description: "Designs responsive layouts, light/dark color palettes, typography, and accessible interaction flows.",
    defaultPrompt:
      "Ensure clean spacing, WCAG-AA contrast, responsive mobile/tablet/desktop grids, and intuitive form ergonomics.",
  },
  {
    role: "frontend",
    title: "Frontend Agent",
    description: "Builds modular React/Next.js/TypeScript/Tailwind/Expo interfaces with typed API clients.",
    defaultPrompt:
      "Generate clean, state-safe UI components using relative API URLs so apps work seamlessly behind preview proxies and production domains.",
  },
  {
    role: "backend",
    title: "Backend Agent",
    description: "Implements REST/GraphQL endpoints, validation, auth middleware, OpenAPI specs, and health probes.",
    defaultPrompt:
      "Build production REST APIs with explicit validation, structured error responses, /health check, and /openapi.json contract.",
  },
  {
    role: "database",
    title: "Database Agent",
    description: "Creates schemas, migrations, indexes, seed fixtures, and data access layers.",
    defaultPrompt:
      "Design normalized tables/collections with parameterized queries, atomic persistence, and non-destructive migrations.",
  },
  {
    role: "integration",
    title: "Integration Agent",
    description: "Wires GitHub, Stripe, email, auth, and MCP connectors via environment variables.",
    defaultPrompt:
      "Reference credentials solely via process.env; never hardcode or log secrets; surface clear configuration prompts when keys are absent.",
  },
  {
    role: "testing",
    title: "Testing Agent",
    description: "Author and executes automated unit, API, and integration test suites inside the project sandbox.",
    defaultPrompt:
      "Write deterministic automated tests covering health, CRUD lifecycle, validation errors, and persistence; execute and report actual counts.",
  },
  {
    role: "debugging",
    title: "Debugging Agent",
    description: "Inspects build, runtime, console, and failing test diagnostics to apply minimal targeted fixes.",
    defaultPrompt:
      "Diagnose root causes from compiler/runtime/test traces and verify fixes by re-running the failing test suite.",
  },
  {
    role: "deployment",
    title: "Deployment Agent",
    description: "Packages release builds, checks production readiness, deploys, and verifies live HTTP health.",
    defaultPrompt:
      "Never report live status until deployment artifacts build cleanly and the target URL answers healthy HTTP verification.",
  },
];

export const seedUserDefaults = (db: PlatformDatabase, userId: string, workspaceId: string): void => {
  const now = new Date().toISOString();

  // Seed default LLM providers (including built-in Local Blueprint Engine + configurable external providers from env if set)
  const existingProviders = db.all<{ id: string }>(
    "SELECT id FROM llm_providers WHERE user_id = ?",
    [userId],
  );
  if (existingProviders.length === 0) {
    const defaultProviderId = `prov-${randomUUID().slice(0, 8)}`;
    db.run(
      `INSERT INTO llm_providers (id, user_id, provider, label, base_url, encrypted_api_key, key_hint, default_model, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        defaultProviderId,
        userId,
        "local-blueprint",
        "AetherForge Blueprint Engine (Offline / Deterministic)",
        null,
        null,
        null,
        "aether-architect-v1",
        "ready",
        now,
        now,
      ],
    );

    const envPresets: Array<{
      provider: string;
      label: string;
      envVar: string;
      model: string;
      baseUrl: string;
    }> = [
      {
        provider: "openai",
        label: "OpenAI",
        envVar: "OPENAI_API_KEY",
        model: "gpt-4.1",
        baseUrl: "https://api.openai.com/v1",
      },
      {
        provider: "anthropic",
        label: "Anthropic Claude",
        envVar: "ANTHROPIC_API_KEY",
        model: "claude-sonnet-4-5",
        baseUrl: "https://api.anthropic.com/v1",
      },
      {
        provider: "gemini",
        label: "Google Gemini",
        envVar: "GEMINI_API_KEY",
        model: "gemini-2.5-pro",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      },
      {
        provider: "openrouter",
        label: "OpenRouter",
        envVar: "OPENROUTER_API_KEY",
        model: "anthropic/claude-sonnet-4",
        baseUrl: "https://openrouter.ai/api/v1",
      },
    ];

    for (const preset of envPresets) {
      const envKey = process.env[preset.envVar];
      const hasKey = Boolean(envKey && envKey.trim().length > 0);
      db.run(
        `INSERT INTO llm_providers (id, user_id, provider, label, base_url, encrypted_api_key, key_hint, default_model, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `prov-${preset.provider}-${randomUUID().slice(0, 6)}`,
          userId,
          preset.provider,
          preset.label,
          preset.baseUrl,
          hasKey && envKey ? encryptSecret(envKey.trim()) : null,
          hasKey && envKey ? maskSecretHint(envKey) : null,
          preset.model,
          hasKey ? "ready" : "requires_key",
          now,
          now,
        ],
      );
    }

    for (const roleDef of AGENT_ROLE_DEFAULTS) {
      db.run(
        `INSERT INTO agent_configs (id, user_id, agent_role, provider_id, model_name, system_prompt_override, temperature, max_iterations, enabled, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `agcfg-${randomUUID().slice(0, 8)}`,
          userId,
          roleDef.role,
          defaultProviderId,
          "aether-architect-v1",
          roleDef.defaultPrompt,
          0.2,
          25,
          1,
          now,
        ],
      );
    }
  }

  // Seed GitHub connection awareness if GH_TOKEN/GITHUB_TOKEN exists on host
  const existingGh = db.get<{ user_id: string }>(
    "SELECT user_id FROM github_connections WHERE user_id = ?",
    [userId],
  );
  if (!existingGh) {
    const envGh = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    db.run(
      `INSERT INTO github_connections (user_id, username, encrypted_token, token_hint, auth_source, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        null,
        envGh ? encryptSecret(envGh) : null,
        envGh ? maskSecretHint(envGh) : null,
        envGh ? "environment" : "none",
        now,
      ],
    );
  }

  // Seed default built-in REA MCP Server entry for this workspace if not already present
  const existingReaMcp = db.get<{ id: string }>(
    "SELECT id FROM mcp_servers WHERE workspace_id = ? AND scope = 'system-rea'",
    [workspaceId],
  );
  if (!existingReaMcp) {
    db.run(
      `INSERT INTO mcp_servers (id, workspace_id, name, scope, transport, command, args_json, url, encrypted_env_json, permission_mode, status, tools_cache_json, last_verified_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `mcp-rea-${workspaceId.slice(-8)}`,
        workspaceId,
        "REA Reverse-Engineering Runtime",
        "system-rea",
        "stdio",
        "node",
        JSON.stringify(["../scripts/rea.mjs", "mcp"]),
        null,
        null,
        "read-only",
        "disconnected",
        "[]",
        null,
        now,
      ],
    );
  }
};
