# Phase 1 — REA Repository Audit (`hetaldesai18785-lgtm/rea`)

**Audit Date:** 2026-11-14  
**Repository:** `/home/user/rea` (`rea-agents` v6.8.0, branch `arena/78c54640-rea`, base commit `5cafea5ebee71971c0739b0c01863d6c81c7480f`)  
**Runtime Audited Under:** Linux x86_64 (Debian 12), Node `v22.22.3`, npm `10.9.8`, Python `3.11.2`, `git`, `gh` CLI.

---

## 1. Repository Structure & Package Configuration
- **Package Identity (`package.json`, `server.json`):** `rea-agents` (`io.github.morluto/rea`), version `6.8.0`, ESM (`"type": "module"`), Node engine constraint `^22.23.4 || ^24.22.1 || >=26.12.1` enforced via `.npmrc` (`engine-strict=true`). Installed cleanly in sandbox with `HUSKY=0 npm ci --engine-strict=false` (715 packages, lockfile `npm-shrinkwrap.json`).
- **Build & Tooling (`tsconfig.json`, `tsconfig.build.json`, `turbo.json`, `scripts/`):** Strict TypeScript (`NodeNext`, `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`). `npm run build` compiles `src/` into `dist/` and bundles `dist/mcp/` and `dist/cli-runtime/` via Rolldown (`scripts/bundle-runtime.mjs`). `npm run mcp-catalog:generate` produces `.cache/mcp-tool-catalog.json` and `npm run docs:generate` emits `skills/`, `docs/public/product-catalog.json`, `docs/error-contract.schema.json`, and conformance manifests.
- **Architectural Layering (`AGENTS.md`, `docs/architecture.mermaid`, `scripts/lib/module-boundaries.mjs`):** Strict inward dependency graph:
  - `src/domain/` & `src/contracts/` (pure, side-effect free; zero imports from outer layers)
  - `src/application/` & `src/providers/` (shared workflows, narrow ports, cannot construct centralized `Frida`/`Cutter`/`GDB`/`Rizin` managers or import `src/composition/`)
  - `src/composition/` (typed service construction, lazy factories, capability declarations/services, `CapabilityScope` close lifecycle)
  - `src/cli/`, `src/server/`, `src/main/` (transport adapters: Incur CLI, stdio/HTTP MCP server, AgentEnv HTTP server)
- **Automated Guards Verified:**
  - `npm run typecheck`: **PASS**
  - `npm run verify:architecture-guards`: **PASS** across 2,540 source files (`compareUnicodeCodePoints`, `compositeKey`, AST traversal/wrapper guards, `prlimitArgumentVector` ownership)
  - `npm run verify:module-boundaries`: **PASS** across 3,835 source files

## 2. MCP Server & Tools (`src/main.ts`, `src/server/`, `src/contracts/`)
- **Inventory Verified via `docs/public/product-catalog.json` & `rea providers --json`:**
  - **18 tool families**, **246 ordered MCP tools**, and **6 MCP prompts** (`tools_sha256`: `9919fea8...`, `combined_sha256`: `96218385...`).
  - Family distribution: `direct` (41), `enhanced` (15), `native` (33), `artifact` (23), `managed` (7), `firmware` (2), `android` (6), `pcap` (2), `flutter` (2), `frida` (9), `apktool` (2), `jeb` (4), `adb` (24), `browser` (12), `electron` (6), `javascript-runtime` (2), `application` (32), `session` (24).
- **Transports & Startup (`src/main/eagerRuntime.ts`, `src/main/deferredRuntime.ts`, `src/server/http/serveStreamableHttp.ts`):**
  - Default `stdio` MCP transport + opt-in Streamable HTTP (`rea mcp --http` on `/mcp` using `@modelcontextprotocol/server` 2.3.1).
  - Non-loopback HTTP bindings enforce explicit `allowedHosts` allowlists and Host/Origin validation (`serveStreamableHttp.ts`), max concurrent dispatches, and session drain timeouts.
  - Deferred catalog mode validates SHA-256 against `mcp-catalog.json` and materializes `CapabilityScope` lazily on first non-discovery call.
  - Built-in untrusted-content safety markers (`TARGET_CONTENT_RESULT_META`, `UNTRUSTED_CONTENT_INSTRUCTIONS`) isolate target-derived outputs.

## 3. CLI System (`src/cli.ts`, `src/cli/`, `scripts/rea.mjs`)
- Built on `incur` `0.6.1`, exposing **188 primary CLI commands** plus setup/client-registration/diagnostics (`providers`, `doctor`, `capabilities`, `setup`, `update`, `uninstall`, `guidance`, `guided-workflows`).
- Supports `--json`, `--format <toon|json|yaml|md|jsonl>`, `--filter-output`, `--schema`, `--token-count`, `--timings`, and explicit sensitive-value redaction (`explicitSensitiveValues.ts`).
- `scripts/lib/cli-process-environment.mjs` prepares Android/Termux `PLAYWRIGHT_BROWSERS_PATH` and child execution bounds before loading runtime modules.

## 4. Website & Browser Inspection (`src/browser/`, `src/server/registerBrowser*.ts`)
- **CDP Provider (`src/browser/CdpBrowserProvider.ts`):** `list_browser_targets`, `inspect_web_page`, `analyze_web_bundle`, `observe_web_session`, `discover_webmcp_tools`, `compare_web_captures`, `capture_web_screenshot`, `compare_web_screenshots`, plus execution/source-location/network/event-listener tools.
- **Playwright Scenario Provider (`src/browser/PlaywrightBrowserScenarioProvider.ts`):** `capture_browser_scenario` executes structured user journeys (`actions`: navigate, click, fill, wait, etc.) capturing screenshots, DOM snapshots, accessibility trees, URL/history, storage, and network events with explicit completeness tracking.
- **Network Capture History (`src/browser/history/`):** Offline decoders for HAR (`HarCapture.ts`), Fiddler SAZ (`SazCapture.ts`), mitmproxy (`MitmproxyCaptureAdapter.ts`), aioquic QLOG (`QlogCapture.ts`), and Playwright traces (`playwrightTrace`).
- **Sandbox Limitation:** No Chromium/Chrome binary is preinstalled in `/home/user/rea` sandbox (`which chromium google-chrome` empty), so live CDP/Playwright browser launches require installing/pointing to a browser binary, while offline HAR/SAZ/Playwright-trace/bundle analyzers work immediately.

## 5. JavaScript / TypeScript & Bundle Analysis (`src/domain/javascript/`, `src/javascript/`, `src/application/`)
- **AST-Backed Semantic & Static Analysis (`@babel/parser`):** `analyze-javascript-application`, `analyze-web-bundle`, `trace-javascript-semantics`, `trace-web-module-imports`, `trace-web-source-location`, `recover-javascript-sources` (Wakaru), `reconcile-javascript-runtime`, `compare-source-to-bundle`, `compare-javascript-export-shapes`, `compare-application-versions`.
- Runs isolated worker processes (`#javascript-analysis-worker`, `#web-bundle-analysis-worker`) with configurable `--max-heap-mb` and `--analysis-timeout-ms` so huge bundles never OOM the main server.
- Produces explicit semantic nodes, route/endpoint candidates, IPC/ContextBridge bindings, and explicit `unknowns` when dynamic patterns cannot be proven statically.

## 6. Frontend & Backend Discovery (`src/domain/javascript/`, `src/application/desktop/`, `src/application/`)
- Frontend route, event listener (`inspect-web-event-listeners`), DOM, and storage extraction via CDP/Playwright/AST analysis.
- Backend API surface & Electron main/renderer/IPC discovery (`analyze-javascript-application`, `inspect-electron-fuses`, `inspect-electron-page`, `capture-electron-scenario`).
- Application graph projections (`project-android-application-graph`, `project-apple-application-graph`, `project-harmony-application-graph`, `project-managed-application-graph`, `trace-application-feature`).

## 7. API & Endpoint Analysis (`src/application/apiContract/`, `src/domain/apiContract/`)
- **Live Verified on `tests/fixtures/openapi/petstore.json.txt`:** `inspect-api-contract` parsed OpenAPI 3.0.4 into 19 typed `operations` (`api_operation_*`, `operation_key`, HTTP method/path, JSON pointer, `state: "declared"`, `source_coverage`, and explicit `limitations`).
- Also supports GraphQL contract inspection (`GraphqlContractImport.ts`) and `compare-static-and-observed-endpoints` to reconcile declared OpenAPI/static bundle routes against observed browser/HAR traffic.

## 8. Application Behavior & AgentEnv Replay (`src/server/environment/`, `docs/agent-environments.md`)
- **`environment-build` / `environment-export` / `environment-serve` / `environment-compare`:** Converts recorded HAR or `capture_browser_scenario` Evidence into standalone offline **Agent Environments** exposing `/.well-known/agent-env.json`, JSON-RPC `/agentenv`, and MCP `/mcp`.
- Classifies reads (`state` vs `recorded`), writes (`served` vs `withheld` with reason hints), URL template rules, and untrusted-content markings.

## 9. Dependencies & Native/Ecosystem Analyzers
- Direct in-process binary/format readers: PE/COFF/certificates/imports/resources, Mach-O, ELF notes, Go build info, Rust dependencies, IL2CPP metadata, Flutter/Dart AOT, GPU code objects, EVM bytecode (`evmole`), GGUF/safetensors ML models, Python `.pyc`, Erlang BEAM, WASM (`wabt`), `.NET` PE/CLI metadata (`rea-dotnet-static`), Apple `.ips`/plist/keyed archives/Interface Builder, Android APK signatures.
- Git metadata reader (`src/application/ReferenceSourceVcsAdapter.ts`) uses `isomorphic-git` cleanly without spawning unvalidated git shells.

## 10. Code Navigation & Decompilation Providers
- Pluggable deep binary/decompilation adapters (`ghidra`, `ida`, `hopper`, `cutter`, `rizin`, `gdb`, `jadx`, `apktool`, `jeb`, `frida`, `unblob`/`binwalk`) wired through `AnalysisProviderRegistry` & `BinarySession` with deterministic selection and zero silent cross-provider fallback.
- **Sandbox Availability:** External heavy engines (`ghidra`, `ida`, `hopper`, `jadx`, `frida`, `adb`) are unconfigured/absent in this sandbox and reported accurately as unavailable via `rea doctor --json` and `rea providers --json`.

## 11. Runtime Inspection & Process Supervision (`src/process/`, `src/inspector/`)
- **V8 Inspector (`src/inspector/V8InspectorProvider.ts`):** `list-javascript-runtime-targets`, `observe-javascript-runtime`, `reconcile-javascript-runtime` for Node/V8 runtimes.
- **Process Capture & Isolation (`src/process/capture/ProcessHarness.ts`, `src/process/LinuxResourceLimits.ts`):** Bounded PTY execution (`@lydell/node-pty`), filesystem snapshot diffing (`FilesystemSnapshot.ts`), process-tree ownership (`ProcessOwnership*.ts`), sensitive output redaction, and Linux `prlimit` soft/hard ceiling pinning (`BOUNDED_PRODUCER_LIMITS`: 1 GiB AS, 64 MiB fsize, 30s CPU, `--core=0:0`).

## 12. Evidence Collection & Provenance (`src/application/`, `src/server/EvidenceMcpServer.ts`)
- Every REA output conforms to an explicit **Evidence envelope** (`evidence_id`, `subject` + `sha256`, `provider`, `operation`, `normalized_result`, `confidence` [`observed` | `inferred`], `authority`, `limitations`, `locations`, `evidence_links`, `relationship_coverage`).
- Supports `evidence-export` / `evidence-import`, `inspect-analysis-view` paging for oversized graphs, and reconstruction obligation ledgers (`build-reconstruction-obligation-ledger`, `evaluate-reconstruction-coverage`).

## 13. Platform Compatibility & Test Health in This Sandbox
- **Node `v22.22.3`:** Slightly below `package.json`'s `^22.23.4` (`rea doctor` flags this accurately). `sqlite` provider reports `unsupported_version` because `node:sqlite` `DatabaseSync.limits` requires Node `^24.15.0 || >=26.0.0`.
- **Lint (`oxlint`):** Native binary (`crates/oxc_allocator/src/pool/fixed_size.rs:112`) panics (`SIGABRT`) under sandbox container memory/allocator limits. TypeScript (`tsc --noEmit`), architecture guards, and module boundary checks all pass cleanly.
- **Vitest Verified:** `domain` + `composition` ran **518 test files / 10,780 tests**: **517 files (10,776 tests) passed**, 3 skipped, 1 test failed (`src/domain/desktop/appBuild.test.ts`) due to sandbox Python `3.11.2` lacking `TarFile.extractall(filter=...)` (introduced in Python 3.11.4/3.12). `mcp-boundary` passed `idaTransport`, `artifactMcp`, `analysisViewMcp`, `fridaLifecycleMcp`, `providerSelectionMcp`, `sessionAvailabilityRecovery`, `promptMcp`, `toolSchemaValidity`, and `functionComparisonReferenceFactsMcp`.

## 14. Missing Functionality Required for the Autonomous AI Development Platform
REA is a **reverse-engineering, observation, capture, and MCP tool runtime**, NOT a full-stack application builder/IDE. To realize the Emergent-inspired autonomous software platform while reusing REA cleanly, the following capabilities do **not** exist in REA and must be designed & built cleanly in `/home/user/rea/platform/`:
1. **Multi-tenant Auth, RBAC & Project/Task Persistence:** User accounts, scrypt password auth, session cookies/JWT, workspace memberships, persistent DB schema.
2. **Multi-Provider LLM Abstraction & Key Vault:** Unified provider adapters (`OpenAI`, `Anthropic`, `Google Gemini`, `OpenRouter`, `Ollama/OpenAI-compatible`, plus offline deterministic `Local Blueprint Engine`) with server-side encrypted key storage (never exposed to browser).
3. **10-Agent Hierarchical Orchestrator & Workflow Engine:** Persistent turn/step state machine (`Planner`, `UI/UX`, `Frontend`, `Backend`, `Database`, `Integration`, `Testing`, `Debugging`, `Deployment`, `Supervisor`), Plan vs Build gate, Auto-HITL vs interactive clarifications, stop reasons, iteration/credit limits, SSE event streaming.
4. **Full-Stack Code Generation Engine:** Deterministic + LLM-backed scaffolding and incremental patching for React/Vite/TS/Tailwind/shadcn, Next.js, Node/Express, Python/FastAPI, SQLite/PostgreSQL/Mongo/Supabase adapters, React Native/Expo, and Dockerfiles.
5. **Isolated Generated-App Execution & Reverse-Proxied Live Preview:** Per-project isolated working tree, sanitized env, process-group isolation & resource bounds, port allocator, HTTP reverse proxy (`/preview/:projectId/`) rewriting safely for desktop/tablet/mobile/e2b preview frames, plus runtime error bridge.
6. **3-Panel IDE & 16 Platform Pages:** Full responsive light/dark web studio (Chat/Tasks/Agents, Preview/Viewport/Error Capture, Explorer/Editor/Terminal/Logs/Problems/DB Viewer/API Tester, plus Dashboard, REA Workbench, MCP Explorer, GitHub, Integrations Marketplace, Deployments, Templates, History/Checkpoints, Secrets, Agent & Account Settings).
7. **GitHub Integration & Confirmation Workflows:** OAuth/PAT connection, repo CRUD, import/clone, branch/commit/push/pull, PR creation, mandatory confirmation for destructive/remote mutations.
8. **Checkpoints, Rollback & Forking:** Per-turn snapshots (files + messages + metadata), diff comparison, message/code rollback, project forking.
9. **Integrations Marketplace & Deployment Engine:** Categorized connector playbooks, Preview vs Production secret separation, verified deployment providers (Managed Sandbox Production Server + real REST adapters for Vercel/Netlify/Fly/Railway/Render/Cloudflare/Docker with verified HTTP health probes).
10. **Automated Testing & Self-Healing Debug Loop:** Real test runner inside project sandbox + failure trace parser feeding the Debugging Agent for verified green fixes.
