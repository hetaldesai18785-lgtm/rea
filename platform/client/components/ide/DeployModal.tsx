import React, { useEffect, useState } from "react";
import { Rocket, ExternalLink, RotateCcw, Square, X, CheckCircle2, AlertTriangle } from "lucide-react";
import type { DeploymentDto } from "@shared/types";
import { api } from "../../lib/api";
import { useToast } from "../../context/ToastContext";

type DeploymentProvider = DeploymentDto["provider"];

const PROVIDERS: Array<{ id: DeploymentProvider; label: string; note: string }> = [
  { id: "managed-sandbox", label: "Managed Sandbox Runtime", note: "Built-in live HTTP deployment + /health probe" },
  { id: "docker", label: "Docker Artifact Bundle", note: "Generates production Dockerfile & start script" },
  { id: "vercel", label: "Vercel", note: "Requires VERCEL_TOKEN" },
  { id: "netlify", label: "Netlify", note: "Requires NETLIFY_AUTH_TOKEN" },
  { id: "fly", label: "Fly.io", note: "Requires FLY_API_TOKEN" },
  { id: "railway", label: "Railway", note: "Requires RAILWAY_TOKEN" },
  { id: "render", label: "Render", note: "Requires RENDER_API_KEY" },
  { id: "cloudflare", label: "Cloudflare Pages", note: "Requires CLOUDFLARE_API_TOKEN" },
];

export const DeployModal: React.FC<{
  projectId: string;
  projectName: string;
  onClose: () => void;
}> = ({ projectId, projectName, onClose }) => {
  const { notify } = useToast();
  const [provider, setProvider] = useState<DeploymentProvider>("managed-sandbox");
  const [environment, setEnvironment] = useState<"production" | "preview">("production");
  const [deployments, setDeployments] = useState<DeploymentDto[]>([]);
  const [deploying, setDeploying] = useState(false);

  const load = async () => {
    const res = await api.get<{ deployments: DeploymentDto[] }>(`/api/projects/${projectId}/deployments`);
    setDeployments(res.deployments);
  };

  useEffect(() => {
    void load();
  }, [projectId]);

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      const res = await api.post<{ deployment: DeploymentDto }>(`/api/projects/${projectId}/deploy`, {
        provider,
        environment,
      });
      notify(
        res.deployment.healthStatus === "healthy"
          ? `Published & health-verified (HTTP ${res.deployment.healthHttpCode})`
          : `Deployment status: ${res.deployment.status}`,
        res.deployment.status === "live" ? "success" : "info",
      );
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Deployment failed", "error");
    } finally {
      setDeploying(false);
    }
  };

  const handleStop = async (id: string) => {
    await api.post(`/api/deployments/${id}/stop`);
    notify("Deployment stopped", "info");
    await load();
  };

  const handleRollback = async (id: string) => {
    await api.post(`/api/deployments/${id}/rollback`);
    notify("Rolled back deployment", "success");
    await load();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl af-panel border p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <Rocket className="h-5 w-5 text-emerald-400" />
            <span>Publish & Deploy — {projectName}</span>
          </div>
          <button type="button" onClick={onClose} className="af-muted hover:text-inherit">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="mb-1 block af-muted">Target Runtime</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as DeploymentProvider)}
              className="w-full rounded-xl border af-border af-panel-2 px-3 py-2 outline-none"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.note}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block af-muted">Environment</label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as "production" | "preview")}
              className="w-full rounded-xl border af-border af-panel-2 px-3 py-2 outline-none"
            >
              <option value="production">Production (Isolated Release)</option>
              <option value="preview">Preview Stage</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={deploying}
            onClick={() => void handleDeploy()}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50"
          >
            <Rocket className="h-4 w-4" />
            <span>
              {deploying
                ? "Building & Verifying /health..."
                : deployments.some((d) => d.status === "live")
                  ? "Re-publish Production Release"
                  : "Publish & Verify Live URL"}
            </span>
          </button>
        </div>

        <div className="space-y-2.5 border-t af-border pt-4">
          <div className="text-xs font-semibold af-muted uppercase tracking-wider">
            Release History
          </div>
          {deployments.length === 0 ? (
            <div className="rounded-xl af-panel-2 border p-4 text-center text-xs af-muted">
              No releases published yet.
            </div>
          ) : (
            deployments.map((dep) => (
              <div key={dep.id} className="rounded-xl af-panel-2 border p-3.5 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{dep.provider}</span>
                    <span className="rounded bg-slate-500/15 px-1.5 py-0.5 uppercase text-[10px]">
                      {dep.environment}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        dep.status === "live"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : dep.status === "failed"
                            ? "bg-rose-500/15 text-rose-400"
                            : "bg-slate-500/15 af-muted"
                      }`}
                    >
                      {dep.healthStatus === "healthy" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {dep.status} {dep.healthHttpCode ? `(${dep.healthHttpCode})` : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {dep.url && dep.status === "live" && (
                      <a
                        href={dep.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-2.5 py-1 text-emerald-300 hover:bg-emerald-600/30"
                      >
                        <span>Open Live</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleRollback(dep.id)}
                      className="inline-flex items-center gap-1 rounded-lg border af-border px-2 py-1 af-muted hover:text-inherit"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Rollback</span>
                    </button>
                    {dep.status === "live" && (
                      <button
                        type="button"
                        onClick={() => void handleStop(dep.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2 py-1 text-rose-400 hover:bg-rose-500/10"
                      >
                        <Square className="h-3 w-3" />
                        <span>Stop</span>
                      </button>
                    )}
                  </div>
                </div>
                {dep.logsText && (
                  <pre className="max-h-24 overflow-y-auto rounded-lg bg-black/30 p-2 af-mono text-[11px] af-muted whitespace-pre-wrap">
                    {dep.logsText}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
