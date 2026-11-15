import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import type {
  PaymentOrderDto,
  PaymentPackDto,
  PaymentProviderKind,
  PaymentProviderStatusDto,
} from "@shared/types";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";

interface LedgerRow {
  id: string;
  delta: number;
  reason: string;
  project_id: string | null;
  created_at: string;
}

export const BillingPage: React.FC = () => {
  const { notify } = useToast();
  const { refreshMe } = useAuth();
  const [credits, setCredits] = useState(0);
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [packs, setPacks] = useState<PaymentPackDto[]>([]);
  const [providers, setProviders] = useState<PaymentProviderStatusDto[]>([]);
  const [orders, setOrders] = useState<PaymentOrderDto[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Payment gateway config drawer state
  const [showVault, setShowVault] = useState(false);
  const [cfgProvider, setCfgProvider] = useState<"stripe" | "razorpay">("stripe");
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [ledgerRes, packRes, provRes, ordRes] = await Promise.all([
        api.get<{ creditsBalance: number; entries: LedgerRow[] }>("/api/billing/ledger"),
        api.get<{ packs: PaymentPackDto[] }>("/api/payments/packs"),
        api.get<{ providers: PaymentProviderStatusDto[] }>("/api/payments/providers"),
        api.get<{ orders: PaymentOrderDto[]; creditsBalance: number }>("/api/payments/orders"),
      ]);
      setCredits(ledgerRes.creditsBalance);
      setEntries(ledgerRes.entries);
      setPacks(packRes.packs);
      setProviders(provRes.providers);
      setOrders(ordRes.orders);
    } catch {
      // ignore initial auth race
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const startCheckout = async (packId: string, provider: PaymentProviderKind) => {
    const opKey = `${packId}:${provider}`;
    setBusyKey(opKey);
    try {
      const res = await api.post<{ order: PaymentOrderDto; razorpayKeyId?: string | null }>(
        "/api/payments/checkout",
        { packId, provider },
      );
      if (res.order.checkoutUrl) {
        window.open(res.order.checkoutUrl, "_blank", "noopener,noreferrer");
        notify("Stripe Checkout session opened in a new tab", "success");
      } else if (res.order.mode === "sandbox-test") {
        notify(
          "Created sandbox test order — click 'Confirm Sandbox Payment' below to test crediting & ledger.",
          "info",
        );
      } else {
        notify(`Razorpay Order ${res.order.externalSessionId ?? res.order.id} initialized`, "success");
      }
      await loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Checkout failed", "error");
    } finally {
      setBusyKey(null);
    }
  };

  const completeSandbox = async (orderId: string) => {
    setBusyKey(`confirm:${orderId}`);
    try {
      const res = await api.post<{ order: PaymentOrderDto; creditsBalance: number }>(
        `/api/payments/orders/${orderId}/complete-sandbox`,
      );
      notify(`+${res.order.creditsGranted} credits added (Sandbox test payment verified)`, "success");
      await Promise.all([loadAll(), refreshMe()]);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Sandbox confirmation failed", "error");
    } finally {
      setBusyKey(null);
    }
  };

  const saveGatewayKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyKey("save-vault");
    try {
      await api.put("/api/payments/providers", {
        provider: cfgProvider,
        publicKey: publicKey.trim() || undefined,
        secretKey: secretKey.trim() || undefined,
        webhookSecret: webhookSecret.trim() || undefined,
      });
      setPublicKey("");
      setSecretKey("");
      setWebhookSecret("");
      notify(`${cfgProvider === "stripe" ? "Stripe" : "Razorpay"} keys encrypted and saved`, "success");
      await loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to save gateway keys", "error");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <AppShell title="Billing, Payments & Compute Metering">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl af-panel border p-5">
            <div className="flex items-center gap-2 text-xs af-muted font-semibold uppercase">
              <Zap className="h-4 w-4 text-emerald-400" />
              <span>Workspace Compute Balance</span>
            </div>
            <div className="mt-2 text-3xl font-bold text-emerald-400">{credits.toLocaleString()} Credits</div>
            <p className="mt-1 text-xs af-muted">
              Tracks autonomous agent runs, synthesis passes, and verified payment top-ups.
            </p>
          </div>

          <div className="rounded-xl af-panel border p-5 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs af-muted font-semibold uppercase">
                  <ShieldCheck className="h-4 w-4 text-indigo-400" />
                  <span>Connected Payment Gateways</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVault((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-lg border af-border af-panel-2 px-2.5 py-1 text-[11px] font-medium hover:border-indigo-500"
                >
                  <KeyRound className="h-3 w-3" />
                  {showVault ? "Hide Gateway Keys" : "Configure Gateway Keys"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {providers.map((p) => (
                  <div
                    key={p.provider}
                    className="flex items-center gap-2 rounded-lg border af-border af-panel-2 px-3 py-1.5 text-xs"
                  >
                    <span className="font-semibold capitalize">{p.provider}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        p.configured
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {p.configured ? `Live (${p.keyHint ?? "set"})` : "Sandbox Test Mode"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11px] af-muted">
              Supports Stripe Checkout + HMAC-SHA256 webhooks and Razorpay INR Orders + signature verification.
            </p>
          </div>
        </div>

        {showVault && (
          <form onSubmit={(e) => void saveGatewayKeys(e)} className="rounded-xl af-panel border p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Encrypted Payment Gateway Vault (AES-256-GCM)</h2>
                <p className="text-xs af-muted">
                  Keys are encrypted at rest with the workspace master key and never echoed back to the browser.
                </p>
              </div>
              <div className="flex gap-1.5">
                {(["stripe", "razorpay"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCfgProvider(p)}
                    className={`rounded-lg border px-3 py-1 text-xs capitalize ${
                      cfgProvider === p
                        ? "border-indigo-500 bg-indigo-500/15 text-indigo-300 font-semibold"
                        : "af-border af-panel-2 af-muted"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {cfgProvider === "razorpay" && (
                <label className="text-xs space-y-1">
                  <span className="af-muted">Razorpay Key ID (rzp_...)</span>
                  <input
                    type="text"
                    value={publicKey}
                    onChange={(e) => setPublicKey(e.target.value)}
                    placeholder="rzp_test_..."
                    className="w-full rounded-lg border af-border af-panel-2 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                  />
                </label>
              )}
              <label className="text-xs space-y-1">
                <span className="af-muted">
                  {cfgProvider === "stripe" ? "Stripe Secret Key (sk_...)" : "Razorpay Key Secret"}
                </span>
                <input
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder={cfgProvider === "stripe" ? "sk_test_..." : "••••••••"}
                  className="w-full rounded-lg border af-border af-panel-2 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="af-muted">Webhook Signing Secret</span>
                <input
                  type="password"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder={cfgProvider === "stripe" ? "whsec_..." : "webhook secret"}
                  className="w-full rounded-lg border af-border af-panel-2 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                />
              </label>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] af-muted">
                Webhook endpoint: <code className="af-mono">/api/payments/webhooks/stripe</code>
              </span>
              <button
                type="submit"
                disabled={busyKey === "save-vault"}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {busyKey === "save-vault" ? "Encrypting..." : "Save Encrypted Keys"}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              Top Up Compute Credits
            </h2>
            <span className="text-xs af-muted">Instant credit fulfillment on verified payment</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {packs.map((pack) => (
              <div key={pack.id} className="rounded-xl af-panel border p-5 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">{pack.name}</h3>
                    <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300">
                      +{pack.credits.toLocaleString()} cr
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold">${(pack.amountCentsUsd / 100).toFixed(0)}</span>
                    <span className="text-xs af-muted">/ ₹{(pack.amountPaiseInr / 100).toLocaleString()} INR</span>
                  </div>
                  <p className="mt-1.5 text-xs af-muted leading-relaxed">{pack.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => void startCheckout(pack.id, "stripe")}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    {busyKey === `${pack.id}:stripe` ? "..." : "Stripe USD"}
                  </button>
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => void startCheckout(pack.id, "razorpay")}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border af-border af-panel-2 px-3 py-2 text-xs font-semibold hover:border-indigo-500 disabled:opacity-60"
                  >
                    {busyKey === `${pack.id}:razorpay` ? "..." : "Razorpay INR"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl af-panel border p-5 space-y-3">
          <h2 className="text-sm font-semibold">Payment Orders & Receipts</h2>
          {orders.length === 0 ? (
            <div className="rounded-xl af-panel-2 border p-4 text-center text-xs af-muted">
              No checkout orders created yet. Choose a credit pack above to start a Stripe, Razorpay, or Sandbox order.
            </div>
          ) : (
            <div className="divide-y af-border text-xs">
              {orders.map((ord) => (
                <div key={ord.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 font-medium">
                      <span className="capitalize">{ord.provider}</span>
                      <span className="af-muted">•</span>
                      <span>
                        {(ord.amountCents / 100).toFixed(2)} {ord.currency.toUpperCase()}
                      </span>
                      <span className="rounded bg-black/25 px-1.5 py-0.5 text-[10px] af-muted">{ord.mode}</span>
                    </div>
                    <div className="text-[11px] af-muted af-mono">
                      {ord.id} • +{ord.creditsGranted} credits • {new Date(ord.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        ord.status === "paid"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {ord.status === "paid" && <CheckCircle2 className="h-3 w-3" />}
                      {ord.status}
                    </span>
                    {ord.checkoutUrl && ord.status === "pending" && (
                      <a
                        href={ord.checkoutUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500"
                      >
                        Pay Now <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {ord.status === "pending" && ord.mode === "sandbox-test" && (
                      <button
                        type="button"
                        disabled={busyKey === `confirm:${ord.id}`}
                        onClick={() => void completeSandbox(ord.id)}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                      >
                        {busyKey === `confirm:${ord.id}` ? "Confirming..." : "Confirm Sandbox Payment"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl af-panel border p-5 space-y-3">
          <h2 className="text-sm font-semibold">Credit Usage & Top-Up Ledger</h2>
          {entries.length === 0 ? (
            <div className="rounded-xl af-panel-2 border p-4 text-center text-xs af-muted">
              No compute runs or payment top-ups recorded yet.
            </div>
          ) : (
            <div className="divide-y af-border text-xs">
              {entries.map((row) => (
                <div key={row.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="font-medium">{row.reason}</div>
                    <div className="text-[10px] af-muted">
                      {row.project_id ?? "workspace"} • {new Date(row.created_at).toLocaleString()}
                    </div>
                  </div>
                  <span
                    className={`af-mono font-semibold ${
                      row.delta >= 0 ? "text-emerald-400" : "text-amber-300"
                    }`}
                  >
                    {row.delta > 0 ? `+${row.delta}` : row.delta} cr
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
};
