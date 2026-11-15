import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Pool } from "pg";
import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from "sql.js";
import { DB_FILE_PATH, ensurePlatformDirectories } from "../config/env.js";

export type SqlParam = string | number | null | Uint8Array;

let sqlStaticPromise: Promise<SqlJsStatic> | null = null;
const getSqlStatic = (): Promise<SqlJsStatic> => {
  if (!sqlStaticPromise) {
    sqlStaticPromise = initSqlJs();
  }
  return sqlStaticPromise;
};

export class PlatformDatabase {
  #db: SqlJsDatabase;
  readonly filePath: string;
  #inTx = false;

  constructor(db: SqlJsDatabase, filePath: string) {
    this.#db = db;
    this.filePath = filePath;
  }

  flush(): void {
    if (this.filePath === ":memory:" || this.#inTx) return;
    const dir = dirname(this.filePath);
    mkdirSync(dir, { recursive: true });
    const data = this.#db.export();
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, Buffer.from(data));
    renameSync(tmp, this.filePath);
  }

  exec(sql: string): void {
    this.#db.exec(sql);
    this.flush();
  }

  run(sql: string, params: SqlParam[] = []): { changes: number } {
    this.#db.run(sql, params);
    const changes = this.#db.getRowsModified();
    this.flush();
    return { changes };
  }

  get<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): T | undefined {
    const stmt = this.#db.prepare(sql);
    try {
      stmt.bind(params);
      if (!stmt.step()) return undefined;
      return stmt.getAsObject() as T;
    } finally {
      stmt.free();
    }
  }

  all<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): T[] {
    const stmt = this.#db.prepare(sql);
    const rows: T[] = [];
    try {
      stmt.bind(params);
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  transaction<T>(fn: () => T): T {
    this.#db.exec("BEGIN IMMEDIATE");
    this.#inTx = true;
    try {
      const result = fn();
      this.#db.exec("COMMIT");
      this.#inTx = false;
      this.flush();
      return result;
    } catch (err) {
      this.#inTx = false;
      try {
        this.#db.exec("ROLLBACK");
      } catch {
        // Ignore rollback failure if connection state changed.
      }
      throw err;
    }
  }

  close(): void {
    this.flush();
    this.#db.close();
  }
}

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'builder',
  theme TEXT NOT NULL DEFAULT 'dark',
  credits_balance INTEGER NOT NULL DEFAULT 1000,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  app_type TEXT NOT NULL DEFAULT 'fullstack',
  stack_frontend TEXT NOT NULL DEFAULT 'React + TypeScript + Tailwind',
  stack_backend TEXT NOT NULL DEFAULT 'Node.js + Express/HTTP',
  stack_database TEXT NOT NULL DEFAULT 'SQLite / FileStore',
  status TEXT NOT NULL DEFAULT 'draft',
  autonomy_mode TEXT NOT NULL DEFAULT 'build',
  hitl_mode TEXT NOT NULL DEFAULT 'auto',
  active_checkpoint_id TEXT,
  forked_from_project_id TEXT,
  github_repo TEXT,
  github_branch TEXT,
  workspace_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS llm_providers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  base_url TEXT,
  encrypted_api_key TEXT,
  key_hint TEXT,
  default_model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_role TEXT NOT NULL,
  provider_id TEXT,
  model_name TEXT NOT NULL,
  system_prompt_override TEXT,
  temperature REAL NOT NULL DEFAULT 0.2,
  max_iterations INTEGER NOT NULL DEFAULT 25,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, agent_role),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  run_id TEXT,
  role TEXT NOT NULL,
  agent_role TEXT,
  content TEXT NOT NULL,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  plan_json TEXT,
  plan_status TEXT NOT NULL DEFAULT 'none',
  checkpoint_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  trigger_message_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  stop_reason TEXT,
  iteration_count INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  summary TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  agent_role TEXT NOT NULL,
  action TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_category TEXT NOT NULL,
  status TEXT NOT NULL,
  input_summary TEXT NOT NULL DEFAULT '',
  output_summary TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_id TEXT,
  run_id TEXT,
  message_id TEXT,
  label TEXT NOT NULL,
  summary TEXT NOT NULL,
  git_commit TEXT,
  snapshot_path TEXT NOT NULL,
  files_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_secrets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  key_name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  value_hint TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, environment, key_name),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'private',
  transport TEXT NOT NULL DEFAULT 'stdio',
  command TEXT,
  args_json TEXT NOT NULL DEFAULT '[]',
  url TEXT,
  encrypted_env_json TEXT,
  permission_mode TEXT NOT NULL DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'disconnected',
  tools_cache_json TEXT NOT NULL DEFAULT '[]',
  last_verified_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_integrations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  integration_id TEXT NOT NULL,
  category TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'requires_credentials',
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, integration_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  checkpoint_id TEXT,
  status TEXT NOT NULL,
  url TEXT,
  health_status TEXT NOT NULL DEFAULT 'unknown',
  health_http_code INTEGER,
  logs_text TEXT NOT NULL DEFAULT '',
  provider_response_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  run_id TEXT,
  command TEXT NOT NULL,
  status TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  output_text TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS github_connections (
  user_id TEXT PRIMARY KEY,
  username TEXT,
  encrypted_token TEXT,
  token_hint TEXT,
  auth_source TEXT NOT NULL DEFAULT 'none',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  encrypted_public_key TEXT,
  encrypted_secret_key TEXT,
  encrypted_webhook_secret TEXT,
  key_hint TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  credits_granted INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  external_session_id TEXT,
  external_payment_id TEXT,
  checkout_url TEXT,
  mode TEXT NOT NULL DEFAULT 'sandbox-test',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_project ON chat_messages(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON agent_steps(run_id, seq);
CREATE INDEX IF NOT EXISTS idx_checkpoints_project ON checkpoints(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id, created_at);
`;

export const verifyPostgresConnection = async (
  databaseUrl: string | null | undefined,
): Promise<{ configured: boolean; connected: boolean; error?: string }> => {
  if (!databaseUrl || !databaseUrl.trim()) {
    return { configured: false, connected: false };
  }
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 3000,
    max: 1,
  });
  try {
    await pool.query("SELECT 1 AS ok");
    return { configured: true, connected: true };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      error: err instanceof Error ? err.message : "PostgreSQL connection failed",
    };
  } finally {
    await pool.end().catch(() => {});
  }
};

export const openPlatformDatabase = async (filePath = DB_FILE_PATH): Promise<PlatformDatabase> => {
  ensurePlatformDirectories();
  const SQL = await getSqlStatic();
  let db: SqlJsDatabase;
  if (filePath !== ":memory:" && existsSync(filePath)) {
    const bytes = readFileSync(filePath);
    db = new SQL.Database(bytes);
  } else {
    db = new SQL.Database();
  }
  const instance = new PlatformDatabase(db, filePath);
  instance.exec(SCHEMA_SQL);
  return instance;
};
