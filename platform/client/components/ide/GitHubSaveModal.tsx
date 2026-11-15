import React, { useEffect, useState } from "react";
import { Github, GitBranch, UploadCloud, Plus, X, ShieldAlert } from "lucide-react";
import type { GitHubConnectionStatus, GitHubRepoDto } from "@shared/types";
import { api } from "../../lib/api";
import { useToast } from "../../context/ToastContext";

export const GitHubSaveModal: React.FC<{
  projectId: string;
  projectName: string;
  onClose: () => void;
}> = ({ projectId, projectName, onClose }) => {
  const { notify } = useToast();
  const [status, setStatus] = useState<GitHubConnectionStatus | null>(null);
  const [repos, setRepos] = useState<GitHubRepoDto[]>([]);
  const [repoFullName, setRepoFullName] = useState("");
  const [branch, setBranch] = useState("main");
  const [commitMessage, setCommitMessage] = useState(`feat: update ${projectName}`);
  const [newRepoName, setNewRepoName] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [confirmPush, setConfirmPush] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadGitHub = async () => {
    try {
      const st = await api.get<GitHubConnectionStatus>("/api/github/status");
      setStatus(st);
      if (st.connected) {
        const repoRes = await api.get<{ repos: GitHubRepoDto[] }>("/api/github/repos");
        setRepos(repoRes.repos);
        if (repoRes.repos[0] && !repoFullName) {
          setRepoFullName(repoRes.repos[0].fullName);
          setBranch(repoRes.repos[0].defaultBranch || "main");
        }
      }
    } catch {
      // ignore initial error
    }
  };

  useEffect(() => {
    void loadGitHub();
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    try {
      const st = await api.post<GitHubConnectionStatus>("/api/github/connect", {
        token: tokenInput,
        source: "pat",
      });
      setStatus(st);
      setTokenInput("");
      notify(`Connected GitHub as @${st.username}`, "success");
      await loadGitHub();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to connect GitHub", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleLocalCommit = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ commitHash: string; branch: string }>(
        `/api/projects/${projectId}/git/commit`,
        { message: commitMessage, branch },
      );
      notify(`Committed locally (${res.commitHash.slice(0, 7)}) on ${res.branch}`, "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Local commit failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) return;
    if (!confirmPush) {
      notify("Check the explicit confirmation box before creating a remote repository", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ repo: GitHubRepoDto }>("/api/github/repos", {
        name: newRepoName.trim(),
        isPrivate: true,
        confirmDestructive: true,
      });
      notify(`Created private repo ${res.repo.fullName}`, "success");
      setRepos((prev) => [res.repo, ...prev]);
      setRepoFullName(res.repo.fullName);
      setNewRepoName("");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Repo creation failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const handlePush = async () => {
    if (!repoFullName) {
      notify("Select a GitHub repository first", "error");
      return;
    }
    if (!confirmPush) {
      notify("Confirm remote GitHub push first", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ pushed: boolean; commitHash: string }>(
        `/api/projects/${projectId}/git/push`,
        {
          repoFullName,
          branch,
          commitMessage,
          confirmDestructive: true,
        },
      );
      notify(`Pushed ${res.commitHash.slice(0, 7)} to ${repoFullName}:${branch}`, "success");
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Push failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl af-panel border p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <Github className="h-5 w-5" />
            <span>Save to GitHub</span>
          </div>
          <button type="button" onClick={onClose} className="af-muted hover:text-inherit">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-xl af-panel-2 border p-3 text-xs">
          {status?.connected ? (
            <div className="flex items-center justify-between">
              <span>
                Connected as <strong className="text-emerald-400">@{status.username}</strong> (
                {status.authSource})
              </span>
              <span className="af-mono af-muted">{status.tokenHint}</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="af-muted">
                Connect a GitHub Personal Access Token (or use sandbox environment credentials):
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="ghp_..."
                  className="flex-1 rounded-lg border af-border bg-transparent px-3 py-1.5 text-xs outline-none"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleConnect()}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Connect
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="mb-1 block af-muted">Commit Message</label>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              className="w-full rounded-lg border af-border af-panel-2 px-3 py-2 outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block af-muted">Target Repository</label>
              <select
                value={repoFullName}
                onChange={(e) => setRepoFullName(e.target.value)}
                className="w-full rounded-lg border af-border af-panel-2 px-3 py-2 outline-none"
              >
                <option value="">-- Select repository --</option>
                {repos.map((r) => (
                  <option key={r.fullName} value={r.fullName}>
                    {r.fullName} ({r.private ? "private" : "public"})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block af-muted">Branch</label>
              <div className="flex items-center gap-1.5 rounded-lg border af-border af-panel-2 px-3 py-2">
                <GitBranch className="h-3.5 w-3.5 af-muted" />
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full bg-transparent outline-none"
                />
              </div>
            </div>
          </div>

          {status?.connected && (
            <div className="flex gap-2">
              <input
                type="text"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                placeholder="Or create new private repo name..."
                className="flex-1 rounded-lg border af-border af-panel-2 px-3 py-1.5 outline-none"
              />
              <button
                type="button"
                disabled={busy || !newRepoName.trim()}
                onClick={() => void handleCreateRepo()}
                className="inline-flex items-center gap-1 rounded-lg border af-border px-3 py-1.5 hover:border-indigo-500/40"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Repo</span>
              </button>
            </div>
          )}

          <label className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmPush}
              onChange={(e) => setConfirmPush(e.target.checked)}
              className="mt-0.5"
            />
            <span className="leading-snug">
              <ShieldAlert className="inline h-3.5 w-3.5 mr-1" />
              I confirm pushing workspace commits or creating remote repositories on GitHub (remote mutation gate).
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleLocalCommit()}
            className="rounded-xl border af-border px-3.5 py-2 text-xs font-medium hover:bg-slate-500/10"
          >
            Commit Locally Only
          </button>
          <button
            type="button"
            disabled={busy || !status?.connected}
            onClick={() => void handlePush()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <UploadCloud className="h-4 w-4" />
            <span>{busy ? "Syncing..." : "Commit & Push to GitHub"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
