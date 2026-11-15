# AetherForge Studio

**Autonomous AI Full-Stack Software Engineering Studio** integrated with the **REA (`rea-agents` v6.8.0)** reverse-engineering runtime and **Model Context Protocol (`@modelcontextprotocol/client` 2.3.1)**.

---

## Core Capabilities

- **Multi-Agent Engineering Pipeline (10 Specialized Roles):** `supervisor`, `planner`, `uiux`, `frontend`, `backend`, `database`, `integration`, `testing`, `debugging`, and `deployment` orchestrated with real-time SSE execution streaming (`run.started`, `step.started`, `step.completed`, `message.created`, `checkpoint.created`, `run.completed`).
- **Plan First (`⌥P`) vs. Build Direct:** Draft structured architecture plans (entities, endpoints, UI views, acceptance criteria) for user approval, or build and verify end-to-end immediately.
- **Multi-Provider AI Integration:** Built-in deterministic **Local Blueprint Engine** plus AES-256-GCM encrypted adapters for **OpenAI, Anthropic, Google Gemini, OpenRouter, and OpenAI-compatible (Ollama/vLLM)** endpoints with live connection testing (`POST /api/settings/llm-providers/:id/test`).
- **Isolated Sandbox Preview & Reverse Proxy (`/preview/:projectId/*`):** Runs generated apps in isolated subprocesses with resource limits (`prlimit` + V8 memory cap), Desktop/Tablet/Mobile viewport toggles, interactive **Canvas** DOM element selection, live console logs, interactive workspace terminal, and one-click auto-fix.
- **Automated Testing & Debugging Loop:** Runs syntax checks and `node --test` integration suites automatically on builds and on demand from the Workbench, feeding failures into the debugging repair step.
- **Database Persistence & Inspector:** Pure-WASM `sql.js` platform store (zero native compilation—runs on Linux, macOS, Docker, and Android Termux) plus live project database inspection in the Workbench.
- **Checkpoints, Diffs, Rollback & Project Forking:** Disk-backed snapshots on every turn with file-level diffing, `messages_and_code` vs. `messages_only` rollback, and independent project forking.
- **REA Reverse-Engineering Workbench (`/rea`):** Strictly separated from coding tools via `scripts/rea.mjs --json` (`providers`, `doctor`, `inspect-api-contract`, `analyze-javascript-application`, `inspect-web-network-capture`, `environment-build`, `inspect-byte-entropy`).
- **MCP Client & Permission Governance (`/mcp`):** `stdio` and `StreamableHTTP` server discovery and invocation with `read-only`, `standard`, and `restricted` policies.
- **GitHub Integration & `/health`-Verified Deployments:** Local git init/commit/branch plus GitHub API sync gated on explicit confirmation (`confirmDestructive`), and isolated `managed-sandbox` production releases verified with HTTP `200` `/health` probes under `/deployed/:deploymentId/*`.
- **Responsive Mobile & Desktop Web UI:** 16 React 19 + Tailwind CSS v4 routes with dark/light theme persistence, mobile navigation drawer, and responsive 3-panel IDE tab switching.

---

## Quick Start

```bash
# 1. Build root REA runtime (prerequisite for REA Workbench & system-rea MCP)
cd /home/user/rea
npm ci
npm run build

# 2. Install & start AetherForge Studio
cd /home/user/rea/platform
cp .env.example .env
npm install
npm run build
NODE_ENV=production node dist/server/index.js
```

Open `http://localhost:4100` (or the live preview URL in cloud environments).

---

## Documentation Index

- **[Installation Guide](./docs/INSTALLATION.md)** — Linux, macOS, Windows WSL2, and Android Termux setup.
- **[Architecture Reference](./docs/ARCHITECTURE.md)** — System diagram, component ownership, database schema, API routes, and security controls.
- **[Production Deployment Guide](./docs/PRODUCTION_DEPLOYMENT.md)** — Docker Compose, Systemd, Nginx/Caddy reverse proxies with SSE support, database backups, and cloud deployment adapters.
- **[Runbook & Verification Report](./docs/04-runbook-and-verification.md)** — Verification commands, test coverage, and operational notes.
