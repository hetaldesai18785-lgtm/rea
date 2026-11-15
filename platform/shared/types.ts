export type ThemeMode = "dark" | "light";
export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";
export type AppType = "fullstack" | "webapp" | "api" | "mobile-expo" | "landing";
export type AutonomyMode = "build" | "plan";
export type HitlMode = "interactive" | "auto";
export type SecretEnvironment = "preview" | "production";

export type AgentRole =
  | "supervisor"
  | "planner"
  | "uiux"
  | "frontend"
  | "backend"
  | "database"
  | "integration"
  | "testing"
  | "debugging"
  | "deployment";

export type LlmProviderKind =
  | "local-blueprint"
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "openai-compatible";

export type StopReason =
  | "end_turn"
  | "plan_pending"
  | "max_iterations"
  | "insufficient_credits"
  | "handoff"
  | "error"
  | "cancelled";

export type ToolCategory = "coding" | "rea" | "mcp" | "testing" | "deploy";

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: "admin" | "builder";
  theme: ThemeMode;
  creditsBalance: number;
  createdAt: string;
}

export interface ProjectDto {
  id: string;
  workspaceId: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string;
  appType: AppType;
  stackFrontend: string;
  stackBackend: string;
  stackDatabase: string;
  status: "draft" | "planning" | "building" | "running" | "error";
  autonomyMode: AutonomyMode;
  hitlMode: HitlMode;
  activeCheckpointId: string | null;
  forkedFromProjectId: string | null;
  githubRepo: string | null;
  githubBranch: string | null;
  previewRunning?: boolean;
  previewPort?: number | null;
  previewUrl?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArchitecturePlan {
  title: string;
  summary: string;
  domainModel: string;
  appType: AppType;
  stack: {
    frontend: string;
    backend: string;
    database: string;
    testing: string;
    deployment: string;
  };
  entities: Array<{
    name: string;
    tableName: string;
    fields: Array<{ name: string; type: string; required: boolean }>;
  }>;
  apiEndpoints: Array<{
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    description: string;
  }>;
  pages: Array<{ name: string; route: string; purpose: string }>;
  integrations: string[];
  acceptanceCriteria: string[];
}

export interface ChatMessageDto {
  id: string;
  projectId: string;
  runId: string | null;
  role: "user" | "assistant" | "agent" | "system";
  agentRole: AgentRole | null;
  content: string;
  attachments: Array<{ name: string; type: string; size?: number }>;
  plan: ArchitecturePlan | null;
  planStatus: "none" | "pending" | "approved" | "revised";
  checkpointId: string | null;
  createdAt: string;
}

export interface AgentRunDto {
  id: string;
  projectId: string;
  triggerMessageId: string;
  mode: "plan" | "build" | "modify" | "test" | "debug" | "deploy" | "brainstorm";
  status: "queued" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled";
  stopReason: StopReason | null;
  iterationCount: number;
  creditsUsed: number;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
}

export interface AgentStepDto {
  id: string;
  runId: string;
  projectId: string;
  seq: number;
  agentRole: AgentRole;
  action: string;
  toolName: string;
  toolCategory: ToolCategory;
  status: "running" | "completed" | "failed";
  inputSummary: string;
  outputSummary: string;
  durationMs: number;
  createdAt: string;
}

export interface CheckpointDto {
  id: string;
  projectId: string;
  parentId: string | null;
  runId: string | null;
  messageId: string | null;
  label: string;
  summary: string;
  gitCommit: string | null;
  filesCount: number;
  createdAt: string;
}

export interface SecretDto {
  id: string;
  projectId: string;
  environment: SecretEnvironment;
  keyName: string;
  valueHint: string;
  updatedAt: string;
}

export interface LlmProviderDto {
  id: string;
  provider: LlmProviderKind;
  label: string;
  baseUrl: string | null;
  keyHint: string | null;
  hasApiKey: boolean;
  defaultModel: string;
  status: "ready" | "requires_key" | "error";
  createdAt: string;
}

export interface AgentConfigDto {
  id: string;
  agentRole: AgentRole;
  providerId: string | null;
  modelName: string;
  systemPromptOverride: string | null;
  temperature: number;
  maxIterations: number;
  enabled: boolean;
  updatedAt: string;
}

export interface McpServerDto {
  id: string;
  workspaceId: string;
  name: string;
  scope: "system-rea" | "public" | "private";
  transport: "stdio" | "http";
  command: string | null;
  args: string[];
  url: string | null;
  permissionMode: "read-only" | "standard" | "restricted";
  status: "connected" | "disconnected" | "error";
  toolCount: number;
  tools: Array<{
    name: string;
    description?: string;
    category?: string;
    inputSchema?: Record<string, unknown>;
  }>;
  lastVerifiedAt: string | null;
  createdAt: string;
}

export interface DeploymentDto {
  id: string;
  projectId: string;
  provider:
    | "managed-sandbox"
    | "vercel"
    | "netlify"
    | "fly"
    | "railway"
    | "render"
    | "cloudflare"
    | "docker";
  environment: SecretEnvironment;
  checkpointId: string | null;
  status: "building" | "verifying" | "live" | "failed" | "stopped";
  url: string | null;
  healthStatus: "unknown" | "healthy" | "unhealthy";
  healthHttpCode: number | null;
  logsText: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestRunDto {
  id: string;
  projectId: string;
  runId: string | null;
  command: string;
  status: "passed" | "failed" | "error";
  total: number;
  passed: number;
  failed: number;
  outputText: string;
  durationMs: number;
  createdAt: string;
}

export interface TemplateDto {
  id: string;
  title: string;
  category: string;
  appType: AppType;
  description: string;
  stackFrontend: string;
  stackBackend: string;
  stackDatabase: string;
  prompt: string;
  tags: string[];
}

export interface MarketplaceIntegrationDto {
  id: string;
  name: string;
  category:
    | "ai-llm"
    | "databases"
    | "auth"
    | "payments"
    | "email-messaging"
    | "storage"
    | "analytics"
    | "hosting"
    | "devops-github"
    | "mcp-tools";
  description: string;
  requiredEnvKeys: string[];
  playbookSummary: string;
  docsUrl?: string;
}

export interface SandboxStateDto {
  projectId: string;
  port: number;
  pid: number | null;
  status: "starting" | "running" | "stopped" | "error";
  logs: string[];
  problems: Array<{ source: string; message: string; timestamp: string }>;
  startedAt: string | null;
  lastError: string | null;
}

export interface ProjectFileEntry {
  path: string;
  size: number;
  kind: "file";
}

export interface FileDiffDto {
  path: string;
  change: "added" | "modified" | "removed";
}

export interface GitHubConnectionStatus {
  connected: boolean;
  username: string | null;
  tokenHint: string | null;
  authSource: "oauth" | "pat" | "environment" | "none";
}

export interface GitHubRepoDto {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  cloneUrl: string;
}

export type PaymentProviderKind = "stripe" | "razorpay" | "sandbox";

export interface PaymentPackDto {
  id: string;
  name: string;
  credits: number;
  amountCentsUsd: number;
  amountPaiseInr: number;
  description: string;
}

export interface PaymentOrderDto {
  id: string;
  provider: PaymentProviderKind;
  planId: string;
  amountCents: number;
  currency: string;
  creditsGranted: number;
  status: "pending" | "paid" | "failed" | "refunded";
  externalSessionId: string | null;
  externalPaymentId: string | null;
  checkoutUrl: string | null;
  mode: "live" | "sandbox-test";
  createdAt: string;
  updatedAt: string;
}

export interface PaymentProviderStatusDto {
  provider: "stripe" | "razorpay";
  configured: boolean;
  mode: "live" | "sandbox-test";
  keyHint: string | null;
  webhookConfigured: boolean;
}

