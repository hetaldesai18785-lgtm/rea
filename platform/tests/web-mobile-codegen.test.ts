import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "af-web-mobile-"));
process.env.AETHERFORGE_DATA_DIR = tempDir;
process.env.AETHERFORGE_DB_PATH = join(tempDir, "webmobile.sqlite");
process.env.AETHERFORGE_SANDBOX_BASE_PORT = "5250";
process.env.AETHERFORGE_DEPLOY_BASE_PORT = "6250";

const { openPlatformDatabase } = await import("../server/db/database.js");
const { createPlatformApp } = await import("../server/app.js");

describe("Prompt-to-Full-Stack Websites, Mobile Apps (Expo), QR Preview, Brainstorm & LLM File Codegen", () => {
  let ctx: ReturnType<typeof createPlatformApp>;
  let token = "";
  let mockCodegenLlm: ReturnType<typeof createServer>;
  let mockBaseUrl = "";

  beforeAll(async () => {
    mockCodegenLlm = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const bodyRaw = Buffer.concat(chunks).toString("utf8");
        const parsed = bodyRaw ? (JSON.parse(bodyRaw) as { messages?: Array<{ content: string }> }) : {};
        const promptText = parsed.messages?.map((m) => m.content).join("\n") ?? "";
        const isFileRequest = promptText.includes('Output strictly valid JSON: {"summary": string, "files"');
        const content = isFileRequest
          ? JSON.stringify({
              summary: "Generated custom website hero banner asset",
              files: [
                {
                  path: "docs/llm-architecture-notes.md",
                  content: "# Custom LLM Generated Architecture\nVerified safe workspace write.",
                },
                {
                  path: "../../outside-escape.txt",
                  content: "should-never-escape",
                },
              ],
            })
          : JSON.stringify({
              title: "FleetPulse Telemetry Portal",
              summary: "Real-time fleet vehicle tracking portal",
              entityName: "Vehicle",
              plural: "vehicles",
              fields: [
                { name: "title", label: "Vehicle Name", type: "string", required: true },
                { name: "plate", label: "License Plate", type: "string", required: true },
                {
                  name: "status",
                  label: "Status",
                  type: "enum",
                  required: true,
                  options: ["active", "maintenance", "parked"],
                },
              ],
              includeExportCsv: true,
            });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [{ message: { content } }],
            usage: { prompt_tokens: 80, completion_tokens: 140 },
          }),
        );
      });
    });

    await new Promise<void>((resolve) => mockCodegenLlm.listen(0, "127.0.0.1", resolve));
    const addr = mockCodegenLlm.address();
    if (typeof addr === "object" && addr) {
      mockBaseUrl = `http://127.0.0.1:${addr.port}/v1`;
    }

    const db = await openPlatformDatabase(join(tempDir, "webmobile.sqlite"));
    ctx = createPlatformApp(db);

    const reg = await request(ctx.app).post("/api/auth/register").send({
      name: "Mobile & Web Builder",
      email: "mobileweb@aetherforge.test",
      password: "Password!2026",
    });
    token = reg.body.token as string;
  });

  afterAll(async () => {
    await ctx.shutdown();
    await new Promise<void>((resolve) => mockCodegenLlm.close(() => resolve()));
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("generates an Expo React Native mobile app with live mobile simulator, QR SVG, and passing tests", async () => {
    const createRes = await request(ctx.app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "DailyPulse Mobile",
        appType: "mobile-expo",
        autonomyMode: "build",
        initialPrompt: "Build a fitness habit tracker mobile app with daily check-ins and streaks.",
      });
    expect(createRes.status).toBe(201);
    const projectId = createRes.body.project.id as string;
    expect(createRes.body.project.previewRunning).toBe(true);

    // Check generated Expo mobile project files
    const filesRes = await request(ctx.app)
      .get(`/api/projects/${projectId}/files`)
      .set("Authorization", `Bearer ${token}`);
    expect(filesRes.status).toBe(200);
    const paths = (filesRes.body.files as Array<{ path: string }>).map((f) => f.path);
    expect(paths).toContain("mobile/App.tsx");
    expect(paths).toContain("mobile/app.json");
    expect(paths).toContain("mobile/package.json");
    expect(paths).toContain("mobile/src/screens/HomeScreen.tsx");
    expect(paths).toContain("mobile/src/api/client.ts");

    // Check live interactive Mobile Simulator HTML via proxy
    const htmlRes = await request(ctx.app)
      .get(`/preview/${projectId}/`)
      .set("Authorization", `Bearer ${token}`);
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.text).toContain("phone-shell");
    expect(htmlRes.text).toContain("tab-bar");

    // Check QR code SVG & Expo metadata endpoint
    const qrRes = await request(ctx.app)
      .get(`/api/projects/${projectId}/mobile-qr`)
      .set("Authorization", `Bearer ${token}`);
    expect(qrRes.status).toBe(200);
    expect(qrRes.body.svg).toContain("<svg");
    expect(qrRes.body.expUrl).toContain(`exp://`);
    expect(qrRes.body.expoConfig.expo.slug).toBe("habits");
  });

  it("generates a full-stack marketing landing website with pricing, FAQ, and lead capture persistence", async () => {
    const createRes = await request(ctx.app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "CloudMetric Launch",
        appType: "landing",
        autonomyMode: "build",
        initialPrompt: "Build a SaaS landing page with pricing toggle, FAQ, and waitlist capture.",
      });
    expect(createRes.status).toBe(201);
    const projectId = createRes.body.project.id as string;

    const htmlRes = await request(ctx.app)
      .get(`/preview/${projectId}/`)
      .set("Authorization", `Bearer ${token}`);
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.text).toContain("pricing-grid");
    expect(htmlRes.text).toContain("Frequently Asked Questions");

    const createLead = await request(ctx.app)
      .post(`/preview/${projectId}/api/leads`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Acme Cloud", email: "ops@acme.test", status: "new" });
    expect(createLead.status).toBe(201);
    expect(createLead.body.id).toBeTruthy();
  });

  it("supports brainstorm clarify mode, preview error reporting, and safe LLM multi-file synthesis", async () => {
    // Register & attach mock LLM provider to planner & frontend
    const provRes = await request(ctx.app)
      .post("/api/settings/llm-providers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        provider: "openai-compatible",
        label: "Mock Codegen LLM",
        baseUrl: mockBaseUrl,
        defaultModel: "mock-coder-v1",
        apiKey: "sk-mock-codegen-999999",
      });
    const providerId = provRes.body.id as string;

    await request(ctx.app)
      .put("/api/settings/agents/frontend")
      .set("Authorization", `Bearer ${token}`)
      .send({ providerId, modelName: "mock-coder-v1", enabled: true });

    const projRes = await request(ctx.app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Brainstorm & Codegen", appType: "fullstack", autonomyMode: "plan" });
    const projectId = projRes.body.project.id as string;

    // 1. Brainstorm mode
    const clarifyRes = await request(ctx.app)
      .post(`/api/projects/${projectId}/chat`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        prompt: "I want a fleet vehicle maintenance portal with driver alerts.",
        mode: "brainstorm",
      });
    expect(clarifyRes.status).toBe(200);
    expect(clarifyRes.body.assistantMessage.content).toContain("Clarifications");

    // 2. Build using external frontend LLM file synthesis + containment
    const buildRes = await request(ctx.app)
      .post(`/api/projects/${projectId}/chat`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        prompt: "Build the fleet telemetry portal with custom architecture notes.",
        mode: "build",
      });
    expect(buildRes.status).toBe(200);
    expect(buildRes.body.run.status).toBe("completed");

    const filesRes = await request(ctx.app)
      .get(`/api/projects/${projectId}/files`)
      .set("Authorization", `Bearer ${token}`);
    const paths = (filesRes.body.files as Array<{ path: string }>).map((f) => f.path);
    expect(paths).toContain("docs/llm-architecture-notes.md");
    expect(paths.some((p) => p.includes("outside-escape"))).toBe(false);

    // 3. Report preview error and verify Problems list populates
    const errRes = await request(ctx.app)
      .post(`/api/projects/${projectId}/preview/report-error`)
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "Uncaught ReferenceError: demoVar is not defined" });
    expect(errRes.status).toBe(200);

    const sbStatus = await request(ctx.app)
      .get(`/api/projects/${projectId}/preview/status`)
      .set("Authorization", `Bearer ${token}`);
    expect(sbStatus.status).toBe(200);
    expect(sbStatus.body.state.problems.length).toBeGreaterThanOrEqual(1);
  });
});
