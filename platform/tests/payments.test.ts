import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PlatformDatabase } from "../server/db/database.js";
import type { PlatformContext } from "../server/app.js";

const tmpRoot = mkdtempSync(join(tmpdir(), "af-payments-test-"));
process.env.AETHERFORGE_DATA_DIR = tmpRoot;
process.env.AETHERFORGE_DB_PATH = join(tmpRoot, "test.sqlite");
process.env.AETHERFORGE_MASTER_KEY = "payments_master_key_test_1234567890abcdef";
process.env.AETHERFORGE_SANDBOX_BASE_PORT = "5300";
process.env.AETHERFORGE_DEPLOY_BASE_PORT = "6300";

const { openPlatformDatabase } = await import("../server/db/database.js");
const { createPlatformApp } = await import("../server/app.js");

describe("Payment integration — Stripe, Razorpay, Ledger, and Generated-App Checkout", () => {
  let db: PlatformDatabase;
  let ctx: PlatformContext;
  let stripeMockServer: ReturnType<typeof createServer>;
  let razorpayMockServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    stripeMockServer = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString("utf8");
      });
      req.on("end", () => {
        if (req.url === "/v1/checkout/sessions" && req.method === "POST") {
          expect(req.headers.authorization).toBe("Bearer sk_test_mock_999");
          const parsed = new URLSearchParams(body);
          expect(parsed.get("mode")).toBe("payment");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              id: "cs_test_session_123",
              url: "https://checkout.stripe.com/c/pay/cs_test_session_123",
            }),
          );
          return;
        }
        res.writeHead(404).end();
      });
    });

    razorpayMockServer = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString("utf8");
      });
      req.on("end", () => {
        if (req.url === "/v1/orders" && req.method === "POST") {
          const auth = req.headers.authorization ?? "";
          const decoded = Buffer.from(auth.replace(/^Basic\s+/i, ""), "base64").toString("utf8");
          expect(decoded).toBe("rzp_test_key123:rzp_secret_abc");
          const payload = JSON.parse(body) as { currency: string; amount: number };
          expect(payload.currency).toBe("INR");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ id: "order_rzp_789", amount: payload.amount, currency: "INR" }));
          return;
        }
        res.writeHead(404).end();
      });
    });

    await new Promise<void>((resolve) => stripeMockServer.listen(0, "127.0.0.1", resolve));
    await new Promise<void>((resolve) => razorpayMockServer.listen(0, "127.0.0.1", resolve));
    const stripeAddr = stripeMockServer.address() as { port: number };
    const rzpAddr = razorpayMockServer.address() as { port: number };
    process.env.STRIPE_API_BASE_URL = `http://127.0.0.1:${stripeAddr.port}`;
    process.env.RAZORPAY_API_BASE_URL = `http://127.0.0.1:${rzpAddr.port}`;

    db = await openPlatformDatabase(process.env.AETHERFORGE_DB_PATH);
    ctx = createPlatformApp(db);
  });

  afterAll(async () => {
    delete process.env.STRIPE_API_BASE_URL;
    delete process.env.RAZORPAY_API_BASE_URL;
    if (ctx) await ctx.shutdown();
    await Promise.all([
      new Promise<void>((resolve) => stripeMockServer.close(() => resolve())),
      new Promise<void>((resolve) => razorpayMockServer.close(() => resolve())),
    ]);
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("handles sandbox top-up idempotently and populates credit_ledger", async () => {
    const agent = request.agent(ctx.app);
    await agent
      .post("/api/auth/register")
      .send({ email: "pay-sandbox@test.dev", name: "Pay Tester", password: "StrongPassword!123" })
      .expect(201);

    const packsRes = await agent.get("/api/payments/packs").expect(200);
    expect(packsRes.body.packs.length).toBeGreaterThanOrEqual(3);

    const checkout = await agent
      .post("/api/payments/checkout")
      .send({ packId: "pack_starter", provider: "sandbox" })
      .expect(201);
    expect(checkout.body.order.status).toBe("pending");
    expect(checkout.body.order.mode).toBe("sandbox-test");

    const confirm1 = await agent
      .post(`/api/payments/orders/${checkout.body.order.id}/complete-sandbox`)
      .expect(200);
    expect(confirm1.body.order.status).toBe("paid");
    expect(confirm1.body.creditsBalance).toBe(1500); // 1000 initial + 500 starter

    // Re-confirming is idempotent (does not double-credit!)
    const confirm2 = await agent
      .post(`/api/payments/orders/${checkout.body.order.id}/complete-sandbox`)
      .expect(200);
    expect(confirm2.body.creditsBalance).toBe(1500);

    const ledgerRes = await agent.get("/api/billing/ledger").expect(200);
    expect(ledgerRes.body.creditsBalance).toBe(1500);
    expect(ledgerRes.body.entries.length).toBe(1);
    expect(ledgerRes.body.entries[0].delta).toBe(500);
  });

  it("creates real Stripe checkout sessions and enforces HMAC-SHA256 webhook verification", async () => {
    const agent = request.agent(ctx.app);
    await agent
      .post("/api/auth/register")
      .send({ email: "stripe-user@test.dev", name: "Stripe Tester", password: "StrongPassword!123" })
      .expect(201);

    const whSecret = "whsec_test_secret_abc123";
    const saveRes = await agent
      .put("/api/payments/providers")
      .send({
        provider: "stripe",
        secretKey: "sk_test_mock_999",
        webhookSecret: whSecret,
      })
      .expect(200);
    expect(saveRes.body.provider.configured).toBe(true);
    expect(saveRes.body.provider.mode).toBe("live");
    expect(saveRes.body.provider.webhookConfigured).toBe(true);
    expect(JSON.stringify(saveRes.body)).not.toContain("sk_test_mock_999");

    const checkoutRes = await agent
      .post("/api/payments/checkout")
      .send({ packId: "pack_pro", provider: "stripe" })
      .expect(201);
    expect(checkoutRes.body.order.mode).toBe("live");
    expect(checkoutRes.body.order.externalSessionId).toBe("cs_test_session_123");
    expect(checkoutRes.body.order.checkoutUrl).toContain("checkout.stripe.com");

    // Sandbox confirmation MUST fail on live Stripe orders!
    await agent
      .post(`/api/payments/orders/${checkoutRes.body.order.id}/complete-sandbox`)
      .expect(400);

    const payload = JSON.stringify({
      id: "evt_123",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_session_123",
          payment_intent: "pi_live_987",
          metadata: { orderId: checkoutRes.body.order.id },
        },
      },
    });
    const ts = Math.floor(Date.now() / 1000);

    // Tampered webhook signature is rejected
    await request(ctx.app)
      .post("/api/payments/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", `t=${ts},v1=${"0".repeat(64)}`)
      .send(payload)
      .expect(400);

    // Valid HMAC-SHA256 webhook fulfills order & updates ledger
    const validSig = createHmac("sha256", whSecret).update(`${ts}.${payload}`).digest("hex");
    const whRes = await request(ctx.app)
      .post("/api/payments/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", `t=${ts},v1=${validSig}`)
      .send(payload)
      .expect(200);
    expect(whRes.body.received).toBe(true);
    expect(whRes.body.order.status).toBe("paid");

    const ledgerRes = await agent.get("/api/billing/ledger").expect(200);
    expect(ledgerRes.body.creditsBalance).toBe(3500); // 1000 initial + 2500 pro pack
  });

  it("creates Razorpay INR orders and verifies HMAC-SHA256 signatures", async () => {
    const agent = request.agent(ctx.app);
    await agent
      .post("/api/auth/register")
      .send({ email: "rzp-user@test.dev", name: "Rzp Tester", password: "StrongPassword!123" })
      .expect(201);

    await agent
      .put("/api/payments/providers")
      .send({
        provider: "razorpay",
        publicKey: "rzp_test_key123",
        secretKey: "rzp_secret_abc",
      })
      .expect(200);

    const orderRes = await agent
      .post("/api/payments/checkout")
      .send({ packId: "pack_starter", provider: "razorpay" })
      .expect(201);
    expect(orderRes.body.order.currency).toBe("inr");
    expect(orderRes.body.order.externalSessionId).toBe("order_rzp_789");
    expect(orderRes.body.razorpayKeyId).toBe("rzp_test_key123");

    // Reject bad signature
    await agent
      .post("/api/payments/razorpay/verify")
      .send({
        orderId: orderRes.body.order.id,
        razorpayOrderId: "order_rzp_789",
        razorpayPaymentId: "pay_rzp_111",
        razorpaySignature: "f".repeat(64),
      })
      .expect(400);

    // Accept valid HMAC-SHA256 signature
    const validRzpSig = createHmac("sha256", "rzp_secret_abc")
      .update("order_rzp_789|pay_rzp_111")
      .digest("hex");
    const verifyRes = await agent
      .post("/api/payments/razorpay/verify")
      .send({
        orderId: orderRes.body.order.id,
        razorpayOrderId: "order_rzp_789",
        razorpayPaymentId: "pay_rzp_111",
        razorpaySignature: validRzpSig,
      })
      .expect(200);
    expect(verifyRes.body.order.status).toBe("paid");
    expect(verifyRes.body.creditsBalance).toBe(1500); // 1000 initial + 500 starter
  });

  it("synthesizes payment routes, checkout UI, and passing payment tests inside payment-enabled generated apps", async () => {
    const agent = request.agent(ctx.app);
    await agent
      .post("/api/auth/register")
      .send({ email: "genpay@test.dev", name: "Builder", password: "StrongPassword!123" })
      .expect(201);

    const projRes = await agent
      .post("/api/projects")
      .send({
        name: "PayStore SaaS",
        initialPrompt: "Build a SaaS subscription ecommerce store with Stripe and Razorpay payment checkout and orders",
        appType: "fullstack",
        autonomyMode: "build",
      })
      .expect(201);
    expect(projRes.body.project.previewRunning).toBe(true);

    // Verify generated app artifacts include payment panel & endpoints, and live preview + generated npm test pass
    const htmlRes = await agent.get(`/preview/${projRes.body.project.id}/`).expect(200);
    expect(htmlRes.text).toContain("payments-panel");
    expect(htmlRes.text).toContain("pay-stripe-btn");

    const payCfgRes = await agent.get(`/preview/${projRes.body.project.id}/api/payments/config`).expect(200);
    expect(payCfgRes.body.mode).toBe("sandbox-test");

    const testRunRes = await agent.post(`/api/projects/${projRes.body.project.id}/tests/run`).expect(200);
    expect(testRunRes.body.testRun.status).toBe("passed");
    expect(testRunRes.body.testRun.failed).toBe(0);

    // Agent run should also have written a negative credit_ledger entry!
    const ledgerRes = await agent.get("/api/billing/ledger").expect(200);
    expect(ledgerRes.body.entries.some((e: { delta: number }) => e.delta < 0)).toBe(true);
  }, 60_000);
});
