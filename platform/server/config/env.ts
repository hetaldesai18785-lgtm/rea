import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const findPlatformRoot = (startDir: string): string => {
  let cursor = startDir;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(cursor, "package.json"))) {
      return cursor;
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return resolve(startDir, "../..");
};
export const PLATFORM_ROOT = findPlatformRoot(here);
export const REPO_ROOT = resolve(PLATFORM_ROOT, "..");
export const DATA_ROOT = resolve(process.env.AETHERFORGE_DATA_DIR ?? join(PLATFORM_ROOT, "data"));
export const WORKSPACES_ROOT = resolve(join(DATA_ROOT, "workspaces"));
export const SNAPSHOTS_ROOT = resolve(join(DATA_ROOT, "snapshots"));
export const DEPLOYMENTS_ROOT = resolve(join(DATA_ROOT, "deployments"));
export const DB_FILE_PATH = resolve(process.env.AETHERFORGE_DB_PATH ?? join(DATA_ROOT, "aetherforge.sqlite"));
export const REA_CLI_SCRIPT = resolve(REPO_ROOT, "scripts/rea.mjs");
export const CLIENT_DIST_DIR = resolve(PLATFORM_ROOT, "dist/client");

export const ensurePlatformDirectories = (): void => {
  for (const dir of [DATA_ROOT, WORKSPACES_ROOT, SNAPSHOTS_ROOT, DEPLOYMENTS_ROOT]) {
    mkdirSync(dir, { recursive: true });
  }
};

const loadOrCreateMasterKey = (): Buffer => {
  ensurePlatformDirectories();
  const envKey = process.env.AETHERFORGE_MASTER_KEY;
  if (envKey && envKey.trim().length >= 32) {
    return Buffer.from(envKey.trim(), "utf8").subarray(0, 32);
  }
  const keyFile = join(DATA_ROOT, ".master.key");
  if (existsSync(keyFile)) {
    const hex = readFileSync(keyFile, "utf8").trim();
    if (/^[0-9a-f]{64}$/i.test(hex)) {
      return Buffer.from(hex, "hex");
    }
  }
  const generated = randomBytes(32);
  writeFileSync(keyFile, generated.toString("hex"), { mode: 0o600 });
  return generated;
};

export const SERVER_CONFIG = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number.parseInt(process.env.PORT ?? "4100", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: process.env.DATABASE_URL ?? null,
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  cookieName: "af_session",
  masterKey: loadOrCreateMasterKey(),
  maxIterationCap: Number.parseInt(process.env.AETHERFORGE_MAX_ITERATIONS ?? "40", 10),
  maxBuildTimeoutMs: Number.parseInt(process.env.AETHERFORGE_BUILD_TIMEOUT_MS ?? "180000", 10),
  sandboxBasePort: Number.parseInt(process.env.AETHERFORGE_SANDBOX_BASE_PORT ?? "4600", 10),
  deployBasePort: Number.parseInt(process.env.AETHERFORGE_DEPLOY_BASE_PORT ?? "5600", 10),
} as const;
