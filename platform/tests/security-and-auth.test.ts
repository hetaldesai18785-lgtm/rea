import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "af-sec-test-"));
process.env.AETHERFORGE_DATA_DIR = tempDir;
process.env.AETHERFORGE_DB_PATH = join(tempDir, "test.sqlite");
process.env.AETHERFORGE_SANDBOX_BASE_PORT = "4750";
process.env.AETHERFORGE_DEPLOY_BASE_PORT = "5750";

const { openPlatformDatabase } = await import("../server/db/database.js");
const { createPlatformApp } = await import("../server/app.js");
const {
  encryptSecret,
  decryptSecret,
  hashPassword,
  verifyPassword,
  redactSensitiveOutput,
  resolveContainedPath,
} = await import("../server/crypto/security.js");

describe("Security, Crypto, Auth, RBAC & Multi-Tenant Isolation", () => {
  let ctx: ReturnType<typeof createPlatformApp>;

  beforeAll(async () => {
    const db = await openPlatformDatabase(join(tempDir, "test.sqlite"));
    ctx = createPlatformApp(db);
  });

  afterAll(async () => {
    await ctx.shutdown();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("encrypts/decrypts AES-256-GCM secrets, hashes passwords, redacts tokens, and blocks path traversal", () => {
    const cipher = encryptSecret("sk-live-super-secret-value-12345");
    expect(cipher).not.toContain("super-secret");
    expect(decryptSecret(cipher)).toBe("sk-live-super-secret-value-12345");

    const hash = hashPassword("StrongPass!2026");
    expect(verifyPassword("StrongPass!2026", hash)).toBe(true);
    expect(verifyPassword("WrongPass", hash)).toBe(false);

    const redacted = redactSensitiveOutput(
      "token=sk-live-super-secret-value-12345",
      ["sk-live-super-secret-value-12345"],
    );
    expect(redacted).not.toContain("sk-live-super-secret-value-12345");
    expect(redacted).toContain("[REDACTED]");

    expect(() => resolveContainedPath(tempDir, "../../etc/passwd")).toThrow();
    expect(() => resolveContainedPath(tempDir, "/etc/shadow")).toThrow();
  });

  it("enforces auth registration, login, secret non-leakage, workspace isolation, and admin RBAC", async () => {
    // Register User A
    const regA = await request(ctx.app).post("/api/auth/register").send({
      name: "Alice Builder",
      email: "alice@aetherforge.test",
      password: "Password!2026",
    });
    expect(regA.status).toBe(201);
    expect(regA.body.user.role).toBe("builder");
    const tokenA = regA.body.token as string;

    // Register User B
    const regB = await request(ctx.app).post("/api/auth/register").send({
      name: "Bob Builder",
      email: "bob@aetherforge.test",
      password: "Password!2026",
    });
    expect(regB.status).toBe(201);
    const tokenB = regB.body.token as string;

    // Wrong password returns 401
    const badLogin = await request(ctx.app).post("/api/auth/login").send({
      email: "alice@aetherforge.test",
      password: "IncorrectPassword",
    });
    expect(badLogin.status).toBe(401);

    // User A creates project & stores secret + LLM key
    const projRes = await request(ctx.app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Alice Private App", appType: "fullstack" });
    expect(projRes.status).toBe(201);
    const projectId = projRes.body.project.id as string;

    const secretPut = await request(ctx.app)
      .put(`/api/projects/${projectId}/secrets`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        environment: "preview",
        keyName: "STRIPE_SECRET_KEY",
        value: "sk_test_51SecretStripeValue998877",
      });
    expect(secretPut.status).toBe(200);

    const secretList = await request(ctx.app)
      .get(`/api/projects/${projectId}/secrets`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(secretList.status).toBe(200);
    expect(JSON.stringify(secretList.body)).not.toContain("sk_test_51SecretStripeValue998877");
    expect(secretList.body.secrets[0].valueHint).toMatch(/••••877/);

    const llmPost = await request(ctx.app)
      .post("/api/settings/llm-providers")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        provider: "openai",
        label: "Test OpenAI",
        defaultModel: "gpt-4.1",
        apiKey: "sk-proj-secret-openai-99112233",
      });
    expect(llmPost.status).toBe(200);

    const llmGet = await request(ctx.app)
      .get("/api/settings/llm-providers")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(JSON.stringify(llmGet.body)).not.toContain("sk-proj-secret-openai-99112233");

    // Multi-tenant isolation: User B cannot access User A's project, files, secrets, or preview
    const bProj = await request(ctx.app)
      .get(`/api/projects/${projectId}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(bProj.status).toBe(403);

    const bSecrets = await request(ctx.app)
      .get(`/api/projects/${projectId}/secrets`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(bSecrets.status).toBe(403);

    const bPreview = await request(ctx.app)
      .get(`/preview/${projectId}/`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(bPreview.status).toBe(403);

    // Path traversal blocked on project file endpoint
    const traversal = await request(ctx.app)
      .get(`/api/projects/${projectId}/file?path=../../package.json`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(traversal.status).toBe(404);

    // Admin RBAC: builder user gets 403; admin receives 200
    const nonAdmin = await request(ctx.app)
      .get("/api/admin/overview")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(nonAdmin.status).toBe(403);

    ctx.db.run("UPDATE users SET role = 'admin' WHERE email = ?", ["alice@aetherforge.test"]);
    const adminOk = await request(ctx.app)
      .get("/api/admin/overview")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(adminOk.status).toBe(200);
    expect(adminOk.body.stats.users).toBeGreaterThanOrEqual(2);

    // Logout revokes session token
    const logoutRes = await request(ctx.app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(logoutRes.status).toBe(200);

    const afterLogout = await request(ctx.app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(afterLogout.status).toBe(401);
  });
});
