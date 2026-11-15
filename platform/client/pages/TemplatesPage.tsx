import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Rocket, Layers } from "lucide-react";
import type { ProjectDto, TemplateDto } from "@shared/types";
import { AppShell } from "../components/AppShell";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";

export const TemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [creatingId, setCreatingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ templates: TemplateDto[] }>("/api/templates")
      .then((res) => setTemplates(res.templates))
      .catch((err) => notify(err.message, "error"));
  }, [notify]);

  const categories = ["all", ...Array.from(new Set(templates.map((t) => t.category)))];
  const filtered = templates.filter((t) => {
    const matchCat = category === "all" || t.category === category;
    const matchText =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchText;
  });

  const handleUseTemplate = async (tpl: TemplateDto) => {
    setCreatingId(tpl.id);
    try {
      const { project } = await api.post<{ project: ProjectDto }>("/api/projects", {
        name: tpl.title,
        description: tpl.description,
        appType: tpl.appType,
        autonomyMode: "build",
        hitlMode: "interactive",
        initialPrompt: tpl.prompt,
      });
      notify(`Created "${tpl.title}" — launching agent build`, "success");
      navigate(`/projects/${project.id}`, {
        state: { initialPrompt: tpl.prompt, initialMode: "build" },
      });
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to launch template", "error");
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <AppShell title="Starter Templates">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-xl border af-border af-panel px-3 py-2 w-full sm:w-80">
            <Search className="h-4 w-4 af-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="w-full bg-transparent text-xs outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-lg border px-2.5 py-1 text-xs capitalize ${
                  category === cat
                    ? "border-indigo-500 bg-indigo-500/15 text-indigo-300"
                    : "af-border af-panel af-muted"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((tpl) => (
            <div key={tpl.id} className="flex flex-col justify-between rounded-xl af-panel border p-5">
              <div>
                <div className="flex items-center justify-between text-[11px] af-muted">
                  <span className="inline-flex items-center gap-1 text-indigo-400 font-medium">
                    <Layers className="h-3.5 w-3.5" />
                    {tpl.category}
                  </span>
                  <span className="uppercase">{tpl.appType}</span>
                </div>
                <h3 className="mt-2 text-base font-semibold">{tpl.title}</h3>
                <p className="mt-1.5 text-xs af-muted leading-relaxed">{tpl.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tpl.tags.map((tag) => (
                    <span key={tag} className="rounded bg-slate-500/15 px-2 py-0.5 text-[10px] af-muted">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 border-t af-border pt-3 flex items-center justify-between">
                <span className="text-[11px] af-muted">
                  {tpl.stackFrontend} • {tpl.stackBackend}
                </span>
                <button
                  type="button"
                  disabled={creatingId === tpl.id}
                  onClick={() => void handleUseTemplate(tpl)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Rocket className="h-3.5 w-3.5" />
                  <span>{creatingId === tpl.id ? "Creating..." : "Use Template"}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
};
