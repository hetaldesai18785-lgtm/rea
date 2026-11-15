import React, { useEffect, useState } from "react";
import {
  Terminal,
  Database,
  FlaskConical,
  KeyRound,
  History,
  Wrench,
  Play,
  Trash2,
  GitFork,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import type {
  CheckpointDto,
  FileDiffDto,
  SandboxStateDto,
  SecretDto,
  TestRunDto,
} from "@shared/types";
import { api } from "../../lib/api";
import { useToast } from "../../context/ToastContext";

type WorkbenchTab = "console" | "db" | "tests" | "secrets" | "checkpoints";

export const RightWorkbench: React.FC<{
  projectId: string;
  sandboxState: SandboxStateDto | null;
  checkpoints: CheckpointDto[];
  onRefreshCheckpoints: () => Promise<void>;
  onAskFixer: (problemSummary: string) => Promise<void>;
  onRollbackSuccess: () => Promise<void>;
  onForkNavigate: (newProjectId: string) => void;
}> = ({
  projectId,
  sandboxState,
  checkpoints,
  onRefreshCheckpoints,
  onAskFixer,
  onRollbackSuccess,
  onForkNavigate,
}) => {
  const { notify } = useToast();
  const [tab, setTab] = useState<WorkbenchTab>("console");

  // Terminal state
  const [termCmd, setTermCmd] = useState("ls -la");
  const [termOut, setTermOut] = useState<string>("");
  const [runningTerm, setRunningTerm] = useState(false);

  // DB Inspector state
  const [dbData, setDbData] = useState<{
    engine: string;
    path: string | null;
    tables: Array<{ name: string; count: number; columns: string[]; sampleRows: Record<string, unknown>[] }>;
  } | null>(null);

  // API & Test Runner state
  const [apiMethod, setApiMethod] = useState<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">("GET");
  const [apiPath, setApiPath] = useState("/api/items");
  const [apiBody, setApiBody] = useState('{"title":"Verify API"}');
  const [apiResp, setApiResp] = useState<string>("");
  const [testRuns, setTestRuns] = useState<TestRunDto[]>([]);
  const [runningTests, setRunningTests] = useState(false);

  // Secrets state
  const [secrets, setSecrets] = useState<SecretDto[]>([]);
  const [secretEnv, setSecretEnv] = useState<"preview" | "production">("preview");
  const [secretKey, setSecretKey] = useState("");
  const [secretVal, setSecretVal] = useState("");

  // Checkpoints diff state
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<FileDiffDto[]>([]);

  const loadDb = async () => {
    try {
      const res = await api.get<typeof dbData>(`/api/projects/${projectId}/db`);
      setDbData(res);
    } catch {
      // ignore
    }
  };

  const loadTests = async () => {
    try {
      const res = await api.get<{ testRuns: TestRunDto[] }>(`/api/projects/${projectId}/tests`);
      setTestRuns(res.testRuns);
    } catch {
      // ignore
    }
  };

  const loadSecrets = async () => {
    try {
      const res = await api.get<{ secrets: SecretDto[] }>(`/api/projects/${projectId}/secrets`);
      setSecrets(res.secrets);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (tab === "db") void loadDb();
    if (tab === "tests") void loadTests();
    if (tab === "secrets") void loadSecrets();
    if (tab === "checkpoints") void onRefreshCheckpoints();
  }, [tab, projectId]);

  const handleExecTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termCmd.trim()) return;
    setRunningTerm(true);
    try {
      const res = await api.post<{ exitCode: number; stdout: string; stderr: string }>(
        `/api/projects/${projectId}/terminal`,
        { command: termCmd },
      );
      setTermOut(
        `$ ${termCmd}\n${res.stdout}${res.stderr ? `\n[stderr]\n${res.stderr}` : ""}\n[exit ${res.exitCode}]`,
      );
    } catch (err) {
      setTermOut(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setRunningTerm(false);
    }
  };

  const handleRunTests = async () => {
    setRunningTests(true);
    try {
      const res = await api.post<{ testRun: TestRunDto }>(`/api/projects/${projectId}/tests/run`);
      setTestRuns((prev) => [res.testRun, ...prev]);
      notify(
        `Tests ${res.testRun.status}: ${res.testRun.passed} passed, ${res.testRun.failed} failed`,
        res.testRun.status === "passed" ? "success" : "error",
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Test execution failed", "error");
    } finally {
      setRunningTests(false);
    }
  };

  const handleApiTest = async () => {
    try {
      const res = await api.post<{ status: number; durationMs: number; body: string }>(
        `/api/projects/${projectId}/api-test`,
        {
          method: apiMethod,
          path: apiPath,
          body: apiMethod !== "GET" ? apiBody : undefined,
        },
      );
      setApiResp(`HTTP ${res.status} (${res.durationMs}ms)\n${res.body}`);
    } catch (err) {
      setApiResp(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    }
  };

  const handleSaveSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put(`/api/projects/${projectId}/secrets`, {
        environment: secretEnv,
        keyName: secretKey.trim().toUpperCase(),
        value: secretVal,
      });
      setSecretKey("");
      setSecretVal("");
      notify("Secret encrypted & stored in project vault", "success");
      await loadSecrets();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to save secret", "error");
    }
  };

  const handleDeleteSecret = async (secretId: string) => {
    await api.del(`/api/projects/${projectId}/secrets/${secretId}`);
    await loadSecrets();
  };

  const handleInspectDiff = async (cpId: string) => {
    setSelectedCheckpoint(cpId);
    try {
      const res = await api.get<{ diffs: FileDiffDto[] }>(
        `/api/projects/${projectId}/checkpoints/${cpId}/diff`,
      );
      setDiffs(res.diffs);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load diff", "error");
    }
  };

  const handleRollback = async (cpId: string, mode: "messages_and_code" | "messages_only") => {
    if (!window.confirm(`Rollback workspace (${mode.replaceAll("_", " ")}) to checkpoint ${cpId}?`)) {
      return;
    }
    await api.post(`/api/projects/${projectId}/checkpoints/${cpId}/rollback`, { mode });
    notify("Rolled back successfully", "success");
    await onRollbackSuccess();
  };

  const handleFork = async () => {
    const name = window.prompt("Name for forked project:", "Forked Studio App");
    if (!name) return;
    const res = await api.post<{ newProjectId: string }>(`/api/projects/${projectId}/fork`, { name });
    notify("Forked project created", "success");
    onForkNavigate(res.newProjectId);
  };

  const tabs: Array<{ id: WorkbenchTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: "console", label: "Console", icon: Terminal },
    { id: "db", label: "Database", icon: Database },
    { id: "tests", label: "API & Tests", icon: FlaskConical },
    { id: "secrets", label: "Secrets", icon: KeyRound },
    { id: "checkpoints", label: "Checkpoints", icon: History },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-1 overflow-x-auto border-b af-border px-2 py-1.5">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                active ? "bg-indigo-500/20 text-indigo-300" : "af-muted hover:text-inherit"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-3 text-xs space-y-3">
        {tab === "console" && (
          <div className="space-y-3">
            {sandboxState && sandboxState.problems.length > 0 && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 space-y-2">
                <div className="flex items-center justify-between font-semibold text-rose-300">
                  <span>Detected Problems ({sandboxState.problems.length})</span>
                  <button
                    type="button"
                    onClick={() =>
                      void onAskFixer(
                        sandboxState.problems.map((p) => `[${p.source}] ${p.message}`).join("\n"),
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] text-white hover:bg-rose-500"
                  >
                    <Wrench className="h-3 w-3" />
                    <span>Auto-Fix Problems</span>
                  </button>
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto af-mono text-[11px] text-rose-200">
                  {sandboxState.problems.map((p, idx) => (
                    <div key={`${p.timestamp}-${idx}`}>
                      • [{p.source}] {p.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between af-muted">
                <span className="font-semibold uppercase text-[10px]">Sandbox Runtime Output</span>
                <span className="af-mono text-[10px]">
                  {sandboxState?.status === "running" ? `PID ${sandboxState.pid} • :${sandboxState.port}` : "Stopped"}
                </span>
              </div>
              <pre className="h-44 overflow-y-auto rounded-xl border af-border bg-black/40 p-2.5 af-mono text-[11px] text-slate-300 whitespace-pre-wrap">
                {sandboxState?.logs?.length ? sandboxState.logs.join("\n") : "No runtime logs yet."}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="font-semibold uppercase text-[10px] af-muted">Workspace Terminal</div>
              <form onSubmit={(e) => void handleExecTerminal(e)} className="flex gap-1.5">
                <input
                  type="text"
                  value={termCmd}
                  onChange={(e) => setTermCmd(e.target.value)}
                  placeholder="npm test, ls -la, node -v..."
                  className="flex-1 rounded-lg border af-border af-panel-2 px-2.5 py-1.5 af-mono text-[11px] outline-none"
                />
                <button
                  type="submit"
                  disabled={runningTerm}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  {runningTerm ? "..." : "Run"}
                </button>
              </form>
              {termOut && (
                <pre className="max-h-40 overflow-y-auto rounded-xl border af-border bg-black/40 p-2.5 af-mono text-[11px] text-emerald-300 whitespace-pre-wrap">
                  {termOut}
                </pre>
              )}
            </div>
          </div>
        )}

        {tab === "db" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="af-muted">
                Engine: <strong className="text-inherit">{dbData?.engine ?? "Detecting..."}</strong>
              </span>
              <button
                type="button"
                onClick={() => void loadDb()}
                className="inline-flex items-center gap-1 rounded-lg border af-border px-2 py-1 hover:bg-slate-500/10"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Refresh</span>
              </button>
            </div>

            {!dbData || dbData.tables.length === 0 ? (
              <div className="rounded-xl af-panel-2 border p-4 text-center af-muted">
                No records or tables created yet. Start the preview app and add items!
              </div>
            ) : (
              dbData.tables.map((t) => (
                <div key={t.name} className="rounded-xl af-panel-2 border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-indigo-300">{t.name}</span>
                    <span className="rounded bg-slate-500/15 px-2 py-0.5 text-[10px]">{t.count} rows</span>
                  </div>
                  <div className="text-[10px] af-muted af-mono">Columns: {t.columns.join(", ") || "dynamic"}</div>
                  <pre className="max-h-40 overflow-auto rounded-lg bg-black/30 p-2 af-mono text-[11px]">
                    {JSON.stringify(t.sampleRows, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "tests" && (
          <div className="space-y-4">
            <div className="rounded-xl af-panel-2 border p-3 space-y-2">
              <div className="font-semibold text-[11px] uppercase af-muted">Live HTTP API Tester</div>
              <div className="flex gap-1.5">
                <select
                  value={apiMethod}
                  onChange={(e) => setApiMethod(e.target.value as typeof apiMethod)}
                  className="rounded-lg border af-border bg-black/20 px-2 py-1.5 af-mono text-[11px]"
                >
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>PATCH</option>
                  <option>DELETE</option>
                </select>
                <input
                  type="text"
                  value={apiPath}
                  onChange={(e) => setApiPath(e.target.value)}
                  className="flex-1 rounded-lg border af-border bg-black/20 px-2.5 py-1.5 af-mono text-[11px] outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleApiTest()}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  Send
                </button>
              </div>
              {apiMethod !== "GET" && (
                <textarea
                  rows={2}
                  value={apiBody}
                  onChange={(e) => setApiBody(e.target.value)}
                  className="w-full rounded-lg border af-border bg-black/20 p-2 af-mono text-[11px] outline-none"
                />
              )}
              {apiResp && (
                <pre className="max-h-36 overflow-auto rounded-lg bg-black/40 p-2 af-mono text-[11px] text-emerald-300 whitespace-pre-wrap">
                  {apiResp}
                </pre>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[11px] uppercase af-muted">Automated Test Runs</span>
                <button
                  type="button"
                  disabled={runningTests}
                  onClick={() => void handleRunTests()}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white"
                >
                  <Play className="h-3 w-3" />
                  <span>{runningTests ? "Running..." : "Run Suite"}</span>
                </button>
              </div>

              {testRuns.map((run) => (
                <div key={run.id} className="rounded-xl af-panel-2 border p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-semibold ${
                        run.status === "passed" ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {run.status.toUpperCase()} ({run.passed} passed / {run.failed} failed)
                    </span>
                    <span className="af-muted text-[10px]">{run.durationMs}ms</span>
                  </div>
                  <pre className="max-h-32 overflow-auto rounded-lg bg-black/30 p-2 af-mono text-[10px] whitespace-pre-wrap">
                    {run.outputText}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "secrets" && (
          <div className="space-y-3">
            <div className="flex gap-1.5">
              {(["preview", "production"] as const).map((env) => (
                <button
                  key={env}
                  type="button"
                  onClick={() => setSecretEnv(env)}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-medium capitalize ${
                    secretEnv === env
                      ? "border-indigo-500 bg-indigo-500/15 text-indigo-300"
                      : "af-border af-panel-2 af-muted"
                  }`}
                >
                  {env} Vault
                </button>
              ))}
            </div>

            <form onSubmit={(e) => void handleSaveSecret(e)} className="rounded-xl af-panel-2 border p-3 space-y-2">
              <input
                type="text"
                required
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="KEY_NAME (e.g. STRIPE_SECRET_KEY)"
                className="w-full rounded-lg border af-border bg-black/20 px-2.5 py-1.5 af-mono text-[11px] outline-none"
              />
              <input
                type="password"
                required
                value={secretVal}
                onChange={(e) => setSecretVal(e.target.value)}
                placeholder="Secret value (stored AES-256-GCM encrypted)"
                className="w-full rounded-lg border af-border bg-black/20 px-2.5 py-1.5 text-[11px] outline-none"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-indigo-600 py-1.5 text-[11px] font-semibold text-white"
              >
                Encrypt & Save to {secretEnv}
              </button>
            </form>

            <div className="space-y-1.5">
              {secrets
                .filter((s) => s.environment === secretEnv)
                .map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-xl af-panel-2 border px-3 py-2"
                  >
                    <div>
                      <div className="af-mono font-semibold text-[11px]">{s.keyName}</div>
                      <div className="af-mono text-[10px] af-muted">{s.valueHint}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteSecret(s.id)}
                      className="af-muted hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {tab === "checkpoints" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold uppercase text-[10px] af-muted">
                Snapshot History ({checkpoints.length})
              </span>
              <button
                type="button"
                onClick={() => void handleFork()}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1 text-[11px] text-indigo-300"
              >
                <GitFork className="h-3 w-3" />
                <span>Fork Project</span>
              </button>
            </div>

            {checkpoints.map((cp) => (
              <div key={cp.id} className="rounded-xl af-panel-2 border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{cp.label}</div>
                    <div className="text-[10px] af-muted">
                      {cp.filesCount} files • {new Date(cp.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleInspectDiff(cp.id)}
                    className="rounded-lg border af-border px-2 py-1 text-[10px] hover:border-indigo-500/40"
                  >
                    Diff
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleRollback(cp.id, "messages_and_code")}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600/20 border border-amber-500/30 px-2 py-1 text-[10px] text-amber-300"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Rollback Code & Chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRollback(cp.id, "messages_only")}
                    className="rounded-lg border af-border px-2 py-1 text-[10px] af-muted"
                  >
                    Chat Only
                  </button>
                </div>

                {selectedCheckpoint === cp.id && (
                  <div className="mt-2 space-y-1.5 border-t af-border pt-2">
                    {diffs.length === 0 ? (
                      <div className="text-[11px] af-muted">Workspace matches this checkpoint cleanly.</div>
                    ) : (
                      diffs.map((d) => (
                        <div key={d.path} className="rounded-lg bg-black/30 p-2 af-mono text-[10px]">
                          <span className="uppercase font-bold text-indigo-300 mr-1.5">[{d.change}]</span>
                          <span>{d.path}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
