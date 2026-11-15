# Phase 2 — Clean-Room Product Research: Emergent Workflows (`emergent.sh` / `help.emergent.sh`)

> **Clean-Room Notice:** All observations below are derived strictly from publicly accessible documentation on `https://emergent.sh`, `https://app.emergent.sh/landing/`, and `https://help.emergent.sh` fetched on 2026-11-14. No proprietary source code, private APIs, authentication controls, or paywalls were accessed or bypassed. Our platform implements an independent, original architecture inspired by these observable user workflows.

---

## Research Matrix by Observable Workflow

### 1. Public Landing & Authentication Entry (`https://app.emergent.sh/landing/`)
- **Feature Description:** Conversational prompt-first entry framed around "Describe your idea" -> full-stack web & mobile apps with backend, database, auth, hosted deployment, and user-owned code; auth entry supports Google, Apple, Facebook, Email, Phone, and SSO.
- **User Interaction Flow:** User arrives on landing page -> previews sample radial showcases -> clicks auth method -> lands on prompt composer / home dashboard.
- **Technical Architecture Hypothesis:** Public marketing shell separating unauthenticated SSR/static assets (`assets.emergent.sh`) from authenticated app workspace (`app.emergent.sh`), backed by OAuth/OIDC + email/OTP identity service issuing session tokens.
- **Supporting Evidence:** Fetched `https://app.emergent.sh/landing/` (hero prompt tagline, auth buttons, ToS/Privacy links).
- **Confidence Level:** **High** (directly observed HTML/text).
- **Implementation Requirements:** Original responsive landing page (`/`) + `/login` & `/register` with real password hashing, session cookies, and clear onboarding flow.

### 2. App-Type Composer & Plan vs Build Switcher (`https://help.emergent.sh/`, `/talk-it-through`)
- **Feature Description:** Home composer presents app type selectors (`Full Stack App`, `Mobile App`, `Landing Page`, `Brainstorm`) and a **Build / Plan switcher** (`Alt+P`). In `Plan` mode, the agent emits an interactive **Plan Proposal Card** with **Request changes** or **Looks good, let's build it** before generating code.
- **User Interaction Flow:** Select app type -> choose `Plan` or `Build` -> type prompt (plus optional screenshots/CSVs/specs) -> review & iterate plan -> approve to start build.
- **Technical Architecture Hypothesis:** Project creation endpoint stores `appType`, `mode`, initial prompt, and attachments, triggering a Planner step that yields a structured plan artifact and pauses state machine until user approval signal resumes execution.
- **Supporting Evidence:** `https://help.emergent.sh/` ("Where you start"), `https://help.emergent.sh/talk-it-through` ("Plan mode: see the plan before any code").
- **Confidence Level:** **High** (explicitly documented UI controls and state transitions).
- **Implementation Requirements:** `/projects/new` + workspace composer with app-type selector (`Full Stack`, `Web App`, `REST API`, `Mobile Expo`, `Landing Page`), `Plan / Build` toggle, structured Plan Proposal Card, and approval/revision cycle.

### 3. Autonomous Agent Loop, Subagents & Stop Reasons (`/how-the-agent-runs-workflow-stop-reasons`, `/custom-agents`)
- **Feature Description:** Durable long-lived agent workflow executing a **Reason -> Act -> Observe -> Repeat** loop with specialized subagents (**Testing subagent**, **Design subagent**, **Review subagent**), explicit **stop reasons** (`end_turn`, `handoff`, `context_overflow`, `max_iterations`, `insufficient_credits`, `error`), Auto-HITL vs user clarification, and real-time step/subagent/credit indicators.
- **User Interaction Flow:** User sends prompt -> sees live streamed phases (Planning, Scaffolding, Implementation, Testing) + expandable subagent tool-call logs + cancel control -> receives completion summary and active preview.
- **Technical Architecture Hypothesis:** Durable workflow/state-machine orchestrator invoking specialized prompt+tool sub-agents (`Planner`, `UI/UX`, `Frontend`, `Backend`, `Database`, `Integration`, `Testing`, `Debugging`, `Deployment`, `Supervisor`) with persisted event log streamed over SSE/WebSockets to the workspace chat panel.
- **Supporting Evidence:** `https://help.emergent.sh/how-the-agent-runs-workflow-stop-reasons`, `https://help.emergent.sh/custom-agents`, `https://help.emergent.sh/watch-your-app-come-alive`.
- **Confidence Level:** **High** (explicitly documented loop, stop reasons, iteration/time bounds, and subagents).
- **Implementation Requirements:** Persisted multi-agent run ledger, 10 specialized agents + Supervisor orchestrator, structured tool call stream, stop reason tracking, cancellation, Auto-HITL toggle, and step/token/credit meters.

### 4. Workspace Layout, Live Preview & Canvas Edit (`/a-tour-of-the-workspace`, `/make-it-yours`, `/try-it-before-you-share-it`)
- **Feature Description:** Workspace integrates persistent Chat, live auto-refreshing Preview (Desktop/Tablet/Mobile viewport toggles, open-in-new-tab, Canvas element-selection edit, screenshot/console error reporting), Code Explorer/Editor/Terminal, Database Viewer, Secrets panel, GitHub controls, and Publish controls.
- **User Interaction Flow:** Agent updates files -> isolated preview server restarts/reloads -> user tests forms/routes across viewports -> clicks element or copies console error -> requests conversational fix -> re-tests.
- **Technical Architecture Hypothesis:** Per-project isolated runtime environment serving dev server through authenticated reverse proxy (`*.emergent.host` / sandbox preview route); frontend studio polls or subscribes via SSE/WebSocket for file/process/preview readiness events; optional postMessage bridge captures runtime console/DOM errors back into IDE Debugging Agent.
- **Supporting Evidence:** `https://help.emergent.sh/a-tour-of-the-workspace`, `https://help.emergent.sh/make-it-yours`, `https://help.emergent.sh/try-it-before-you-share-it`.
- **Confidence Level:** **High** (layout and preview-vs-production isolation explicitly documented).
- **Implementation Requirements:** 3-panel IDE (`/projects/:id/workspace`) with Chat/Tasks/Agents left panel, reverse-proxied Preview + viewport switcher + element selector/error bridge in center, and Explorer/Code Editor/Terminal/Logs/Problems/DB Viewer/API Tester on right.

### 5. Isolated Agent Environments (`https://emergent.sh/blog/real-environments-for-ai-agents-and-why-we-bet-on-kubernetes`)
- **Feature Description:** Real isolated OS/filesystem/process execution per project (node/python/DB/code server/live preview over reverse proxy) instead of browser-only mocks, ensuring generated apps run real databases, builds, tests, and servers.
- **User Interaction Flow:** Transparent to user; agent runs package installs, DB migrations, build pipelines, and test suites inside the project's isolated workspace directory/process group.
- **Technical Architecture Hypothesis:** Multi-tenant containerized/sandboxed workspace manager in production (K8s/container pods), with process-group, directory-containment, sanitized env, and `prlimit`/resource-bounded subprocess execution locally when container daemon is unavailable.
- **Supporting Evidence:** Emergent engineering blog post (March 3, 2026) comparing VMs, browser sandboxes, microVMs, and K8s pods.
- **Confidence Level:** **High** (first-party architecture blog).
- **Implementation Requirements:** Sandboxed workspace runner (`SandboxRunner`) isolating project cwd, sanitizing env vars (zero platform secrets leaked), enforcing Linux resource ceilings (`prlimit` / timeouts / output caps), and cleaning up process groups cleanly.

### 6. Checkpoints, Rollback & Forking (`/checkpoints-undo-anything`)
- **Feature Description:** Automatic per-turn checkpoints saving source tree + dependencies + env config + DB schema; users can **Rollback** (messages + code, or messages only) or **Fork** into a new independent project with editable conversation summary and copied files/data.
- **User Interaction Flow:** User clicks checkpoint/rollback on timeline -> previews impact -> confirms revert; or clicks Fork -> edits summary -> launches independent job.
- **Technical Architecture Hypothesis:** Content-addressed snapshots or git commits tagged per agent turn ID in project storage, paired with DB snapshot/schema dump and job-cloning API.
- **Supporting Evidence:** `https://help.emergent.sh/checkpoints-undo-anything` (exact matrix of what rollback/fork includes and excludes).
- **Confidence Level:** **High**.
- **Implementation Requirements:** Git/snapshot-backed checkpoint engine (`CheckpointService`), turn-level checkpoint timeline, diff preview, rollback (messages+code or messages-only), and project fork endpoint (`/projects/:id/history`).

### 7. MCP Connectors & Extensibility (`/mcps-connectors`, `/custom-agents`)
- **Feature Description:** Native MCP support: both consuming external MCP servers (`mcpServers` JSON stdio or HTTP URL, tool schema discovery/caching, health verify) and exposing platform MCP tools; explicit separation between `private` workspace MCPs and `public` admin-registered MCPs.
- **User Interaction Flow:** Open MCP settings -> enter name, description, `command`/`args`/`env` or endpoint -> click **Verify and Save** -> inspected tools become callable by agents according to permission policy.
- **Technical Architecture Hypothesis:** Platform hosts an MCP Client Manager (`@modelcontextprotocol/client`) connecting stdio/HTTP MCP servers, caching `tools/list` JSON schemas, enforcing permission gates before `tools/call`, and surfacing REA's 246 RE tools in an isolated RE capability registry separate from code-gen tools.
- **Supporting Evidence:** `https://help.emergent.sh/mcps-connectors`, `https://help.emergent.sh/custom-agents`.
- **Confidence Level:** **High**.
- **Implementation Requirements:** `/mcp` Explorer + `McpManager` integrating `@modelcontextprotocol/client`, auto-registering built-in REA MCP (`node ../scripts/rea.mjs mcp`) + custom user MCP servers, schema viewer, test invoker, and RE-vs-coding tool separation policy.

### 8. GitHub Sync, Secrets & Preview-vs-Production Deployment (`/put-your-app-live`, `/database-mongodb`, `/save-to-github`)
- **Feature Description:**
  - **GitHub:** Connect account -> Save/push to new or existing repository & branch -> pull/import repositories -> create PRs with automated review checks.
  - **Secrets:** Separate **Preview** secrets and **Production** secrets, encrypted at rest, never echoed in chat/logs; Universal multi-provider LLM routing option alongside user provider keys.
  - **Publish / Re-publish / Replace:** Preview runs separately and sleeps on inactivity; **Publish** builds production artifacts, runs health checks, assigns permanent URL; **Re-publish** updates code preserving prod DB; **Replace** performs blue-green job swap; **Shutdown** takes app offline without deleting project/DB.
- **User Interaction Flow:** Configure secrets -> verify preview -> connect GitHub -> push -> click Publish -> monitor build & health probe -> confirm live URL -> later Re-publish or Rollback/Shutdown.
- **Technical Architecture Hypothesis:** GitHub REST/OAuth + git CLI/isomorphic-git adapter; AES-256-GCM encrypted secrets table scoped by `(projectId, environment: 'preview'|'production')`; pluggable Deployment Provider interface requiring confirmed HTTP health verification before reporting `live`.
- **Supporting Evidence:** `https://help.emergent.sh/put-your-app-live`, `https://help.emergent.sh/database-mongodb`, `https://help.emergent.sh/a-tour-of-the-workspace`, `https://emergent.sh/glossary/github-integration`.
- **Confidence Level:** **High**.
- **Implementation Requirements:** `/github`, `/projects/:id/secrets`, `/integrations`, `/deployments` implementing real GitHub REST/git operations (with explicit destructive confirmation gates), encrypted Preview/Production secrets, Verified Local Production Sandbox deployment + real cloud provider adapter interfaces (Vercel/Netlify/Fly/Railway/Render/Docker) that accurately report missing provider credentials rather than simulating fake cloud deploys.
