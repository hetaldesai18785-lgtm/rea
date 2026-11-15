import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  GitFork,
  Trash2,
  ArrowUpRight,
  CircleDot,
} from "lucide-react";
import type { ProjectDto } from "@shared/types";
import { AppShell } from "../components/AppShell";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ projects: ProjectDto[] }>("/api/projects");
      setProjects(res.projects);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load projects", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  const handleFork = async (proj: ProjectDto) => {
    const forkName = window.prompt("Fork project name:", `${proj.name} (Fork)`);
    if (!forkName) return;
    try {
      const res = await api.post<{ newProjectId: string }>(`/api/projects/${proj.id}/fork`, {
        name: forkName,
      });
      notify("Forked workspace & snapshots into independent project", "success");
      navigate(`/projects/${res.newProjectId}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Fork failed", "error");
    }
  };

  const handleDelete = async (proj: ProjectDto) => {
    if (!window.confirm(`Permanently delete "${proj.name}" and its local sandbox files?`)) {
      return;
    }
    try {
      await api.del(`/api/projects/${proj.id}`);
      notify("Project deleted", "success");
      setProjects((prev) => prev.filter((p) => p.id !== proj.id));
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to delete project", "error");
    }
  };

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AppShell title="Workspace Projects">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-xl border af-border af-panel px-3 py-2 w-full sm:w-80">
            <Search className="h-4 w-4 af-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter projects..."
              className="w-full bg-transparent text-xs outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/templates"
              className="rounded-xl border af-border af-panel px-3.5 py-2 text-xs font-medium hover:border-indigo-500/40"
            >
              Browse Templates
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Project</span>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl af-panel border p-8 text-center text-xs af-muted">
            Loading workspace projects...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl af-panel border p-8 text-center text-xs af-muted">
            No matching projects found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((proj) => (
              <div
                key={proj.id}
                className="flex flex-col justify-between rounded-xl af-panel border p-4 hover:border-indigo-500/40 transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/projects/${proj.id}`}
                      className="text-sm font-semibold hover:text-indigo-400 truncate"
                    >
                      {proj.name}
                    </Link>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        proj.status === "running"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : proj.status === "error"
                            ? "bg-rose-500/15 text-rose-400"
                            : "bg-slate-500/15 af-muted"
                      }`}
                    >
                      <CircleDot className="h-2.5 w-2.5" />
                      {proj.status}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs af-muted">
                    {proj.description || "Isolated sandbox project"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                    <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-indigo-400 font-medium">
                      {proj.appType}
                    </span>
                    <span className="rounded bg-slate-500/15 px-2 py-0.5 af-muted">
                      {proj.stackFrontend}
                    </span>
                    <span className="rounded bg-slate-500/15 px-2 py-0.5 af-muted">
                      {proj.stackBackend}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t af-border pt-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleFork(proj)}
                      title="Fork workspace"
                      className="rounded-lg border af-border p-1.5 af-muted hover:text-indigo-400"
                    >
                      <GitFork className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(proj)}
                      title="Delete project"
                      className="rounded-lg border af-border p-1.5 af-muted hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Link
                    to={`/projects/${proj.id}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600/20 border border-indigo-500/30 px-3 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-600/30"
                  >
                    <span>Open Studio</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
};
