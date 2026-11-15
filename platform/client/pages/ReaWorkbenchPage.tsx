import React, { useEffect, useState } from "react";
import { Binary, FileCode2, Globe, Box, ShieldAlert, Play } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";

type AnalyzerMode = "openapi" | "js" | "network" | "environment" | "entropy";

export const ReaWorkbenchPage: React.FC = () => {
  const { notify } = useToast();
  const [status, setStatus] = useState<{
    providers?: unknown;
    doctor?: unknown;
    catalog?: { tools?: { total?: number; families?: Array<{ id: string; count: number }> } };
  } | null>(null);
  const [mode, setMode] = useState<AnalyzerMode>("openapi");
  const [targetPath, setTargetPath] = useState("tests/fixtures/openapi/petstore.json.txt");
  const [result, setResult] = useState<unknown>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api
      .get<typeof status>("/api/rea/status")
      .then(setStatus)
      .catch((err) => notify(err instanceof Error ? err.message : "REA status failed", "error"));
  }, [notify]);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    try {
      const endpointMap: Record<AnalyzerMode, string> = {
        openapi: "/api/rea/inspect-api-contract",
        js: "/api/rea/analyze-js",
        network: "/api/rea/inspect-network",
        environment: "/api/rea/environment-build",
        entropy: "/api/rea/inspect-entropy",
      };
      const res = await api.post<{ category: string; evidence: unknown }>(endpointMap[mode], {
        path: targetPath,
      });
      setResult(res);
      notify("REA inspection completed with structured evidence", "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Inspection failed", "error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <AppShell title="REA Reverse-Engineering Workbench">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <strong>Dedicated Reverse-Engineering Category:</strong> All REA inspection tools run isolated from AetherForge app-builder coding tools via <span className="af-mono">scripts/rea.mjs --json</span> inside repository containment boundaries.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl af-panel border p-4">
            <div className="text-[11px] uppercase af-muted font-semibold">REA Tool Catalog</div>
            <div className="mt-1 text-2xl font-bold text-indigo-400">
              {status?.catalog?.tools?.total ?? 246} Tools
            </div>
            <div className="mt-1 text-xs af-muted">
              Across {status?.catalog?.tools?.families?.length ?? 18} specialized analysis families
            </div>
          </div>
          <div className="rounded-xl af-panel border p-4 md:col-span-2">
            <div className="text-[11px] uppercase af-muted font-semibold mb-1.5">Runtime Health & Providers</div>
            <pre className="max-h-24 overflow-auto rounded-lg bg-black/30 p-2 af-mono text-[10px]">
              {JSON.stringify(status?.doctor ?? { loading: true }, null, 2)}
            </pre>
          </div>
        </div>

        <div className="rounded-xl af-panel border p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "openapi", label: "OpenAPI Contract", icon: Binary, sample: "tests/fixtures/openapi/petstore.json.txt" },
                { id: "js", label: "JavaScript App", icon: FileCode2, sample: "scripts/rea.mjs" },
                { id: "network", label: "Network Capture", icon: Globe, sample: "tests/fixtures/openapi/petstore.json.txt" },
                { id: "environment", label: "Environment Build", icon: Box, sample: "package.json" },
                { id: "entropy", label: "Binary Entropy", icon: Binary, sample: "package.json" },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setMode(item.id);
                    setTargetPath(item.sample);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium ${
                    mode === item.id
                      ? "border-indigo-500 bg-indigo-500/15 text-indigo-300"
                      : "af-border af-panel-2 af-muted"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <form onSubmit={(e) => void handleRun(e)} className="flex flex-wrap gap-2">
            <input
              type="text"
              required
              value={targetPath}
              onChange={(e) => setTargetPath(e.target.value)}
              placeholder="Repo-relative path (e.g. tests/fixtures/openapi/petstore.json.txt)"
              className="flex-1 rounded-xl border af-border af-panel-2 px-3.5 py-2 af-mono text-xs outline-none"
            />
            <button
              type="submit"
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{running ? "Inspecting..." : "Run REA Inspector"}</span>
            </button>
          </form>

          {result !== null && (
            <pre className="max-h-96 overflow-auto rounded-xl border af-border bg-black/40 p-4 af-mono text-[11px] text-emerald-300 whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </AppShell>
  );
};
