import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "af-build-test-"));
process.env.AETHERFORGE_DATA_DIR = tempDir;
process.env.AETHERFORGE_DB_PATH = join(tempDir, "build.sqlite");
process.env.AETHERFORGE_SANDBOX_BASE_PORT = "4850";
process.env.AETHERFORGE_DEPLOY_BASE_PORT = "5850";

const { openPlatformDatabase } = await import("../server/db/database.js");
const { createPlatformApp } = await import("../server/app.js");

describe("AI Codegen, Plan/Build Workflow, Live Sandbox CRUD, Tests, Checkpoints & Forking", () => {
  let ctx: ReturnType<typeof createPlatformApp>;
  let token: string;

  beforeAll(async () => {
    const db = await openPlatformDatabase(join(tempDir, "build.sqlite"));
    ctx = createPlatformApp(db);
    const reg = await request(ctx.app).post("/api/auth/register").send({
      name: "Builder One",
      email: "builder1@aetherforge.test",
      password: "Password!2026",
    });
    token = reg.body.token as string;
  });

  afterAll(async () => {
    await ctx.shutdown();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("plans, builds a live full-stack app, serves real HTTP CRUD via /preview/:id/, runs tests, modifies, rolls back & forks", async () => {
    // 1. Create project in Plan mode
    const projRes = await request(ctx.app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "SprintFlow Test Board",
        appType: "fullstack",
        autonomyMode: "plan",
      });
    expect(projRes.status).toBe(201);
    const projectId = projRes.body.project.id as string;

    // 2. Request plan proposal
    const planRes = await request(ctx.app)
      .post(`/api/projects/${projectId}/chat`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        prompt: "Build a task and sprint tracker with priority levels, status filters, and persistent database.",
        mode: "plan",
      });
    expect(planRes.status).toBe(200);
    expect(planRes.body.run.stopReason).toBe("plan_pending");
    expect(planRes.body.assistantMessage.plan).toBeTruthy();
    expect(planRes.body.assistantMessage.plan.entities.length).toBeGreaterThan(0);

    const planMsgId = planRes.body.assistantMessage.id as string;

    // 3. Approve plan -> multi-agent full-stack build + sandbox start + automated test run + checkpoint
    const buildRes = await request(ctx.app)
      .post(`/api/projects/${projectId}/messages/${planMsgId}/approve-plan`)
      .set("Authorization", `Bearer ${token}`);
    expect(buildRes.status).toBe(200);
    expect(buildRes.body.run, buildRes.body.run.summary).toMatchObject({ status: "completed" });
    expect(buildRes.body.assistantMessage.checkpointId).toBeTruthy();

    // 4. Verify live preview server works through /preview/:projectId/ proxy (no trailing slash redirects -> 302 -> 200)
    const redirectCheck = await request(ctx.app)
      .get(`/preview/${projectId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(redirectCheck.status).toBe(302);
    expect(redirectCheck.headers.location).toBe(`/preview/${projectId}/`);

    const htmlRes = await request(ctx.app)
      .get(`/preview/${projectId}/`)
      .set("Authorization", `Bearer ${token}`);
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.text).toContain("<!doctype html>");

    // Verify full-stack CRUD through reverse proxy!
    const createItem = await request(ctx.app)
      .post(`/preview/${projectId}/api/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Verify Sandbox Persistence", priority: "high", status: "todo" });
    expect(createItem.status).toBe(201);
    const itemId = createItem.body.id as string;

    const listItems = await request(ctx.app)
      .get(`/preview/${projectId}/api/tasks`)
      .set("Authorization", `Bearer ${token}`);
    expect(listItems.status).toBe(200);
    expect(listItems.body.items.some((i: { id: string }) => i.id === itemId)).toBe(true);

    // Verify DB Inspector shows persisted data
    const dbInspect = await request(ctx.app)
      .get(`/api/projects/${projectId}/db`)
      .set("Authorization", `Bearer ${token}`);
    expect(dbInspect.status).toBe(200);
    expect(dbInspect.body.tables.length).toBeGreaterThan(0);

    // 5. Run automated tests via API
    const testRun = await request(ctx.app)
      .post(`/api/projects/${projectId}/tests/run`)
      .set("Authorization", `Bearer ${token}`);
    expect(testRun.status).toBe(200);
    expect(testRun.body.testRun.status).toBe("passed");
    expect(testRun.body.testRun.passed).toBeGreaterThan(0);

    // 6. Incremental modification -> creates second checkpoint & writes custom file
    const modRes = await request(ctx.app)
      .post(`/api/projects/${projectId}/chat`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        prompt: "Add release notes badge and dueDate field to items",
        mode: "modify",
      });
    expect(modRes.status).toBe(200);

    const cpRes = await request(ctx.app)
      .get(`/api/projects/${projectId}/checkpoints`)
      .set("Authorization", `Bearer ${token}`);
    expect(cpRes.status).toBe(200);
    expect(cpRes.body.checkpoints.length).toBeGreaterThanOrEqual(2);

    const firstCheckpoint = cpRes.body.checkpoints[cpRes.body.checkpoints.length - 1];
    const diffRes = await request(ctx.app)
      .get(`/api/projects/${projectId}/checkpoints/${firstCheckpoint.id}/diff`)
      .set("Authorization", `Bearer ${token}`);
    expect(diffRes.status).toBe(200);

    // 7. Rollback and Fork
    const rbRes = await request(ctx.app)
      .post(`/api/projects/${projectId}/checkpoints/${firstCheckpoint.id}/rollback`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mode: "messages_and_code" });
    expect(rbRes.status).toBe(200);

    const forkRes = await request(ctx.app)
      .post(`/api/projects/${projectId}/fork`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "SprintFlow Forked Copy" });
    expect(forkRes.status).toBe(201);
    expect(forkRes.body.newProjectId).not.toBe(projectId);

    const forkedGet = await request(ctx.app)
      .get(`/api/projects/${forkRes.body.newProjectId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(forkedGet.status).toBe(200);
    expect(forkedGet.body.project.forkedFromProjectId).toBe(projectId);
  });
});
