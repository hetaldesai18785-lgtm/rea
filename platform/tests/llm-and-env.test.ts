import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "af-llm-test-"));
process.env.AETHERFORGE_DATA_DIR = tempDir;
process.env.AETHERFORGE_DB_PATH = join(tempDir, "llm.sqlite");
process.env.AETHERFORGE_SANDBOX_BASE_PORT = "5050";
process.env.AETHERFORGE_DEPLOY_BASE_PORT = "6050";

const { openPlatformDatabase, verifyPostgresConnection } = await import("../server/db/database.js");
const { createPlatformApp } = await import("../server/app.js");
const { applyLlmDomainBlueprint, buildBlueprintFromPrompt } = await import(
  "../server/services/agents/blueprintCompiler.js"
);
const { PLATFORM_ROOT } = await import("../server/config/env.js");

describe("AI Model Integration, Custom LLM Blueprint Synthesis, Health & Packaging Artifacts", () => {
  let ctx: ReturnType<typeof createPlatformApp>;
  let mockLlmServer: ReturnType<typeof createServer>;
  let mockBaseUrl = "";
  let token = "";

  beforeAll(async () => {
    mockLlmServer = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const bodyRaw = Buffer.concat(chunks).toString("utf8");
        const parsed = bodyRaw ? (JSON.parse(bodyRaw) as { messages?: Array<{ content: string }> }) : {};
        const promptText = parsed.messages?.map((m) => m.content).join("\n") ?? "";

        const content = promptText.includes("Reply with OK")
          ? "OK"
          : JSON.stringify({
              title: "CarePulse Telemedicine Clinic",
              summary: "Patient appointment and triage management suite",
              entityName: "Appointment",
              plural: "appointments",
              fields: [
                { name: "title", label: "Visit Reason", type: "string", required: true },
                { name: "patient_name", label: "Patient Name", type: "string", required: true },
                {
                  name: "status",
                  label: "Status",
                  type: "enum",
                  required: true,
                  options: ["scheduled", "checked_in", "completed"],
                },
                { name: "visit_date", label: "Visit Date", type: "date", required: false },
              ],
              includeExportCsv: true,
            });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [{ message: { content } }],
            usage: { prompt_tokens: 45, completion_tokens: 90 },
          }),
        );
      });
    });

    await new Promise<void>((resolve) => mockLlmServer.listen(0, "127.0.0.1", resolve));
    const addr = mockLlmServer.address();
    if (typeof addr === "object" && addr) {
      mockBaseUrl = `http://127.0.0.1:${addr.port}/v1`;
    }

    const db = await openPlatformDatabase(join(tempDir, "llm.sqlite"));
    ctx = createPlatformApp(db);

    const reg = await request(ctx.app).post("/api/auth/register").send({
      name: "AI Architect",
      email: "ai@aetherforge.test",
      password: "Password!2026",
    });
    token = reg.body.token as string;
  });

  afterAll(async () => {
    await ctx.shutdown();
    await new Promise<void>((resolve) => mockLlmServer.close(() => resolve()));
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("tests an external OpenAI-compatible provider key and drives custom domain schema planning", async () => {
    const addProv = await request(ctx.app)
      .post("/api/settings/llm-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        provider: "openai-compatible",
        label: "Mock Studio LLM",
        baseUrl: mockBaseUrl,
        defaultModel: "mock-architect-7b",
        apiKey: "sk-mock-key-1234567890",
      });
    expect(addProv.status).toBe(200);
    const providerId = addProv.body.id as string;

    const testProv = await request(ctx.app)
      .post(`/api/settings/llm-providers/${providerId}/test`)
      .set("Authorization", `Bearer ${token}`);
    expect(testProv.status).toBe(200);
    expect(testProv.body.ok).toBe(true);
    expect(testProv.body.preview).toContain("OK");

    // Assign custom LLM provider to planner agent
    const setAgent = await request(ctx.app)
      .put("/api/settings/agents/planner")
      .set("Authorization", `Bearer ${token}`)
      .send({
        providerId,
        modelName: "mock-architect-7b",
        enabled: true,
      });
    expect(setAgent.status).toBe(200);

    // Create project & draft Plan -> should reflect LLM-synthesized Appointment entity!
    const projRes = await request(ctx.app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "CarePulse Clinic", appType: "fullstack", autonomyMode: "plan" });
    expect(projRes.status).toBe(201);

    const planRes = await request(ctx.app)
      .post(`/api/projects/${projRes.body.project.id}/chat`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        prompt: "Build a telemedicine clinic scheduling portal with patient visits and CSV export.",
        mode: "plan",
      });
    expect(planRes.status).toBe(200);
    expect(planRes.body.assistantMessage.plan.title).toBe("CarePulse Telemedicine Clinic");
    expect(planRes.body.assistantMessage.plan.entities[0].name).toBe("Appointment");
    expect(
      planRes.body.assistantMessage.plan.entities[0].fields.some(
        (f: { name: string }) => f.name === "patient_name",
      ),
    ).toBe(true);
  });

  it("validates LLM JSON defensively and falls back safely on invalid payloads", () => {
    const base = buildBlueprintFromPrompt("Build an issue tracker", {
      appType: "fullstack",
      stackFrontend: "React",
      stackBackend: "Node",
      stackDatabase: "SQLite",
    });

    expect(applyLlmDomainBlueprint(base, "not valid json").title).toBe(base.title);
    expect(
      applyLlmDomainBlueprint(
        base,
        JSON.stringify({ entityName: "Bad;DROP TABLE", plural: "bad/path" }),
      ).primaryEntity.name,
    ).toBe(base.primaryEntity.name);
  });

  it("exposes database telemetry on /api/health and ships complete env/docker/docs artifacts", async () => {
    const pgCheck = await verifyPostgresConnection(null);
    expect(pgCheck).toEqual({ configured: false, connected: false });

    const health = await request(ctx.app).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body.database.engine).toBe("sql.js");
    expect(health.body.database.postgresConnected).toBe(false);

    const requiredFiles = [
      ".env.example",
      "Dockerfile",
      ".dockerignore",
      "docker-compose.yml",
      "README.md",
      "docs/INSTALLATION.md",
      "docs/ARCHITECTURE.md",
      "docs/PRODUCTION_DEPLOYMENT.md",
      "docs/04-runbook-and-verification.md",
    ];
    for (const rel of requiredFiles) {
      const full = join(PLATFORM_ROOT, rel);
      expect(existsSync(full), `Missing ${rel}`).toBe(true);
      expect(readFileSync(full, "utf8").trim().length).toBeGreaterThan(20);
    }
  });
});
