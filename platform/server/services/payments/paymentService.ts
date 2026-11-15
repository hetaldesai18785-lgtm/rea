import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  PaymentOrderDto,
  PaymentPackDto,
  PaymentProviderKind,
  PaymentProviderStatusDto,
} from "../../../shared/types.js";
import { decryptSecret, encryptSecret, maskSecretHint } from "../../crypto/security.js";
import type { PlatformDatabase } from "../../db/database.js";

export const PAYMENT_PACKS: PaymentPackDto[] = [
  {
    id: "pack_starter",
    name: "Starter Top-Up",
    credits: 500,
    amountCentsUsd: 900,
    amountPaiseInr: 75000,
    description: "500 compute credits for prototyping and iterative edits",
  },
  {
    id: "pack_pro",
    name: "Pro Builder Pack",
    credits: 2500,
    amountCentsUsd: 2900,
    amountPaiseInr: 240000,
    description: "2,500 compute credits for multi-agent full-stack & mobile builds",
  },
  {
    id: "pack_scale",
    name: "Scale Team Pack",
    credits: 10000,
    amountCentsUsd: 9900,
    amountPaiseInr: 820000,
    description: "10,000 compute credits for team workspaces & automated QA",
  },
];

interface PaymentConfigRow {
  id: string;
  user_id: string;
  provider: "stripe" | "razorpay";
  encrypted_public_key: string | null;
  encrypted_secret_key: string | null;
  encrypted_webhook_secret: string | null;
  key_hint: string | null;
  updated_at: string;
}

interface PaymentOrderRow {
  id: string;
  user_id: string;
  workspace_id: string;
  provider: PaymentProviderKind;
  plan_id: string;
  amount_cents: number;
  currency: string;
  credits_granted: number;
  status: PaymentOrderDto["status"];
  external_session_id: string | null;
  external_payment_id: string | null;
  checkout_url: string | null;
  mode: "live" | "sandbox-test";
  created_at: string;
  updated_at: string;
}

const mapOrder = (r: PaymentOrderRow): PaymentOrderDto => ({
  id: r.id,
  provider: r.provider,
  planId: r.plan_id,
  amountCents: r.amount_cents,
  currency: r.currency,
  creditsGranted: r.credits_granted,
  status: r.status,
  externalSessionId: r.external_session_id,
  externalPaymentId: r.external_payment_id,
  checkoutUrl: r.checkout_url,
  mode: r.mode,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class PaymentService {
  readonly #db: PlatformDatabase;

  constructor(db: PlatformDatabase) {
    this.#db = db;
  }

  getPacks(): PaymentPackDto[] {
    return PAYMENT_PACKS;
  }

  resolveCredentials(
    userId: string | null,
    provider: "stripe" | "razorpay",
  ): {
    publicKey: string | null;
    secretKey: string | null;
    webhookSecret: string | null;
    keyHint: string | null;
  } {
    const row = userId
      ? this.#db.get<PaymentConfigRow>(
          "SELECT * FROM payment_configs WHERE user_id = ? AND provider = ?",
          [userId, provider],
        )
      : undefined;

    if (provider === "stripe") {
      const secretKey = row?.encrypted_secret_key
        ? decryptSecret(row.encrypted_secret_key)
        : process.env.STRIPE_SECRET_KEY?.trim() || null;
      const webhookSecret = row?.encrypted_webhook_secret
        ? decryptSecret(row.encrypted_webhook_secret)
        : process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
      const publicKey = row?.encrypted_public_key
        ? decryptSecret(row.encrypted_public_key)
        : process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null;
      return {
        publicKey,
        secretKey,
        webhookSecret,
        keyHint: row?.key_hint ?? (secretKey ? maskSecretHint(secretKey) : null),
      };
    }

    const publicKey = row?.encrypted_public_key
      ? decryptSecret(row.encrypted_public_key)
      : process.env.RAZORPAY_KEY_ID?.trim() || null;
    const secretKey = row?.encrypted_secret_key
      ? decryptSecret(row.encrypted_secret_key)
      : process.env.RAZORPAY_KEY_SECRET?.trim() || null;
    const webhookSecret = row?.encrypted_webhook_secret
      ? decryptSecret(row.encrypted_webhook_secret)
      : process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null;
    return {
      publicKey,
      secretKey,
      webhookSecret,
      keyHint: row?.key_hint ?? (secretKey ? maskSecretHint(secretKey) : null),
    };
  }

  getProviderStatuses(userId: string): PaymentProviderStatusDto[] {
    const stripe = this.resolveCredentials(userId, "stripe");
    const razorpay = this.resolveCredentials(userId, "razorpay");
    return [
      {
        provider: "stripe",
        configured: Boolean(stripe.secretKey),
        mode: stripe.secretKey ? "live" : "sandbox-test",
        keyHint: stripe.keyHint,
        webhookConfigured: Boolean(stripe.webhookSecret),
      },
      {
        provider: "razorpay",
        configured: Boolean(razorpay.publicKey && razorpay.secretKey),
        mode: razorpay.publicKey && razorpay.secretKey ? "live" : "sandbox-test",
        keyHint: razorpay.keyHint,
        webhookConfigured: Boolean(razorpay.webhookSecret),
      },
    ];
  }

  saveProviderConfig(
    userId: string,
    input: {
      provider: "stripe" | "razorpay";
      publicKey?: string;
      secretKey?: string;
      webhookSecret?: string;
    },
  ): PaymentProviderStatusDto {
    const existing = this.#db.get<PaymentConfigRow>(
      "SELECT * FROM payment_configs WHERE user_id = ? AND provider = ?",
      [userId, input.provider],
    );
    const encPublic = input.publicKey?.trim()
      ? encryptSecret(input.publicKey.trim())
      : existing?.encrypted_public_key ?? null;
    const encSecret = input.secretKey?.trim()
      ? encryptSecret(input.secretKey.trim())
      : existing?.encrypted_secret_key ?? null;
    const encWebhook = input.webhookSecret?.trim()
      ? encryptSecret(input.webhookSecret.trim())
      : existing?.encrypted_webhook_secret ?? null;
    const hint = input.secretKey?.trim()
      ? maskSecretHint(input.secretKey.trim())
      : existing?.key_hint ?? null;
    const now = new Date().toISOString();

    if (existing) {
      this.#db.run(
        `UPDATE payment_configs
         SET encrypted_public_key = ?, encrypted_secret_key = ?, encrypted_webhook_secret = ?, key_hint = ?, updated_at = ?
         WHERE id = ?`,
        [encPublic, encSecret, encWebhook, hint, now, existing.id],
      );
    } else {
      this.#db.run(
        `INSERT INTO payment_configs (id, user_id, provider, encrypted_public_key, encrypted_secret_key, encrypted_webhook_secret, key_hint, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [`paycfg-${randomUUID().slice(0, 8)}`, userId, input.provider, encPublic, encSecret, encWebhook, hint, now],
      );
    }
    return this.getProviderStatuses(userId).find((s) => s.provider === input.provider)!;
  }

  listOrders(userId: string): PaymentOrderDto[] {
    const rows = this.#db.all<PaymentOrderRow>(
      "SELECT * FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 40",
      [userId],
    );
    return rows.map(mapOrder);
  }

  async createCheckoutOrder(input: {
    userId: string;
    workspaceId: string;
    packId: string;
    provider: PaymentProviderKind;
    originUrl: string;
  }): Promise<{ order: PaymentOrderDto; razorpayKeyId?: string | null }> {
    const pack = PAYMENT_PACKS.find((p) => p.id === input.packId);
    if (!pack) {
      throw new Error("Invalid credit pack selected");
    }

    const orderId = `ord-${randomUUID().slice(0, 10)}`;
    const now = new Date().toISOString();
    const isInr = input.provider === "razorpay";
    const currency = isInr ? "inr" : "usd";
    const amountCents = isInr ? pack.amountPaiseInr : pack.amountCentsUsd;

    let mode: "live" | "sandbox-test" = "sandbox-test";
    let externalSessionId: string | null = null;
    let checkoutUrl: string | null = null;
    let razorpayKeyId: string | null = null;

    if (input.provider === "stripe") {
      const creds = this.resolveCredentials(input.userId, "stripe");
      if (creds.secretKey) {
        const stripeBase = (process.env.STRIPE_API_BASE_URL ?? "https://api.stripe.com").replace(/\/+$/, "");
        const params = new URLSearchParams({
          mode: "payment",
          success_url: `${input.originUrl}/billing?payment=success&orderId=${orderId}`,
          cancel_url: `${input.originUrl}/billing?payment=cancelled&orderId=${orderId}`,
          client_reference_id: orderId,
          "line_items[0][quantity]": "1",
          "line_items[0][price_data][currency]": "usd",
          "line_items[0][price_data][unit_amount]": String(pack.amountCentsUsd),
          "line_items[0][price_data][product_data][name]": `AetherForge Studio — ${pack.name}`,
          "metadata[orderId]": orderId,
          "metadata[userId]": input.userId,
        });
        const resp = await fetch(`${stripeBase}/v1/checkout/sessions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${creds.secretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
          signal: AbortSignal.timeout(12_000),
        });
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`Stripe Checkout failed (${resp.status}): ${text.slice(0, 200)}`);
        }
        const session = (await resp.json()) as { id: string; url?: string };
        mode = "live";
        externalSessionId = session.id;
        checkoutUrl = session.url ?? null;
      }
    } else if (input.provider === "razorpay") {
      const creds = this.resolveCredentials(input.userId, "razorpay");
      if (creds.publicKey && creds.secretKey) {
        const rzpBase = (process.env.RAZORPAY_API_BASE_URL ?? "https://api.razorpay.com").replace(/\/+$/, "");
        const basicAuth = Buffer.from(`${creds.publicKey}:${creds.secretKey}`).toString("base64");
        const resp = await fetch(`${rzpBase}/v1/orders`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: pack.amountPaiseInr,
            currency: "INR",
            receipt: orderId,
            notes: { userId: input.userId, packId: pack.id },
          }),
          signal: AbortSignal.timeout(12_000),
        });
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`Razorpay Order API failed (${resp.status}): ${text.slice(0, 200)}`);
        }
        const rzpOrder = (await resp.json()) as { id: string };
        mode = "live";
        externalSessionId = rzpOrder.id;
        razorpayKeyId = creds.publicKey;
      }
    }

    this.#db.run(
      `INSERT INTO payment_orders (id, user_id, workspace_id, provider, plan_id, amount_cents, currency, credits_granted, status, external_session_id, external_payment_id, checkout_url, mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?, ?, ?)`,
      [
        orderId,
        input.userId,
        input.workspaceId,
        input.provider,
        pack.id,
        amountCents,
        currency,
        pack.credits,
        externalSessionId,
        checkoutUrl,
        mode,
        now,
        now,
      ],
    );

    const saved = this.#db.get<PaymentOrderRow>("SELECT * FROM payment_orders WHERE id = ?", [orderId])!;
    return { order: mapOrder(saved), razorpayKeyId };
  }

  markOrderPaidIdempotent(orderId: string, externalPaymentId: string | null): PaymentOrderDto {
    const existing = this.#db.get<PaymentOrderRow>("SELECT * FROM payment_orders WHERE id = ?", [orderId]);
    if (!existing) {
      throw new Error("Payment order not found");
    }
    if (existing.status === "paid") {
      return mapOrder(existing);
    }
    const now = new Date().toISOString();
    this.#db.transaction(() => {
      this.#db.run(
        "UPDATE payment_orders SET status = 'paid', external_payment_id = ?, updated_at = ? WHERE id = ?",
        [externalPaymentId, now, orderId],
      );
      this.#db.run("UPDATE users SET credits_balance = credits_balance + ?, updated_at = ? WHERE id = ?", [
        existing.credits_granted,
        now,
        existing.user_id,
      ]);
      this.#db.run(
        `INSERT INTO credit_ledger (id, user_id, project_id, delta, reason, created_at)
         VALUES (?, ?, NULL, ?, ?, ?)`,
        [
          `led-${randomUUID().slice(0, 10)}`,
          existing.user_id,
          existing.credits_granted,
          `Payment (${existing.provider}/${existing.mode}) — ${existing.plan_id}`,
          now,
        ],
      );
      this.#db.run(
        `INSERT INTO audit_logs (id, user_id, project_id, action, target, confirmed, metadata_json, created_at)
         VALUES (?, ?, NULL, 'payment.paid', ?, 1, ?, ?)`,
        [
          `aud-${randomUUID().slice(0, 10)}`,
          existing.user_id,
          `${existing.provider}:${orderId}`,
          JSON.stringify({ creditsGranted: existing.credits_granted, mode: existing.mode }),
          now,
        ],
      );
    });

    return mapOrder(this.#db.get<PaymentOrderRow>("SELECT * FROM payment_orders WHERE id = ?", [orderId])!);
  }

  completeSandboxOrder(userId: string, orderId: string): PaymentOrderDto {
    const order = this.#db.get<PaymentOrderRow>(
      "SELECT * FROM payment_orders WHERE id = ? AND user_id = ?",
      [orderId, userId],
    );
    if (!order) {
      throw new Error("Payment order not found");
    }
    if (order.mode !== "sandbox-test") {
      throw new Error("Live provider orders require cryptographic webhook or payment signature verification");
    }
    return this.markOrderPaidIdempotent(order.id, `sandbox_pay_${randomUUID().slice(0, 8)}`);
  }

  verifyStripeWebhook(rawBody: Buffer, signatureHeader: string | undefined): {
    received: boolean;
    order?: PaymentOrderDto;
    eventType: string;
  } {
    if (!signatureHeader) {
      throw new Error("Missing stripe-signature header");
    }
    const parts = Object.fromEntries(
      signatureHeader.split(",").map((kv) => {
        const [k, v] = kv.trim().split("=");
        return [k ?? "", v ?? ""];
      }),
    );
    const timestampStr = parts.t;
    const signatureV1 = parts.v1;
    if (!timestampStr || !signatureV1) {
      throw new Error("Malformed stripe-signature header");
    }

    const ts = Number.parseInt(timestampStr, 10);
    if (Number.isNaN(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) {
      throw new Error("Stripe webhook timestamp outside replay window");
    }

    const event = JSON.parse(rawBody.toString("utf8")) as {
      type?: string;
      data?: {
        object?: {
          id?: string;
          payment_intent?: string;
          client_reference_id?: string;
          metadata?: { orderId?: string; userId?: string };
        };
      };
    };

    const obj = event.data?.object;
    const orderId = obj?.metadata?.orderId ?? obj?.client_reference_id ?? null;
    const orderRow = orderId
      ? this.#db.get<PaymentOrderRow>("SELECT * FROM payment_orders WHERE id = ?", [orderId])
      : obj?.id
        ? this.#db.get<PaymentOrderRow>("SELECT * FROM payment_orders WHERE external_session_id = ?", [obj.id])
        : undefined;

    const creds = this.resolveCredentials(orderRow?.user_id ?? obj?.metadata?.userId ?? null, "stripe");
    if (!creds.webhookSecret) {
      throw new Error("Stripe webhook secret not configured");
    }

    const expected = createHmac("sha256", creds.webhookSecret)
      .update(`${timestampStr}.${rawBody.toString("utf8")}`)
      .digest("hex");

    const sigBuf = Buffer.from(signatureV1, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new Error("Invalid Stripe signature");
    }

    const eventType = event.type ?? "unknown";
    if (eventType === "checkout.session.completed" && orderRow) {
      const paid = this.markOrderPaidIdempotent(orderRow.id, obj?.payment_intent ?? obj?.id ?? null);
      return { received: true, order: paid, eventType };
    }
    return { received: true, eventType };
  }

  verifyRazorpayPayment(
    userId: string,
    input: {
      orderId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    },
  ): PaymentOrderDto {
    const orderRow = this.#db.get<PaymentOrderRow>(
      "SELECT * FROM payment_orders WHERE id = ? AND user_id = ?",
      [input.orderId, userId],
    );
    if (!orderRow) {
      throw new Error("Payment order not found");
    }
    const creds = this.resolveCredentials(userId, "razorpay");
    if (!creds.secretKey) {
      throw new Error("Razorpay secret key not configured");
    }

    const expected = createHmac("sha256", creds.secretKey)
      .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
      .digest("hex");

    const sigBuf = Buffer.from(input.razorpaySignature, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new Error("Invalid Razorpay payment signature");
    }

    return this.markOrderPaidIdempotent(orderRow.id, input.razorpayPaymentId);
  }
}
