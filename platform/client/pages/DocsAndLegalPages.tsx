import React from "react";
import { AppShell } from "../components/AppShell";

export const DocsPage: React.FC = () => (
  <AppShell title="AetherForge Studio Documentation">
    <div className="mx-auto max-w-4xl space-y-5 text-xs leading-relaxed">
      <section className="rounded-xl af-panel border p-6 space-y-2">
        <h2 className="text-base font-semibold">1. How Prompt-to-Full-Stack Websites & Mobile Apps Work</h2>
        <p className="af-muted">
          Choose an app type on Studio Home (<strong>Full Stack Website</strong>, <strong>Mobile App (Expo)</strong>, <strong>Marketing Landing</strong>, or <strong>Backend API</strong>) and run in <strong>Clarify / Brainstorm</strong>, <strong>Plan First</strong> (<kbd className="rounded border af-border px-1">⌥P</kbd>), or <strong>Build Direct</strong> mode.
        </p>
        <p className="af-muted">
          Our 10-agent orchestrator (Supervisor, Planner, UI/UX, Frontend, Backend, Database, Integration, Testing, Debugging, Deployment) synthesizes a real Node REST backend, OpenAPI 3.0.3 contract, SQLite/JSON persistence, and tailored UI—including multi-screen <strong>Expo React Native</strong> code (<code>mobile/App.tsx</code> + <code>mobile/src/screens/*.tsx</code>) plus an interactive mobile simulator with scannable QR preview!
        </p>
      </section>
      <section className="rounded-xl af-panel border p-6 space-y-2">
        <h2 className="text-base font-semibold">2. Real AI Codegen + Self-Healing Verification</h2>
        <p className="af-muted">
          Configure OpenAI, Anthropic, Gemini, OpenRouter, or a custom OpenAI-compatible model under <strong>Settings</strong> to drive custom domain schema design, multi-file React/Node/Expo generation, and trace-driven bug repair. Every build automatically runs <code>node --check</code> and <code>node --test</code> inside an isolated sandbox before exposing the preview.
        </p>
      </section>
      <section className="rounded-xl af-panel border p-6 space-y-2">
        <h2 className="text-base font-semibold">3. Preview vs Production Isolation & Mobile QR</h2>
        <p className="af-muted">
          Projects execute in isolated subprocesses reverse-proxied at <code>/preview/:projectId/</code>, with automatic iframe runtime error capture and scannable mobile QR links for Expo projects. Production deployments build immutable release bundles under <code>/deployed/:deploymentId/</code> and run mandatory HTTP 200 <code>/health</code> checks before going live.
        </p>
      </section>
      <section className="rounded-xl af-panel border p-6 space-y-2">
        <h2 className="text-base font-semibold">4. Checkpoints, Diffs, Rollback & Forking</h2>
        <p className="af-muted">
          Every autonomous build turn writes a file snapshot. Inspect line/file diffs, roll back either code + messages or messages only, or fork a project into a fresh independent workspace.
        </p>
      </section>
      <section className="rounded-xl af-panel border p-6 space-y-2">
        <h2 className="text-base font-semibold">5. REA Reverse-Engineering & MCP</h2>
        <p className="af-muted">
          Reverse-engineering capabilities live exclusively inside the <strong>REA Workbench</strong> and the <code>system-rea</code> MCP server, separated from app-generation tools and enforced with read-only / standard / restricted permission policies.
        </p>
      </section>
      <section className="rounded-xl af-panel border p-6 space-y-2">
        <h2 className="text-base font-semibold">6. Payment Gateways (Stripe & Razorpay)</h2>
        <p className="af-muted">
          Configure encrypted Stripe (<code>STRIPE_SECRET_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code>) or Razorpay (<code>RAZORPAY_KEY_ID</code>, <code>RAZORPAY_KEY_SECRET</code>) keys in <strong>Billing</strong> or project secrets. Workspace credit top-ups support Stripe Checkout Sessions with raw-buffer HMAC-SHA256 webhook verification (<code>/api/payments/webhooks/stripe</code>), Razorpay INR Orders with HMAC verification (<code>/api/payments/razorpay/verify</code>), and Sandbox Test Mode when keys are absent. Generated apps referencing billing, checkout, or subscriptions automatically include <code>/api/payments/*</code> routes, UI panels, and payment tests.
        </p>
      </section>
    </div>
  </AppShell>
);

export const TermsPage: React.FC = () => (
  <AppShell title="Terms of Service">
    <div className="mx-auto max-w-3xl rounded-xl af-panel border p-6 space-y-3 text-xs leading-relaxed af-muted">
      <h2 className="text-base font-semibold text-inherit">AetherForge Studio Terms of Service</h2>
      <p>
        Generated codebases, database schemas, and deployment bundles inside your workspace belong to you. Destructive actions including remote GitHub repository creation, git pushes, pull requests, and deployment deletion require explicit confirmation.
      </p>
      <p>
        Use the REA Reverse-Engineering Workbench strictly for authorized security auditing, interoperability analysis, and API contract verification within repository boundaries.
      </p>
    </div>
  </AppShell>
);

export const PrivacyPage: React.FC = () => (
  <AppShell title="Privacy & Security">
    <div className="mx-auto max-w-3xl rounded-xl af-panel border p-6 space-y-3 text-xs leading-relaxed af-muted">
      <h2 className="text-base font-semibold text-inherit">Privacy & Credential Security</h2>
      <p>
        API keys, GitHub tokens, and environment secrets stored in AetherForge Studio are encrypted at rest with AES-256-GCM and never returned in plaintext over REST or SSE responses.
      </p>
      <p>
        Passwords are salted and hashed with scrypt, sessions use HMAC/SHA-256 hashed HTTP-only tokens, and sandbox files are strictly contained within each project workspace directory.
      </p>
    </div>
  </AppShell>
);
