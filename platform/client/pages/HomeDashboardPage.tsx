import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Layers,
  Smartphone,
  Globe,
  Server,
  BrainCircuit,
  Paperclip,
  ArrowUpRight,
  Clock,
  Cpu,
  ShieldCheck,
  TerminalSquare,
  X,
} from "lucide-react";
import type { AppType as ProjectAppType, ProjectDto } from "@shared/types";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";

const APP_TYPES: Array<{
  id: ProjectAppType;
  label: string;
  icon: React.FC<{ className?: string }>;
  stackFrontend: string;
  stackBackend: string;
  stackDatabase: string;
}> = [
  {
    id: "fullstack",
    label: "Full Stack Website",
    icon: Layers,
    stackFrontend: "React + TypeScript + Tailwind",
    stackBackend: "Node.js + Express/HTTP",
    stackDatabase: "SQLite / FileStore",
  },
  {
    id: "mobile-expo",
    label: "Mobile App (Expo)",
    icon: Smartphone,
    stackFrontend: "Expo SDK 52 + React Native",
    stackBackend: "Node.js + REST API",
    stackDatabase: "SQLite / FileStore",
  },
  {
    id: "landing",
    label: "Marketing Landing",
    icon: Globe,
    stackFrontend: "Responsive Landing + Tailwind",
    stackBackend: "Node.js Lead Capture API",
    stackDatabase: "SQLite / FileStore",
  },
  {
    id: "api",
    label: "Backend API",
    icon: Server,
    stackFrontend: "OpenAPI Interactive Explorer",
    stackBackend: "Node.js + OpenAPI 3.0.3",
    stackDatabase: "SQLite / FileStore",
  },
];

const QUICK_IDEAS = [
  {
    title: "SprintFlow SaaS Board",
    appType: "fullstack" as ProjectAppType,
    prompt:
      "Build a full-stack team task & sprint board with task creation, priority and status filters, search, live completion KPIs, and persistent SQLite/JSON storage.",
  },
  {
    title: "PulseCRM Deal Pipeline",
    appType: "fullstack" as ProjectAppType,
    prompt:
      "Build a B2B CRM deal pipeline with company leads, deal value, stage filtering (lead/qualified/proposal/won), and revenue forecast metrics.",
  },
  {
    title: "DailyPulse Mobile App",
    appType: "mobile-expo" as ProjectAppType,
    prompt:
      "Build a cross-platform Expo React Native daily habit tracker with streak metrics, check-ins, and a synced Node REST API backend.",
  },
  {
    title: "LaunchPad SaaS Website",
    appType: "landing" as ProjectAppType,
    prompt:
      "Build a SaaS marketing website with hero, feature showcase, monthly/annual pricing toggle, FAQ accordion, and waitlist lead capture API.",
  },
];

export const HomeDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [appType, setAppType] = useState<ProjectAppType>("fullstack");
  const [backendChoice, setBackendChoice] = useState<"node" | "fastapi">("node");
  const [autonomyMode, setAutonomyMode] = useState<"build" | "plan" | "brainstorm">("build");
  const [hitlMode, setHitlMode] = useState<"interactive" | "auto">("interactive");
  const [attachments, setAttachments] = useState<Array<{ name: string; type: string; size: number }>>([]);
  const [creating, setCreating] = useState(false);
  const [recentProjects, setRecentProjects] = useState<ProjectDto[]>([]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key.toLowerCase() === "p" || e.code === "KeyP")) {
        e.preventDefault();
        setAutonomyMode((m) => (m === "build" ? "plan" : "build"));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    api
      .get<{ projects: ProjectDto[] }>("/api/projects")
      .then((res) => setRecentProjects(res.projects.slice(0, 6)))
      .catch(() => {
        // ignore
      });
  }, []);

  const handleAttachFiles = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).map((f) => ({
      name: f.name,
      type: f.type || "application/octet-stream",
      size: f.size,
    }));
    setAttachments((prev) => [...prev, ...next].slice(0, 6));
  };

  const handleCreateAndStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      notify("Describe what you want to build first", "error");
      return;
    }
    setCreating(true);
    try {
      const derivedName =
        name.trim() ||
        prompt
          .trim()
          .replace(/^(build|create|make)\s+(a|an|the)?\s*/i, "")
          .slice(0, 38) ||
        "Untitled Studio App";

      const selectedStack = APP_TYPES.find((a) => a.id === appType) ?? APP_TYPES[0]!;
      const { project } = await api.post<{ project: ProjectDto }>("/api/projects", {
        name: derivedName,
        description: prompt.trim().slice(0, 220),
        appType,
        stackFrontend: selectedStack.stackFrontend,
        stackBackend:
          backendChoice === "fastapi" && appType === "fullstack"
            ? "Python FastAPI + Node Proxy"
            : selectedStack.stackBackend,
        stackDatabase: selectedStack.stackDatabase,
        autonomyMode: autonomyMode === "plan" ? "plan" : "build",
        initialMode: autonomyMode,
        hitlMode,
        initialPrompt: prompt.trim(),
        attachments,
      });

      navigate(`/projects/${project.id}`, {
        state: {
          initialPrompt: prompt.trim(),
          initialMode: autonomyMode,
          attachments,
        },
      });
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to create project", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppShell title="Studio Home">
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-2xl af-panel border p-6 md:p-8 shadow-xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-0.5 text-[11px] font-medium text-indigo-400">
                <Sparkles className="h-3 w-3" />
                10-Agent Autonomous Engineering Pipeline
              </div>
              <h2 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">
                What do you want to build, {user?.name?.split(" ")[0] ?? "Builder"}?
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="inline-flex rounded-lg border af-border af-panel-2 p-0.5">
                {(
                  [
                    { id: "build", label: "Build Direct" },
                    { id: "plan", label: "Plan First (⌥P)" },
                    { id: "brainstorm", label: "Clarify / Brainstorm" },
                  ] as const
                ).map((modeOpt) => (
                  <button
                    key={modeOpt.id}
                    type="button"
                    onClick={() => setAutonomyMode(modeOpt.id)}
                    className={`rounded-md px-2.5 py-1 font-medium transition ${
                      autonomyMode === modeOpt.id
                        ? modeOpt.id === "plan"
                          ? "bg-amber-500/20 text-amber-300"
                          : modeOpt.id === "brainstorm"
                            ? "bg-indigo-500/20 text-indigo-300"
                            : "bg-emerald-500/20 text-emerald-300"
                        : "af-muted hover:text-inherit"
                    }`}
                  >
                    {modeOpt.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setHitlMode((h) => (h === "interactive" ? "auto" : "interactive"))}
                className="rounded-lg border af-border af-panel-2 px-2.5 py-1.5 font-medium hover:border-indigo-500/40"
              >
                HITL: {hitlMode === "auto" ? "Auto-HITL" : "Interactive"}
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {APP_TYPES.map((item) => {
                const Icon = item.icon;
                const active = appType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAppType(item.id)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-indigo-500 bg-indigo-500/15 text-indigo-300"
                        : "af-border af-panel-2 af-muted hover:text-inherit"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {appType === "fullstack" && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="af-muted">Backend:</span>
                <select
                  value={backendChoice}
                  onChange={(e) => setBackendChoice(e.target.value as "node" | "fastapi")}
                  className="rounded-lg border af-border af-panel-2 px-2 py-1 text-xs outline-none"
                >
                  <option value="node">Node.js + Express/HTTP</option>
                  <option value="fastapi">Python FastAPI Companion</option>
                </select>
              </div>
            )}
          </div>

          <form onSubmit={(e) => void handleCreateAndStart(e)} className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional project name (e.g. SprintFlow Workspace)"
              className="w-full rounded-xl border af-border af-panel-2 px-3.5 py-2 text-xs outline-none focus:border-indigo-500"
            />

            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the application, entities, workflows, APIs, and design style you want AetherForge to engineer..."
              className="w-full rounded-xl border af-border af-panel-2 p-3.5 text-sm leading-relaxed outline-none focus:border-indigo-500 resize-y"
            />

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((att, idx) => (
                  <span
                    key={`${att.name}-${idx}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border af-border af-panel-2 px-2.5 py-1 text-xs"
                  >
                    <span>{att.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <X className="h-3 w-3 af-muted hover:text-rose-400" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleAttachFiles(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border af-border af-panel-2 px-3 py-2 text-xs af-muted hover:text-inherit"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>Attach Spec / Screenshot</span>
                </button>
                <Link
                  to="/settings"
                  className="inline-flex items-center gap-1.5 rounded-xl border af-border af-panel-2 px-3 py-2 text-xs af-muted hover:text-inherit"
                >
                  <Cpu className="h-3.5 w-3.5" />
                  <span>LLM Keys & Agents</span>
                </Link>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-95 disabled:opacity-50 transition"
              >
                <Sparkles className="h-4 w-4" />
                <span>
                  {creating
                    ? "Provisioning Sandbox..."
                    : autonomyMode === "plan"
                      ? "Generate Architecture Plan"
                      : autonomyMode === "brainstorm"
                        ? "Clarify Requirements"
                        : "Build & Launch App"}
                </span>
              </button>
            </div>
          </form>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {QUICK_IDEAS.map((idea) => (
              <button
                key={idea.title}
                type="button"
                onClick={() => {
                  setName(idea.title);
                  setAppType(idea.appType);
                  setPrompt(idea.prompt);
                }}
                className="rounded-xl border af-border af-panel-2 p-3 text-left hover:border-indigo-500/50 transition"
              >
                <div className="text-xs font-semibold">{idea.title}</div>
                <div className="mt-1 line-clamp-2 text-[11px] af-muted">{idea.prompt}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl af-panel border p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400">
              <TerminalSquare className="h-4 w-4" />
              <span>Isolated Sandbox + Live Preview</span>
            </div>
            <p className="mt-1.5 text-xs af-muted leading-relaxed">
              Every project runs in an isolated subprocess with live stdout/stderr streaming, automated `node --test` checks, and reverse-proxied preview.
            </p>
          </div>
          <div className="rounded-xl af-panel border p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              <span>Checkpoints, Diffs & AES-256 Vault</span>
            </div>
            <p className="mt-1.5 text-xs af-muted leading-relaxed">
              Per-turn snapshots support instant diff inspection, selective rollback, project forking, and separated Preview vs Production encrypted secrets.
            </p>
          </div>
          <div className="rounded-xl af-panel border p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
              <Cpu className="h-4 w-4" />
              <span>REA Reverse Engineering & MCP</span>
            </div>
            <p className="mt-1.5 text-xs af-muted leading-relaxed">
              Dedicated REA workbench inspects OpenAPI contracts, JS apps, network captures, and custom MCP tools with strict permission controls.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent Workspace Projects</h3>
            <Link to="/projects" className="text-xs text-indigo-400 hover:underline">
              View all projects →
            </Link>
          </div>

          {recentProjects.length === 0 ? (
            <div className="rounded-xl af-panel border p-6 text-center text-xs af-muted">
              No projects yet. Describe an app above or pick one from{" "}
              <Link to="/templates" className="text-indigo-400 hover:underline">
                Templates
              </Link>
              .
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentProjects.map((proj) => (
                <Link
                  key={proj.id}
                  to={`/projects/${proj.id}`}
                  className="group rounded-xl af-panel border p-4 hover:border-indigo-500/50 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-sm group-hover:text-indigo-400 transition truncate">
                      {proj.name}
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 af-muted group-hover:text-indigo-400" />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs af-muted">
                    {proj.description || "Autonomous full-stack workspace"}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-[11px] af-muted">
                    <span className="rounded bg-slate-500/15 px-2 py-0.5 uppercase font-medium">
                      {proj.appType}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(proj.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
};
