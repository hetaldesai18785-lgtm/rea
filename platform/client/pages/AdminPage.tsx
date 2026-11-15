import React, { useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { api } from "../lib/api";

interface AdminOverview {
  stats: { users: number; projects: number; deployments: number; runs: number };
  auditLogs: Array<{
    id: string;
    user_id: string;
    action: string;
    target: string;
    confirmed: number;
    created_at: string;
  }>;
  activeAdmin: string;
}

export const AdminPage: React.FC = () => {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AdminOverview>("/api/admin/overview")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Access denied"));
  }, []);

  return (
    <AppShell title="Admin Control Plane">
      <div className="mx-auto max-w-5xl space-y-5">
        {error ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-5 text-xs text-rose-200 flex items-center gap-2.5">
            <AlertTriangle className="h-5 w-5 text-rose-400" />
            <span>{error} — Administrative role required to access global audit logs and system telemetry.</span>
          </div>
        ) : !data ? (
          <div className="rounded-xl af-panel border p-8 text-center text-xs af-muted">
            Loading administrative overview...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(data.stats).map(([k, v]) => (
                <div key={k} className="rounded-xl af-panel border p-4">
                  <div className="text-[11px] uppercase af-muted">{k}</div>
                  <div className="mt-1 text-2xl font-bold text-indigo-400">{v}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl af-panel border p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>Platform Security Audit Trail</span>
              </div>
              <div className="space-y-1.5 text-xs">
                {data.auditLogs.map((log) => (
                  <div key={log.id} className="flex flex-wrap items-center justify-between rounded-lg af-panel-2 border px-3 py-2">
                    <div>
                      <span className="font-semibold text-indigo-300 mr-2">{log.action}</span>
                      <span className="af-mono">{log.target}</span>
                    </div>
                    <span className="text-[10px] af-muted">
                      {log.user_id} • {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
};
