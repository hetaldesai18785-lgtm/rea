# AetherForge Studio — Runbook, Security Guarantees & Verification Report

## 1. Starting the Platform

From `/home/user/rea/platform`:

- **Production / Built Preview Server (unified SPA + REST API + Reverse Proxies):**
  ```bash
  npm run build
  NODE_ENV=production node dist/server/index.js
  ```
  Listens on `0.0.0.0:4100` (override with `HOST` and `PORT`). Serves:
  - React 19 + Tailwind v4 SPA across all 16 routes (`/`, `/login`, `/register`, `/projects`, `/projects/:id`, `/templates`, `/integrations`, `/mcp`, `/rea`, `/deployments`, `/settings`, `/billing`, `/admin`, `/docs`, `/terms`, `/privacy`)
  - REST & SSE API under `/api/*`
  - Isolated sandbox preview reverse proxy under `/preview/:projectId/*`
  - Verified live deployment reverse proxy under `/deployed/:deploymentId/*`

- **Development Mode (Backend Watch + Vite HMR):**
  ```bash
  npm run dev        # Express API + Proxies on 0.0.0.0:4100
  npm run dev:client # Vite HMR on 0.0.0.0:5173 (proxies /api, /preview, /deployed to 4100)
  ```

## 2. Environment & Secret Configuration

- Platform state lives in `platform/data/` (ignored by Git): SQLite database (`aetherforge.sqlite`), AES-256-GCM master key (`.master.key` or `AETHERFORGE_MASTER_KEY`), project sandboxes (`workspaces/`), checkpoint snapshots (`snapshots/`), and immutable deployment releases (`deployments/`).
- Optional PostgreSQL storage (`DATABASE_URL`) and external LLM / cloud tokens are configured either via environment variables or encrypted inside the Studio Settings / Project Secrets vault.
- Never commit `.master.key`, `aetherforge.sqlite`, or `.env*` files.

## 3. Verified Security & Isolation Controls

- **Authentication & RBAC:** Scrypt password hashing, SHA-256 hashed HTTP-only session tokens (`SameSite=None; Secure` over HTTPS proxies, `SameSite=Lax` over HTTP), workspace membership authorization on all project/file/secret/checkpoint/preview routes, and admin-only guard on `/api/admin/overview` (HTTP 403 for builder accounts).
- **Encrypted Credential Vault:** AES-256-GCM encryption for LLM keys, GitHub tokens, and separated `preview` vs `production` project secrets. API responses return masked hints only; runtime logs redact matching secret strings; platform LLM/GitHub keys are never forwarded to generated user app sandboxes.
- **Sandbox Containment & Resource Caps:** `resolveContainedPath` enforces realpath canonicalization inside project directories and rejects null bytes, `..` traversal, absolute paths, and escaping symlinks. Preview subprocesses launch in isolated process groups with `prlimit` (`--fsize`, `--core=0`, `--nofile`) and V8 `--max-old-space-size=512`.
- **REA / Coding Separation & Destructive Gates:** REA reverse-engineering capabilities reside exclusively in `ReaService` (`/api/rea/*`) and the `system-rea` MCP server (`read-only` / `standard` / `restricted` policies). Remote GitHub repo creation, pushes, PR creation, and deployment deletion require explicit `confirmDestructive` / confirmation flags.

## 4. Automated & Live Verification Summary

- `platform`:
  - `npm run typecheck` (`tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.client.json --noEmit`): passed (`0` errors)
  - `npm run build` (server TypeScript emit + Vite production bundle of `1661` modules): passed
  - `npm test` (Vitest across `security-and-auth.test.ts`, `ai-codegen-sandbox-checkpoints.test.ts`, `rea-mcp-github-deploy.test.ts`): `3` files / `7` real end-to-end tests passed (`100%`)
- `rea` repository:
  - `npm run typecheck`: passed
  - `npm run verify:architecture-guards`: passed (`2540` files)
  - `npm run verify:module-boundaries`: passed (`3835` files)
