import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "af-int-test-"));
process.env.AETHERFORGE_DATA_DIR = tempDir;
process.env.AETHERFORGE_DB_PATH = join(tempDir, "int.sqlite");
process.env.AETHERFORGE_SANDBOX_BASE_PORT = "4950";
process.env.AETHERFORGE_DEPLOY_BASE_PORT = "5950";

const { openPlatformDatabase } = await import("../server/db/database.js");
const { createPlatformApp } = await import("../server/app.js");

describe("REA Workbench, MCP Client Discovery & Permissions, GitHub Gates & /health Deployments", () => {
  let ctx: ReturnType<typeof createPlatformApp>;
  let token: string;
  let projectId: string;

  beforeAll(async () => {
    const db = await openPlatformDatabase(join(tempDir, "int.sqlite"));
    ctx = createPlatformApp(db);
    const reg = await request(ctx.app).post("/api/auth/register").send({
      name: "Ops Engineer",
      email: "ops@aetherforge.test",
      password: "Password!2026",
    });
    token = reg.body.token as string;

    const projRes = await request(ctx.app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Deployable App", appType: "fullstack", autonomyMode: "build" });
    projectId = projRes.body.project.id as string;

    await request(ctx.app)
      .post(`/api/projects/${projectId}/chat`)
      .set("Authorization", `Bearer ${token}`)
      .send({ prompt: "Build a clean inventory tracker API and web app", mode: "build" });
  });

  afterAll(async () => {
    await ctx.shutdown();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("isolates REA Workbench and inspects OpenAPI Petstore fixture with structured provenance", async () => {
    const statusRes = await request(ctx.app)
      .get("/api/rea/status")
      .set("Authorization", `Bearer ${token}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.catalog.tools.total).toBeGreaterThanOrEqual(200);

    const apiContractRes = await request(ctx.app)
      .post("/api/rea/inspect-api-contract")
      .set("Authorization", `Bearer ${token}`)
      .send({ path: "tests/fixtures/openapi/petstore.json.txt" });
    expect(apiContractRes.status).toBe(200);
    expect(apiContractRes.body.category).toBe("reverse-engineering");
    expect(JSON.stringify(apiContractRes.body.evidence)).toContain("pet");

    const blocked = await request(ctx.app)
      .post("/api/rea/inspect-api-contract")
      .set("Authorization", `Bearer ${token}`)
      .send({ path: "../../etc/passwd" });
    expect(blocked.status).toBe(400);
  });

  it("discovers real MCP tools on system-rea via @modelcontextprotocol/client and enforces permission modes", async () => {
    const listRes = await request(ctx.app)
      .get("/api/mcp/servers")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const reaServer = listRes.body.servers.find((s: { scope: string }) => s.scope === "system-rea");
    expect(reaServer).toBeTruthy();

    // Connect & discover tools from the real REA stdio MCP server
    const connRes = await request(ctx.app)
      .post(`/api/mcp/servers/${reaServer.id}/connect`)
      .set("Authorization", `Bearer ${token}`);
    expect(connRes.status).toBe(200);
    expect(connRes.body.server.status).toBe("connected");
    expect(connRes.body.server.tools.length).toBeGreaterThan(20);

    // Enforce restricted mode: non-read-only or restricted calls rejected with 403
    await request(ctx.app)
      .patch(`/api/mcp/servers/${reaServer.id}/permissions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ permissionMode: "restricted" });

    const restrictedCall = await request(ctx.app)
      .post(`/api/mcp/servers/${reaServer.id}/invoke`)
      .set("Authorization", `Bearer ${token}`)
      .send({ toolName: "inspect_api_contract", arguments: { path: "tests/fixtures/openapi/petstore.json.txt" } });
    expect(restrictedCall.status).toBe(403);

    // Enforce read-only mode: read-only inspect tool succeeds!
    await request(ctx.app)
      .patch(`/api/mcp/servers/${reaServer.id}/permissions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ permissionMode: "read-only" });

    const mutatingBlocked = await request(ctx.app)
      .post(`/api/mcp/servers/${reaServer.id}/invoke`)
      .set("Authorization", `Bearer ${token}`)
      .send({ toolName: "delete_something", arguments: {} });
    expect(mutatingBlocked.status).toBe(403);
  });

  it("commits locally and rejects unconfirmed remote GitHub pushes", async () => {
    const commitRes = await request(ctx.app)
      .post(`/api/projects/${projectId}/git/commit`)
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "feat: initial verified build", branch: "main" });
    expect(commitRes.status).toBe(200);
    expect(commitRes.body.commitHash).toMatch(/^[0-9a-f]{7,40}$/);

    const unconfirmedPush = await request(ctx.app)
      .post(`/api/projects/${projectId}/git/push`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        repoFullName: "example/repo",
        branch: "main",
        commitMessage: "push without confirmation",
        confirmDestructive: false,
      });
    expect(unconfirmedPush.status).toBe(400);
    expect(unconfirmedPush.body.error).toMatch(/confirmation/i);
  });

  it("deploys isolated production artifact, verifies HTTP 200 /health, serves /deployed/:id/, and supports stop & rollback", async () => {
    const depRes = await request(ctx.app)
      .post(`/api/projects/${projectId}/deploy`)
      .set("Authorization", `Bearer ${token}`)
      .send({ provider: "managed-sandbox", environment: "production" });
    expect(depRes.status).toBe(201);
    const dep = depRes.body.deployment;
    expect(dep.status).toBe("live");
    expect(dep.healthStatus).toBe("healthy");
    expect(dep.healthHttpCode).toBe(200);

    // Verify proxied live deployment serves HTML + /health
    const liveHtml = await request(ctx.app).get(`/deployed/${dep.id}/`);
    expect(liveHtml.status).toBe(200);
    expect(liveHtml.text).toContain("<!doctype html>");

    const liveHealth = await request(ctx.app).get(`/deployed/${dep.id}/health`);
    expect(liveHealth.status).toBe(200);

    // Stop deployment
    const stopRes = await request(ctx.app)
      .post(`/api/deployments/${dep.id}/stop`)
      .set("Authorization", `Bearer ${token}`);
    expect(stopRes.status).toBe(200);
    expect(stopRes.body.deployment.status).toBe("stopped");

    // Rollback / Redeploy
    const rbRes = await request(ctx.app)
      .post(`/api/deployments/${dep.id}/rollback`)
      .set("Authorization", `Bearer ${token}`);
    expect(rbRes.status).toBe(200);
    expect(rbRes.body.deployment.status).toBe("live");
    expect(rbRes.body.deployment.healthHttpCode).toBe(200);
  });
});
