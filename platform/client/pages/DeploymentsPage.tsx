import React, { useEffect, useState } from "react";
import { Rocket, ExternalLink, RotateCcw, Square, CheckCircle2, AlertTriangle } from "lucide-react";
import type { DeploymentDto } from "@shared/types";
import { AppShell } from "../components/AppShell";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";

export const DeploymentsPage: React.FC = () => {
  const { notify } = useToast();
  const [deployments, setDeployments] = useState<DeploymentDto[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ deployments: DeploymentDto[] }>("/api/deployments");
      setDeployments(res.deployments);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleStop = async (id: string) => {
    await api.post(`/api/deployments/${id}/stop`);
    notify("Deployment stopped", "info");
    await load();
  };

  const handleRollback = async (id: string) => {
    await api.post(`/api/deployments/${id}/rollback`);
    notify("Redeployed selected release", "success");
    await load();
  };

  return (
    <AppShell title="Live Deployments">
      <div className="mx-auto max-w-6xl space-y-4">
        {loading ? (
          <div className="rounded-xl af-panel border p-8 text-center text-xs af-muted">
            Loading deployments...
          </div>
        ) : deployments.length === 0 ? (
          <div className="rounded-xl af-panel border p-8 text-center text-xs af-muted">
            No deployments yet. Open any project in the Studio IDE and click <strong>Publish</strong>.
          </div>
        ) : (
          <div className="space-y-3">
            {deployments.map((d) => (
              <div key={d.id} className="rounded-xl af-panel border p-4 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Rocket className="h-4 w-4 text-emerald-400" />
                    <span className="font-semibold text-sm">{d.id}</span>
                    <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-[10px] uppercase text-indigo-300">
                      {d.provider}
                    </span>
                    <span className="rounded bg-slate-500/15 px-2 py-0.5 text-[10px] uppercase">
                      {d.environment}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        d.status === "live"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : d.status === "failed"
                            ? "bg-rose-500/15 text-rose-400"
                            : "bg-slate-500/15 af-muted"
                      }`}
                    >
                      {d.healthStatus === "healthy" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {d.status} {d.healthHttpCode ? `HTTP ${d.healthHttpCode}` : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {d.url && d.status === "live" && (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-2.5 py-1 text-emerald-300"
                      >
                        <span>Visit Live App</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleRollback(d.id)}
                      className="inline-flex items-center gap-1 rounded-lg border af-border px-2.5 py-1 af-muted hover:text-inherit"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Redeploy</span>
                    </button>
                    {d.status === "live" && (
                      <button
                        type="button"
                        onClick={() => void handleStop(d.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2.5 py-1 text-rose-400"
                      >
                        <Square className="h-3 w-3" />
                        <span>Stop</span>
                      </button>
                    )}
                  </div>
                </div>
                {d.logsText && (
                  <pre className="max-h-24 overflow-auto rounded-lg bg-black/30 p-2.5 af-mono text-[11px] af-muted whitespace-pre-wrap">
                    {d.logsText}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
};
