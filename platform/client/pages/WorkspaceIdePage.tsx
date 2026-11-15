import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Play,
  Square,
  RotateCw,
  Github,
  Rocket,
  Sun,
  Moon,
  Monitor,
  Tablet,
  Smartphone,
  MousePointerClick,
  Code2,
  Eye,
  Send,
  FilePlus2,
  Save,
  Trash2,
  CheckCircle2,
  BrainCircuit,
  StopCircle,
  ExternalLink,
  Paperclip,
  Loader2,
  QrCode,
  Sparkles,
  X,
} from "lucide-react";
import type {
  AgentStepDto,
  ChatMessageDto,
  CheckpointDto,
  ProjectDto,
  ProjectFileEntry,
  SandboxStateDto,
} from "@shared/types";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api, subscribeProjectEvents } from "../lib/api";
import { DeployModal } from "../components/ide/DeployModal";
import { GitHubSaveModal } from "../components/ide/GitHubSaveModal";
import { RightWorkbench } from "../components/ide/RightWorkbench";

export const WorkspaceIdePage: React.FC = () => {
  const { id: projectId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useAuth();
  const { notify } = useToast();

  const [project, setProject] = useState<ProjectDto | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [steps, setSteps] = useState<AgentStepDto[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointDto[]>([]);
  const [files, setFiles] = useState<ProjectFileEntry[]>([]);
  const [sandboxState, setSandboxState] = useState<SandboxStateDto | null>(null);

  const [centerMode, setCenterMode] = useState<"preview" | "code">("preview");
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [canvasEdit, setCanvasEdit] = useState(false);
  const [selectedCanvasTarget, setSelectedCanvasTarget] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"chat" | "center" | "workbench">("center");

  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [dirtyFile, setDirtyFile] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Array<{ name: string; type: string; size: number }>>([]);
  const [running, setRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);

  const [showGitModal, setShowGitModal] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrPayload, setQrPayload] = useState<{
    previewUrl: string;
    expUrl: string;
    svg: string;
  } | null>(null);

  const initialAutoRunRef = useRef(false);
  const initialViewportSetRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);

  const refreshWorkspaceData = useCallback(async () => {
    if (!projectId) return;
    const [projRes, msgRes, runsRes, cpRes, filesRes, sbRes] = await Promise.all([
      api.get<{ project: ProjectDto }>(`/api/projects/${projectId}`),
      api.get<{ messages: ChatMessageDto[] }>(`/api/projects/${projectId}/messages`),
      api.get<{ steps: AgentStepDto[] }>(`/api/projects/${projectId}/runs`),
      api.get<{ checkpoints: CheckpointDto[] }>(`/api/projects/${projectId}/checkpoints`),
      api.get<{ files: ProjectFileEntry[] }>(`/api/projects/${projectId}/files`),
      api.get<{ state: SandboxStateDto }>(`/api/projects/${projectId}/preview/status`),
    ]);
    setProject(projRes.project);
    if (!initialViewportSetRef.current && projRes.project.appType === "mobile-expo") {
      initialViewportSetRef.current = true;
      setViewport("mobile");
    }
    setMessages(msgRes.messages);
    setSteps(runsRes.steps);
    setCheckpoints(cpRes.checkpoints);
    setFiles(filesRes.files);
    setSandboxState(sbRes.state);

    if (!activeFile && filesRes.files.length > 0) {
      const preferred =
        filesRes.files.find((f) => f.path.endsWith("app.js")) ??
        filesRes.files.find((f) => f.path.endsWith("index.html")) ??
        filesRes.files[0];
      if (preferred) {
        setActiveFile(preferred.path);
        const f = await api.get<{ content: string }>(
          `/api/projects/${projectId}/file?path=${encodeURIComponent(preferred.path)}`,
        );
        setFileContent(f.content);
        setDirtyFile(false);
      }
    }
  }, [projectId, activeFile]);

  useEffect(() => {
    void refreshWorkspaceData().catch((err) => {
      notify(err instanceof Error ? err.message : "Failed to load project", "error");
    });
  }, [projectId]);

  // Listen for runtime console/uncaught errors posted from the preview iframe
  useEffect(() => {
    if (!projectId) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; message?: string; source?: string } | null;
      if (data?.type !== "aetherforge:preview-error" || !data.message) return;
      const summary = data.source ? `${data.message} (${data.source})` : data.message;
      void api
        .post(`/api/projects/${projectId}/preview/report-error`, { message: summary })
        .then(() => refreshWorkspaceData())
        .catch(() => {});
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [projectId, refreshWorkspaceData]);

  const handleOpenQrModal = async () => {
    setShowQrModal(true);
    try {
      const res = await api.get<{ previewUrl: string; expUrl: string; svg: string }>(
        `/api/projects/${projectId}/mobile-qr`,
      );
      setQrPayload(res);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to generate QR code", "error");
    }
  };

  // Subscribe to SSE live events
  useEffect(() => {
    if (!projectId) return;
    const unsub = subscribeProjectEvents(projectId, (eventName, payload) => {
      if (eventName === "run.started") {
        const p = payload as { id: string };
        setRunning(true);
        setActiveRunId(p.id);
      } else if (eventName === "step.started") {
        const step = payload as AgentStepDto;
        setSteps((prev) => [...prev, step]);
      } else if (eventName === "step.completed" || eventName === "step.failed") {
        const step = payload as AgentStepDto;
        setSteps((prev) => prev.map((s) => (s.id === step.id ? step : s)));
      } else if (eventName === "message.created") {
        const msg = payload as ChatMessageDto;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      } else if (eventName === "run.completed") {
        setRunning(false);
        setActiveRunId(null);
        setPreviewNonce((n) => n + 1);
        void refreshWorkspaceData();
      } else if (eventName === "log") {
        const p = payload as { line: string };
        setSandboxState((prev) =>
          prev ? { ...prev, logs: [...prev.logs.slice(-180), p.line] } : prev,
        );
      } else if (eventName === "checkpoint.created") {
        void api
          .get<{ checkpoints: CheckpointDto[] }>(`/api/projects/${projectId}/checkpoints`)
          .then((r) => setCheckpoints(r.checkpoints));
      }
    });
    return unsub;
  }, [projectId, refreshWorkspaceData]);

  // Trigger initial build/plan if redirected from Studio Home or Templates
  useEffect(() => {
    const state = location.state as {
      initialPrompt?: string;
      initialMode?: "build" | "plan";
      attachments?: Array<{ name: string; type: string; size: number }>;
    } | null;
    if (!project || initialAutoRunRef.current) return;
    if (state?.initialPrompt && messages.length === 0) {
      initialAutoRunRef.current = true;
      void runChatPrompt(state.initialPrompt, state.initialMode, state.attachments);
    }
  }, [project, messages.length, location.state]);

  // Option/Alt+P hotkey for toggling Plan/Build
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key.toLowerCase() === "p" || e.code === "KeyP")) {
        e.preventDefault();
        void handleToggleAutonomyMode();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && centerMode === "code" && activeFile) {
        e.preventDefault();
        void handleSaveFile();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, steps.length]);

  const runChatPrompt = async (
    text: string,
    modeOverride?: "plan" | "build" | "modify" | "debug" | "test" | "brainstorm",
    attOverride?: Array<{ name: string; type: string; size: number }>,
  ) => {
    if (!projectId || !text.trim()) return;
    setRunning(true);
    try {
      await api.post(`/api/projects/${projectId}/chat`, {
        prompt: text.trim(),
        mode: modeOverride,
        attachments: attOverride ?? attachments,
      });
      setAttachments([]);
      await refreshWorkspaceData();
      setPreviewNonce((n) => n + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Agent run failed", "error");
    } finally {
      setRunning(false);
      setActiveRunId(null);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || running) return;
    const content = selectedCanvasTarget
      ? `[Canvas Edit Target: ${selectedCanvasTarget}] ${prompt.trim()}`
      : prompt.trim();
    setPrompt("");
    setSelectedCanvasTarget(null);
    await runChatPrompt(content);
  };

  const handleApprovePlan = async (messageId: string) => {
    setRunning(true);
    try {
      await api.post(`/api/projects/${projectId}/messages/${messageId}/approve-plan`);
      notify("Plan approved — full-stack app synthesized & verified", "success");
      await refreshWorkspaceData();
      setPreviewNonce((n) => n + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Plan execution failed", "error");
    } finally {
      setRunning(false);
    }
  };

  const handleCancelRun = async () => {
    if (!activeRunId) return;
    await api.post(`/api/projects/${projectId}/runs/${activeRunId}/cancel`);
    notify("Cancellation requested", "info");
  };

  const handleToggleAutonomyMode = async () => {
    if (!project) return;
    const next = project.autonomyMode === "build" ? "plan" : "build";
    const res = await api.patch<{ project: ProjectDto }>(`/api/projects/${projectId}`, {
      autonomyMode: next,
    });
    setProject(res.project);
    notify(`Switched agent mode to ${next.toUpperCase()}`, "info");
  };

  const handleToggleHitl = async () => {
    if (!project) return;
    const next = project.hitlMode === "interactive" ? "auto" : "interactive";
    const res = await api.patch<{ project: ProjectDto }>(`/api/projects/${projectId}`, {
      hitlMode: next,
    });
    setProject(res.project);
  };

  const handleStartPreview = async () => {
    const res = await api.post<{ state: SandboxStateDto }>(`/api/projects/${projectId}/preview/start`);
    setSandboxState(res.state);
    setPreviewNonce((n) => n + 1);
    notify(
      res.state.status === "running"
        ? `Sandbox running on port ${res.state.port}`
        : `Sandbox ${res.state.status}: ${res.state.lastError ?? ""}`,
      res.state.status === "running" ? "success" : "error",
    );
  };

  const handleStopPreview = async () => {
    await api.post(`/api/projects/${projectId}/preview/stop`);
    const res = await api.get<{ state: SandboxStateDto }>(`/api/projects/${projectId}/preview/status`);
    setSandboxState(res.state);
    notify("Sandbox stopped", "info");
  };

  const handleOpenFile = async (path: string) => {
    const res = await api.get<{ content: string }>(
      `/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`,
    );
    setActiveFile(path);
    setFileContent(res.content);
    setDirtyFile(false);
    setCenterMode("code");
  };

  const handleSaveFile = async () => {
    if (!activeFile) return;
    await api.put(`/api/projects/${projectId}/file`, { path: activeFile, content: fileContent });
    setDirtyFile(false);
    notify(`Saved ${activeFile}`, "success");
    await refreshWorkspaceData();
  };

  const handleNewFile = async () => {
    const filePath = window.prompt("New relative file path (e.g. src/notes.txt):");
    if (!filePath) return;
    await api.put(`/api/projects/${projectId}/file`, { path: filePath.trim(), content: "" });
    await refreshWorkspaceData();
    await handleOpenFile(filePath.trim());
  };

  const handleDeleteFile = async (path: string) => {
    if (!window.confirm(`Delete ${path}?`)) return;
    await api.del(`/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`);
    if (activeFile === path) {
      setActiveFile(null);
      setFileContent("");
    }
    await refreshWorkspaceData();
  };

  // Attach same-origin Canvas Edit selector listener inside Live Preview iframe
  const attachCanvasInspector = () => {
    if (!canvasEdit || !iframeRef.current) return;
    try {
      const doc = iframeRef.current.contentDocument;
      if (!doc) return;
      doc.body.style.cursor = "crosshair";
      doc.onclick = (ev: MouseEvent) => {
        if (!canvasEdit) return;
        ev.preventDefault();
        ev.stopPropagation();
        const el = ev.target as HTMLElement | null;
        if (!el) return;
        const label = [
          el.tagName.toLowerCase(),
          el.id ? `#${el.id}` : "",
          el.textContent ? `"${el.textContent.trim().slice(0, 40)}"` : "",
        ]
          .filter(Boolean)
          .join(" ");
        setSelectedCanvasTarget(label);
        notify(`Selected canvas element: ${label}`, "info");
      };
    } catch {
      // ignore if preview not loaded
    }
  };

  useEffect(() => {
    attachCanvasInspector();
  }, [canvasEdit, previewNonce]);

  const previewUrl = `/preview/${projectId}/?v=${previewNonce}`;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      {/* Studio Top Bar */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b af-panel px-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 rounded-lg border af-border px-2 py-1 text-xs af-muted hover:text-inherit"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Projects</span>
          </Link>
          <div className="truncate font-semibold text-sm">
            {project?.name ?? "Loading Studio..."}
          </div>
          {project && (
            <span className="hidden md:inline rounded bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium uppercase text-indigo-300">
              {project.appType}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          {project && (
            <>
              <button
                type="button"
                onClick={() => void handleToggleAutonomyMode()}
                title="Toggle Plan/Build (Option+P)"
                className={`hidden sm:inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-medium ${
                  project.autonomyMode === "plan"
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                    : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                }`}
              >
                <BrainCircuit className="h-3.5 w-3.5" />
                <span>{project.autonomyMode === "plan" ? "Plan" : "Build"}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleToggleHitl()}
                className="hidden lg:inline-flex rounded-lg border af-border af-panel-2 px-2 py-1 text-[11px]"
              >
                {project.hitlMode === "auto" ? "Auto-HITL" : "Interactive"}
              </button>
            </>
          )}

          {sandboxState?.status === "running" ? (
            <button
              type="button"
              onClick={() => void handleStopPreview()}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-emerald-300"
            >
              <Square className="h-3 w-3" />
              <span className="hidden sm:inline">:{sandboxState.port}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleStartPreview()}
              className="inline-flex items-center gap-1 rounded-lg border af-border af-panel-2 px-2.5 py-1 hover:border-emerald-500/40"
            >
              <Play className="h-3 w-3 text-emerald-400" />
              <span className="hidden sm:inline">Run</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowGitModal(true)}
            className="inline-flex items-center gap-1 rounded-lg border af-border af-panel-2 px-2.5 py-1 hover:border-indigo-500/40"
          >
            <Github className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Save to GitHub</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDeployModal(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-600 to-emerald-600 px-3 py-1 font-semibold text-white hover:opacity-95"
          >
            <Rocket className="h-3.5 w-3.5" />
            <span>Publish</span>
          </button>

          <button
            type="button"
            onClick={() => void toggleTheme()}
            className="rounded-lg border af-border p-1.5 af-muted hover:text-inherit"
            title="Toggle dark/light theme"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      {/* Mobile responsive pane selector */}
      <div className="flex lg:hidden border-b af-border af-panel text-xs">
        {(
          [
            { id: "chat", label: "Agent Chat" },
            { id: "center", label: "Preview & Code" },
            { id: "workbench", label: "Workbench" },
          ] as const
        ).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setMobilePane(p.id)}
            className={`flex-1 py-2 font-medium border-b-2 ${
              mobilePane === p.id ? "border-indigo-500 text-indigo-400" : "border-transparent af-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 3-Panel Split Workspace */}
      <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* LEFT PANEL: Agent Chat + Plan Cards + Live Steps */}
        <section
          className={`${
            mobilePane === "chat" ? "flex" : "hidden lg:flex"
          } lg:col-span-3 min-h-0 flex-col border-r af-panel overflow-hidden`}
        >
          <div className="flex items-center justify-between border-b af-border px-3 py-2 text-xs font-semibold">
            <span>Agent Timeline</span>
            {running && (
              <span className="inline-flex items-center gap-1 text-indigo-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Running
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-xl border p-3 space-y-2 ${
                  msg.role === "user"
                    ? "border-indigo-500/30 bg-indigo-500/10"
                    : "af-border af-panel-2"
                }`}
              >
                <div className="flex items-center justify-between text-[10px] af-muted">
                  <span className="font-semibold uppercase text-indigo-300">
                    {msg.role === "user" ? "You" : msg.agentRole ?? msg.role}
                  </span>
                  <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                </div>

                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                {msg.plan && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-2">
                    <div className="font-semibold text-amber-300">{msg.plan.summary}</div>
                    <div className="text-[11px] af-muted">
                      Stack: {msg.plan.stack.frontend} • {msg.plan.stack.backend} •{" "}
                      {msg.plan.stack.database}
                    </div>
                    <ul className="space-y-1 text-[11px]">
                      {msg.plan.acceptanceCriteria.slice(0, 6).map((t: string, i: number) => (
                        <li key={i}>• {t}</li>
                      ))}
                    </ul>
                    {msg.planStatus === "pending" ? (
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          disabled={running}
                          onClick={() => void handleApprovePlan(msg.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Looks Good, Build It</span>
                        </button>
                      </div>
                    ) : (
                      <div className="text-[10px] font-semibold uppercase text-emerald-400">
                        Plan {msg.planStatus}
                      </div>
                    )}
                  </div>
                )}

                {msg.checkpointId && (
                  <div className="text-[10px] af-muted border-t af-border pt-1.5">
                    Checkpoint saved: <span className="af-mono">{msg.checkpointId}</span>
                  </div>
                )}
              </div>
            ))}

            {steps.length > 0 && (
              <div className="rounded-xl border af-border bg-black/25 p-2.5 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase af-muted">
                  Recent Agent Steps ({steps.slice(-8).length} shown)
                </div>
                {steps.slice(-8).map((st) => (
                  <div key={st.id} className="flex items-start gap-2 text-[11px]">
                    <span
                      className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                        st.status === "completed"
                          ? "bg-emerald-400"
                          : st.status === "failed"
                            ? "bg-rose-400"
                            : "bg-indigo-400 animate-pulse"
                      }`}
                    />
                    <div className="min-w-0">
                      <span className="font-semibold text-indigo-300 mr-1">[{st.agentRole}]</span>
                      <span>{st.action} ({st.toolName})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={(e) => void handleSendChat(e)} className="border-t af-border p-2.5 space-y-2">
            {selectedCanvasTarget && (
              <div className="flex items-center justify-between rounded-lg bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-[11px] text-amber-200">
                <span className="truncate">Target: {selectedCanvasTarget}</span>
                <button type="button" onClick={() => setSelectedCanvasTarget(null)} className="ml-2">
                  ×
                </button>
              </div>
            )}

            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask agents to add features, edit layout, fix bugs..."
              className="w-full rounded-xl border af-border af-panel-2 p-2.5 text-xs outline-none focus:border-indigo-500 resize-none"
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <input
                  ref={attachInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (!e.target.files) return;
                    setAttachments(
                      Array.from(e.target.files).map((f) => ({
                        name: f.name,
                        type: f.type || "file",
                        size: f.size,
                      })),
                    );
                  }}
                />
                <button
                  type="button"
                  onClick={() => attachInputRef.current?.click()}
                  className="rounded-lg border af-border p-1.5 af-muted hover:text-inherit"
                  title="Attach file/spec"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
                {attachments.length > 0 && (
                  <span className="text-[10px] af-muted">{attachments.length} file(s)</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {running && activeRunId && (
                  <button
                    type="button"
                    onClick={() => void handleCancelRun()}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-2.5 py-1 text-xs text-rose-400"
                  >
                    <StopCircle className="h-3.5 w-3.5" />
                    <span>Stop</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={running || !prompt.trim()}
                  onClick={() => {
                    const text = prompt.trim();
                    if (!text) return;
                    setPrompt("");
                    void runChatPrompt(text, "brainstorm");
                  }}
                  title="Ask clarifying scope/architecture questions first"
                  className="inline-flex items-center gap-1 rounded-lg border af-border af-panel-2 px-2.5 py-1.5 text-xs af-muted hover:text-inherit disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Clarify</span>
                </button>
                <button
                  type="submit"
                  disabled={running || !prompt.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* CENTER PANEL: Live Preview + Canvas Edit + Code Editor */}
        <section
          className={`${
            mobilePane === "center" ? "flex" : "hidden lg:flex"
          } lg:col-span-5 min-h-0 flex-col border-r af-panel overflow-hidden`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b af-border px-3 py-1.5 text-xs">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCenterMode("preview")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium ${
                  centerMode === "preview" ? "bg-indigo-500/20 text-indigo-300" : "af-muted"
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setCenterMode("code")}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium ${
                  centerMode === "code" ? "bg-indigo-500/20 text-indigo-300" : "af-muted"
                }`}
              >
                <Code2 className="h-3.5 w-3.5" />
                <span>Code ({files.length})</span>
              </button>
            </div>

            {centerMode === "preview" && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setViewport("desktop")}
                  className={`rounded p-1 ${viewport === "desktop" ? "bg-indigo-500/20 text-indigo-300" : "af-muted"}`}
                  title="Desktop"
                >
                  <Monitor className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewport("tablet")}
                  className={`rounded p-1 ${viewport === "tablet" ? "bg-indigo-500/20 text-indigo-300" : "af-muted"}`}
                  title="Tablet"
                >
                  <Tablet className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewport("mobile")}
                  className={`rounded p-1 ${viewport === "mobile" ? "bg-indigo-500/20 text-indigo-300" : "af-muted"}`}
                  title="Mobile"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setCanvasEdit((v) => !v)}
                  className={`ml-1 inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] ${
                    canvasEdit
                      ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                      : "af-border af-muted"
                  }`}
                  title="Click any element in preview to target edits"
                >
                  <MousePointerClick className="h-3 w-3" />
                  <span>Canvas</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewNonce((n) => n + 1)}
                  className="rounded p-1 af-muted hover:text-inherit"
                  title="Refresh preview"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
                <a
                  href={`/preview/${projectId}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded p-1 af-muted hover:text-inherit"
                  title="Open preview in new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </div>

          {centerMode === "preview" ? (
            <div className="flex flex-1 flex-col items-center justify-center bg-slate-950/50 p-2 overflow-hidden">
              {project?.appType === "mobile-expo" && (
                <div className="mb-2 flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-[11px] text-indigo-200">
                  <span>Expo Mobile Simulator + Native Source (<code>mobile/App.tsx</code>)</span>
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:inline af-mono">exp://studio/{projectId}</span>
                    <button
                      type="button"
                      onClick={() => void handleOpenQrModal()}
                      className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-indigo-500"
                    >
                      <QrCode className="h-3 w-3" />
                      <span>QR / Expo</span>
                    </button>
                  </div>
                </div>
              )}
              {sandboxState?.status === "running" ? (
                <div
                  className="h-full overflow-hidden rounded-xl border af-border bg-white shadow-2xl transition-all"
                  style={{
                    width:
                      viewport === "desktop" ? "100%" : viewport === "tablet" ? "768px" : "390px",
                    maxWidth: "100%",
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    title="Live Sandbox Preview"
                    src={previewUrl}
                    onLoad={attachCanvasInspector}
                    className="h-full w-full border-0"
                  />
                </div>
              ) : (
                <div className="rounded-2xl af-panel-2 border p-6 text-center max-w-sm space-y-3">
                  <div className="text-sm font-semibold">Sandbox Preview Stopped</div>
                  <p className="text-xs af-muted">
                    Start the isolated project sandbox or send a Build prompt in Agent Chat to compile and serve your live application.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleStartPreview()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Start Sandbox Preview</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid flex-1 min-h-0 grid-cols-1 sm:grid-cols-12 overflow-hidden">
              <div className="sm:col-span-4 max-h-44 sm:max-h-none border-b sm:border-b-0 sm:border-r af-border overflow-y-auto p-2 space-y-1 text-xs">
                <div className="flex items-center justify-between px-1 pb-1 af-muted text-[10px] uppercase font-semibold">
                  <span>Files</span>
                  <button type="button" onClick={() => void handleNewFile()} title="New file">
                    <FilePlus2 className="h-3.5 w-3.5 hover:text-indigo-400" />
                  </button>
                </div>
                {files.map((f) => (
                  <div
                    key={f.path}
                    className={`group flex items-center justify-between rounded-lg px-2 py-1 cursor-pointer ${
                      activeFile === f.path ? "bg-indigo-500/20 text-indigo-300" : "af-muted hover:text-inherit"
                    }`}
                    onClick={() => void handleOpenFile(f.path)}
                  >
                    <span className="truncate af-mono text-[11px]">{f.path}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteFile(f.path);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:text-rose-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="sm:col-span-8 min-h-0 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b af-border px-3 py-1.5 text-xs">
                  <span className="af-mono text-[11px] truncate">
                    {activeFile ?? "Select a file"} {dirtyFile ? "• modified" : ""}
                  </span>
                  {activeFile && (
                    <button
                      type="button"
                      onClick={() => void handleSaveFile()}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                    >
                      <Save className="h-3 w-3" />
                      <span>Save</span>
                    </button>
                  )}
                </div>
                <textarea
                  value={fileContent}
                  onChange={(e) => {
                    setFileContent(e.target.value);
                    setDirtyFile(true);
                  }}
                  spellCheck={false}
                  className="flex-1 bg-black/30 p-3 af-mono text-xs leading-relaxed outline-none resize-none"
                />
              </div>
            </div>
          )}
        </section>

        {/* RIGHT PANEL: Workbench (Console/Terminal, DB, Tests, Secrets, Checkpoints) */}
        <section
          className={`${
            mobilePane === "workbench" ? "flex" : "hidden lg:flex"
          } lg:col-span-4 min-h-0 flex-col af-panel overflow-hidden`}
        >
          <RightWorkbench
            projectId={projectId}
            sandboxState={sandboxState}
            checkpoints={checkpoints}
            onRefreshCheckpoints={async () => {
              const cpRes = await api.get<{ checkpoints: CheckpointDto[] }>(
                `/api/projects/${projectId}/checkpoints`,
              );
              setCheckpoints(cpRes.checkpoints);
            }}
            onAskFixer={async (problemSummary) => {
              await runChatPrompt(`Fix these runtime problems:\n${problemSummary}`, "debug");
            }}
            onRollbackSuccess={refreshWorkspaceData}
            onForkNavigate={(newId) => navigate(`/projects/${newId}`)}
          />
        </section>
      </div>

      {showGitModal && project && (
        <GitHubSaveModal
          projectId={projectId}
          projectName={project.name}
          onClose={() => setShowGitModal(false)}
        />
      )}

      {showDeployModal && project && (
        <DeployModal
          projectId={projectId}
          projectName={project.name}
          onClose={() => setShowDeployModal(false)}
        />
      )}

      {showQrModal && project && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl af-panel border p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Mobile Device & Expo Preview</h3>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="rounded-lg p-1 af-muted hover:text-inherit"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {qrPayload ? (
              <div className="space-y-3 text-xs">
                <div
                  className="mx-auto flex w-44 h-44 items-center justify-center rounded-xl bg-white p-2"
                  dangerouslySetInnerHTML={{ __html: qrPayload.svg }}
                />
                <div className="rounded-xl af-panel-2 border p-2.5 space-y-1">
                  <div className="text-[10px] uppercase af-muted font-semibold">Mobile Web Simulator URL</div>
                  <div className="af-mono text-[11px] break-all">{qrPayload.previewUrl}</div>
                </div>
                <div className="rounded-xl af-panel-2 border p-2.5 space-y-1">
                  <div className="text-[10px] uppercase af-muted font-semibold">Expo Go Deep Link</div>
                  <div className="af-mono text-[11px] break-all">{qrPayload.expUrl}</div>
                </div>
                <p className="text-[11px] af-muted leading-relaxed">
                  Full Expo SDK 52 React Native sources are generated in <code>mobile/App.tsx</code> and{" "}
                  <code>mobile/src/screens/*.tsx</code>. Run <code>cd mobile && npx expo start</code> locally or push to GitHub for EAS cloud builds.
                </p>
              </div>
            ) : (
              <div className="py-8 text-center text-xs af-muted">Generating QR code...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
