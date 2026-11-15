import React, { useEffect, useState } from "react";
import { KeyRound, Cpu, Github, User, Plus, Trash2, Save } from "lucide-react";
import type {
  AgentConfigDto,
  GitHubConnectionStatus,
  LlmProviderDto,
  LlmProviderKind as LlmProviderName,
} from "@shared/types";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";

export const SettingsPage: React.FC = () => {
  const { user, theme, toggleTheme, refreshMe } = useAuth();
  const { notify } = useToast();

  const [displayName, setDisplayName] = useState(user?.name ?? "");
  const [providers, setProviders] = useState<LlmProviderDto[]>([]);
  const [agents, setAgents] = useState<AgentConfigDto[]>([]);
  const [githubStatus, setGithubStatus] = useState<GitHubConnectionStatus | null>(null);
  const [ghToken, setGhToken] = useState("");

  // New LLM provider form
  const [provType, setProvType] = useState<LlmProviderName>("openai");
  const [provLabel, setProvLabel] = useState("OpenAI GPT");
  const [provModel, setProvModel] = useState("gpt-4.1");
  const [provBaseUrl, setProvBaseUrl] = useState("");
  const [provApiKey, setProvApiKey] = useState("");

  const loadAll = async () => {
    const [pRes, aRes, gRes] = await Promise.all([
      api.get<{ providers: LlmProviderDto[] }>("/api/settings/llm-providers"),
      api.get<{ agents: AgentConfigDto[] }>("/api/settings/agents"),
      api.get<GitHubConnectionStatus>("/api/github/status"),
    ]);
    setProviders(pRes.providers);
    setAgents(aRes.agents);
    setGithubStatus(gRes);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.patch("/api/auth/me", { name: displayName });
    await refreshMe();
    notify("Profile updated", "success");
  };

  const handleAddProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post("/api/settings/llm-providers", {
      provider: provType,
      label: provLabel,
      defaultModel: provModel,
      baseUrl: provBaseUrl || null,
      apiKey: provApiKey || undefined,
    });
    setProvApiKey("");
    notify("LLM provider encrypted & saved", "success");
    await loadAll();
  };

  const handleDeleteProvider = async (id: string) => {
    await api.del(`/api/settings/llm-providers/${id}`);
    notify("Provider removed", "info");
    await loadAll();
  };

  const handleTestProvider = async (id: string) => {
    try {
      const res = await api.post<{
        ok: boolean;
        provider: string;
        model: string;
        latencyMs: number;
        preview?: string;
        error?: string;
      }>(`/api/settings/llm-providers/${id}/test`);
      notify(
        res.ok
          ? `${res.provider} (${res.model}) reachable in ${res.latencyMs}ms`
          : `Provider check failed: ${res.error ?? "error"}`,
        res.ok ? "success" : "error",
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Test failed", "error");
    }
  };

  const handleSaveAgent = async (ag: AgentConfigDto) => {
    await api.put(`/api/settings/agents/${ag.agentRole}`, {
      providerId: ag.providerId,
      modelName: ag.modelName,
      systemPromptOverride: ag.systemPromptOverride,
      temperature: ag.temperature,
      maxIterations: ag.maxIterations,
      enabled: ag.enabled,
    });
    notify(`Updated ${ag.agentRole} agent configuration`, "success");
    await loadAll();
  };

  const handleConnectGitHub = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const st = await api.post<GitHubConnectionStatus>("/api/github/connect", {
        token: ghToken,
        source: "pat",
      });
      setGithubStatus(st);
      setGhToken("");
      notify(`Connected GitHub as @${st.username}`, "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to connect GitHub", "error");
    }
  };

  return (
    <AppShell title="Studio Settings">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Profile & Theme */}
        <section className="rounded-xl af-panel border p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <User className="h-4 w-4 text-indigo-400" />
            <span>Profile & Appearance</span>
          </div>
          <form onSubmit={(e) => void handleSaveProfile(e)} className="flex flex-wrap items-end gap-3 text-xs">
            <div className="flex-1 min-w-56">
              <label className="mb-1 block af-muted">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border af-border af-panel-2 px-3 py-2 outline-none"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save Profile</span>
            </button>
            <button
              type="button"
              onClick={() => void toggleTheme()}
              className="rounded-lg border af-border af-panel-2 px-4 py-2 font-medium"
            >
              Active Theme: {theme.toUpperCase()}
            </button>
          </form>
        </section>

        {/* LLM Providers */}
        <section className="rounded-xl af-panel border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <KeyRound className="h-4 w-4 text-emerald-400" />
              <span>LLM Providers & Encrypted Keys</span>
            </div>
            <span className="text-[11px] af-muted">AES-256-GCM Encrypted at Rest</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {providers.map((p) => (
              <div key={p.id} className="rounded-xl af-panel-2 border p-3.5 flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{p.label}</div>
                  <div className="af-mono text-[11px] af-muted">
                    {p.provider} • {p.defaultModel}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px]">
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        p.status === "ready"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {p.status}
                    </span>
                    {p.keyHint && <span className="af-mono af-muted">{p.keyHint}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleTestProvider(p.id)}
                    className="rounded-lg border af-border px-2 py-1 text-[11px] hover:border-indigo-500/40"
                  >
                    Test
                  </button>
                  {p.provider !== "local-blueprint" && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteProvider(p.id)}
                      className="af-muted hover:text-rose-400 p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={(e) => void handleAddProvider(e)} className="rounded-xl af-panel-2 border p-4 space-y-3 text-xs">
            <div className="flex items-center gap-1.5 font-semibold">
              <Plus className="h-3.5 w-3.5 text-indigo-400" />
              <span>Add / Update LLM Provider</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={provType}
                onChange={(e) => setProvType(e.target.value as LlmProviderName)}
                className="rounded-lg border af-border bg-black/20 px-2.5 py-2 outline-none"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Google Gemini</option>
                <option value="openrouter">OpenRouter</option>
                <option value="openai-compatible">OpenAI-Compatible (Ollama/vLLM)</option>
              </select>
              <input
                type="text"
                required
                value={provLabel}
                onChange={(e) => setProvLabel(e.target.value)}
                placeholder="Label"
                className="rounded-lg border af-border bg-black/20 px-2.5 py-2 outline-none"
              />
              <input
                type="text"
                required
                value={provModel}
                onChange={(e) => setProvModel(e.target.value)}
                placeholder="Model name"
                className="rounded-lg border af-border bg-black/20 px-2.5 py-2 af-mono outline-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={provBaseUrl}
                onChange={(e) => setProvBaseUrl(e.target.value)}
                placeholder="Optional custom base URL (e.g. http://localhost:11434/v1)"
                className="rounded-lg border af-border bg-black/20 px-2.5 py-2 af-mono outline-none"
              />
              <input
                type="password"
                value={provApiKey}
                onChange={(e) => setProvApiKey(e.target.value)}
                placeholder="API Key (stored encrypted, never echoed)"
                className="rounded-lg border af-border bg-black/20 px-2.5 py-2 outline-none"
              />
            </div>
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white">
              Save LLM Provider
            </button>
          </form>
        </section>

        {/* GitHub Connection */}
        <section className="rounded-xl af-panel border p-5 space-y-3 text-xs">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Github className="h-4 w-4" />
            <span>GitHub Connection</span>
          </div>
          {githubStatus?.connected ? (
            <div className="rounded-xl af-panel-2 border p-3 flex items-center justify-between">
              <span>
                Connected as <strong className="text-emerald-400">@{githubStatus.username}</strong> (
                {githubStatus.authSource})
              </span>
              <span className="af-mono af-muted">{githubStatus.tokenHint}</span>
            </div>
          ) : null}
          <form onSubmit={(e) => void handleConnectGitHub(e)} className="flex flex-wrap gap-2">
            <input
              type="password"
              required
              value={ghToken}
              onChange={(e) => setGhToken(e.target.value)}
              placeholder="Paste GitHub Personal Access Token to update..."
              className="flex-1 rounded-lg border af-border af-panel-2 px-3 py-2 outline-none"
            />
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white">
              Connect GitHub Token
            </button>
          </form>
        </section>

        {/* 10-Agent Configuration */}
        <section className="rounded-xl af-panel border p-5 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Cpu className="h-4 w-4 text-indigo-400" />
            <span>10-Agent Specialized Pipeline Configuration</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {agents.map((ag) => (
              <div key={ag.id} className="rounded-xl af-panel-2 border p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold uppercase text-indigo-300">{ag.agentRole}</span>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ag.enabled}
                      onChange={(e) =>
                        setAgents((prev) =>
                          prev.map((x) =>
                            x.id === ag.id ? { ...x, enabled: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                    <span>Enabled</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={ag.providerId ?? ""}
                    onChange={(e) =>
                      setAgents((prev) =>
                        prev.map((x) =>
                          x.id === ag.id ? { ...x, providerId: e.target.value || null } : x,
                        ),
                      )
                    }
                    className="rounded-lg border af-border bg-black/20 px-2 py-1.5 outline-none"
                  >
                    <option value="">Default Provider</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={ag.modelName}
                    onChange={(e) =>
                      setAgents((prev) =>
                        prev.map((x) => (x.id === ag.id ? { ...x, modelName: e.target.value } : x)),
                      )
                    }
                    className="rounded-lg border af-border bg-black/20 px-2 py-1.5 af-mono outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleSaveAgent(ag)}
                  className="rounded-lg border af-border px-3 py-1 hover:border-indigo-500/40"
                >
                  Save Agent
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
};
