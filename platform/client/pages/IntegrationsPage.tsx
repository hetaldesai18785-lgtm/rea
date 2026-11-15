import React, { useEffect, useState } from "react";
import { PlugZap, CheckCircle2, AlertTriangle } from "lucide-react";
import type { MarketplaceIntegrationDto, ProjectDto } from "@shared/types";
import { AppShell } from "../components/AppShell";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";

export const IntegrationsPage: React.FC = () => {
  const { notify } = useToast();
  const [integrations, setIntegrations] = useState<MarketplaceIntegrationDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [category, setCategory] = useState("all");
  const [statusMap, setStatusMap] = useState<Record<string, { status: string; missingKeys?: string[] }>>({});

  useEffect(() => {
    Promise.all([
      api.get<{ integrations: MarketplaceIntegrationDto[] }>("/api/integrations"),
      api.get<{ projects: ProjectDto[] }>("/api/projects"),
    ])
      .then(([intRes, projRes]) => {
        setIntegrations(intRes.integrations);
        setProjects(projRes.projects);
        if (projRes.projects[0]) {
          setSelectedProjectId(projRes.projects[0].id);
        }
      })
      .catch((err) => notify(err instanceof Error ? err.message : "Load error", "error"));
  }, [notify]);

  const categories = ["all", ...Array.from(new Set(integrations.map((i) => i.category)))];
  const filtered = integrations.filter((i) => category === "all" || i.category === category);

  const handleAttach = async (item: MarketplaceIntegrationDto) => {
    if (!selectedProjectId) {
      notify("Create a project first before attaching an integration", "error");
      return;
    }
    try {
      const res = await api.put<{ ok: boolean; status: string; missingKeys: string[] }>(
        `/api/projects/${selectedProjectId}/integrations/${item.id}`,
        { configuredAt: new Date().toISOString() },
      );
      setStatusMap((prev) => ({ ...prev, [item.id]: res }));
      notify(
        res.status === "configured"
          ? `${item.name} attached & verified`
          : `${item.name} attached — add missing secrets (${res.missingKeys.join(", ")}) in Project Secrets`,
        res.status === "configured" ? "success" : "info",
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Attach failed", "error");
    }
  };

  return (
    <AppShell title="Marketplace Integrations">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl af-panel border p-4">
          <div className="text-xs space-y-0.5">
            <div className="font-semibold text-sm">Bind Integrations to Project Vault</div>
            <div className="af-muted">
              Select a target project to audit environment keys and connect payment, database, AI, or auth integrations.
            </div>
          </div>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="rounded-xl border af-border af-panel-2 px-3 py-2 text-xs outline-none"
          >
            <option value="">-- Select Project --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-lg border px-2.5 py-1 text-xs capitalize ${
                category === c
                  ? "border-indigo-500 bg-indigo-500/15 text-indigo-300"
                  : "af-border af-panel af-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const attached = statusMap[item.id];
            return (
              <div key={item.id} className="flex flex-col justify-between rounded-xl af-panel border p-5 space-y-3">
                <div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="inline-flex items-center gap-1 uppercase font-semibold text-indigo-400">
                      <PlugZap className="h-3.5 w-3.5" />
                      {item.category}
                    </span>
                    {attached && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                          attached.status === "configured"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {attached.status === "configured" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        {attached.status}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 font-semibold text-sm">{item.name}</h3>
                  <p className="mt-1 text-xs af-muted leading-relaxed">{item.description}</p>
                  {item.requiredEnvKeys.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {item.requiredEnvKeys.map((k) => (
                        <span
                          key={k}
                          className="rounded bg-black/30 border af-border px-1.5 py-0.5 af-mono text-[10px] af-muted"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t af-border pt-3 text-xs">
                  <span className="text-[11px] af-muted truncate max-w-[140px]" title={item.playbookSummary}>
                    {item.requiredEnvKeys.length > 0 ? `${item.requiredEnvKeys.length} env key(s)` : "Ready"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleAttach(item)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    Attach to Project
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
};
