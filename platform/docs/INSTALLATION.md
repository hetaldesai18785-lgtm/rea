# Installation Guide — AetherForge Studio

## System Requirements
- **Node.js:** `v20.18+` or `v22.x` LTS (tested on `v22.22.3`)
- **npm:** `v10+`
- **Git:** `v2.30+`
- **Optional:** Python 3.11+ (for FastAPI generated scaffolds), Docker Engine (for container builds)

> **Android Termux Compatibility:** AetherForge Studio uses pure-WASM `sql.js` instead of `better-sqlite3` native bindings, so zero C++ native compilation or `node-gyp` downloads are required.

---

## 1. Linux / macOS / Windows WSL2 Installation

```bash
# Clone the repository (or use existing checkout)
git clone https://github.com/hetaldesai18785-lgtm/rea.git
cd rea

# Step 1: Install & build the root REA runtime (needed for /rea and system-rea MCP)
HUSKY=0 npm ci --engine-strict=false
npm run build
npm run mcp-catalog:generate

# Step 2: Install & build AetherForge Studio
cd platform
cp .env.example .env
npm install
npm run typecheck
npm run build

# Step 3: Start production server on 0.0.0.0:4100
NODE_ENV=production node dist/server/index.js
```

---

## 2. Android Termux Installation

```bash
# Inside Termux
pkg update && pkg upgrade -y
pkg install -y nodejs-lts git

# Clone repository
git clone https://github.com/hetaldesai18785-lgtm/rea.git
cd rea

# Build root REA runtime
HUSKY=0 npm ci --engine-strict=false
npm run build
npm run mcp-catalog:generate

# Install & start AetherForge Studio
cd platform
cp .env.example .env
npm install
npm run build
NODE_ENV=production node dist/server/index.js
```

Open **`http://localhost:4100`** in Chrome on your Android phone.

---

## 3. Development Mode (Hot Module Reloading)

Run backend watch mode and Vite HMR dev server in two terminals:

```bash
# Terminal 1 — Express API & Reverse Proxies (:4100)
cd platform && npm run dev

# Terminal 2 — Vite + React 19 + Tailwind v4 (:5173 -> proxies /api, /preview, /deployed to 4100)
cd platform && npm run dev:client
```

---

## 4. Running Automated Tests

```bash
cd platform
npm run typecheck
npm test
```
