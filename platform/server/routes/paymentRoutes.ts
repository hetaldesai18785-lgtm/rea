import { Router } from "express";
import { z } from "zod";
import type { PlatformDatabase } from "../db/database.js";
import { createAuthMiddleware, param } from "../middleware/auth.js";
import type { PaymentService } from "../services/payments/paymentService.js";

export const createPaymentRouter = (deps: { db: PlatformDatabase; payments: PaymentService }) => {
  const { db, payments } = deps;
  const router = Router();
  const { requireAuth } = createAuthMiddleware(db);

  // Public pack catalog
  router.get("/payments/packs", (_req, res) => {
    res.json({ packs: payments.getPacks() });
  });

  // Note: /api/payments/webhooks/stripe is mounted in app.ts BEFORE express.json() so raw Buffer signature passes intact!

  router.use("/payments", requireAuth);

  router.get("/payments/providers", (req, res) => {
    res.json({ providers: payments.getProviderStatuses(req.auth!.user.id) });
  });

  router.put("/payments/providers", (req, res) => {
    const schema = z.object({
      provider: z.enum(["stripe", "razorpay"]),
      publicKey: z.string().max(300).optional(),
      secretKey: z.string().max(300).optional(),
      webhookSecret: z.string().max(300).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payment provider settings" });
      return;
    }
    const status = payments.saveProviderConfig(req.auth!.user.id, parsed.data);
    res.json({ ok: true, provider: status });
  });

  router.get("/payments/orders", (req, res) => {
    res.json({
      orders: payments.listOrders(req.auth!.user.id),
      creditsBalance: req.auth!.user.creditsBalance,
    });
  });

  router.post("/payments/checkout", async (req, res) => {
    const schema = z.object({
      packId: z.string().min(1),
      provider: z.enum(["stripe", "razorpay", "sandbox"]).default("stripe"),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Valid packId and provider are required" });
      return;
    }

    const proto = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol || "http";
    const host = (req.headers["x-forwarded-host"] as string | undefined) || req.get("host") || "localhost:4100";
    try {
      const result = await payments.createCheckoutOrder({
        userId: req.auth!.user.id,
        workspaceId: req.auth!.workspaceId,
        packId: parsed.data.packId,
        provider: parsed.data.provider,
        originUrl: `${proto}://${host}`,
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to initialize checkout" });
    }
  });

  router.post("/payments/orders/:orderId/complete-sandbox", (req, res) => {
    try {
      const order = payments.completeSandboxOrder(req.auth!.user.id, param(req, "orderId"));
      const user = db.get<{ credits_balance: number }>("SELECT credits_balance FROM users WHERE id = ?", [
        req.auth!.user.id,
      ]);
      res.json({ order, creditsBalance: user?.credits_balance ?? req.auth!.user.creditsBalance });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Sandbox confirmation failed" });
    }
  });

  router.post("/payments/razorpay/verify", (req, res) => {
    const schema = z.object({
      orderId: z.string().min(1),
      razorpayOrderId: z.string().min(1),
      razorpayPaymentId: z.string().min(1),
      razorpaySignature: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing Razorpay verification signature fields" });
      return;
    }
    try {
      const order = payments.verifyRazorpayPayment(req.auth!.user.id, parsed.data);
      const user = db.get<{ credits_balance: number }>("SELECT credits_balance FROM users WHERE id = ?", [
        req.auth!.user.id,
      ]);
      res.json({ order, creditsBalance: user?.credits_balance ?? req.auth!.user.creditsBalance });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Razorpay verification failed" });
    }
  });

  return router;
};
