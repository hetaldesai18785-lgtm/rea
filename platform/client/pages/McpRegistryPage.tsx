import React, { useEffect, useState } from "react";
import { Cpu, Plug, Play, Trash2, Plus, Shield } from "lucide-react";
import type { McpServerDto } from "@shared/types";

type McpPermissionMode = McpServerDto["permissionMode"];
import { AppShell } from "../components/AppShell";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";

export const McpRegistryPage: React.FC = () => {
  const { notify } = useToast();
  const [servers, setServers] = useState<McpServerDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toolName, setToolName] = useState("");
  const [toolArgs, setToolArgs] = useState("{}");
  const [toolOutput, setToolOutput] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // New server form
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http">("stdio");
  const [command, setCommand] = useState("node");
  const [argsText, setArgsText] = useState("");
  const [url, setUrl] = useState("");
  const [permissionMode, setPermissionMode] = useState<McpPermissionMode>("read-only");

  const loadServers = async () => {
    const res = await api.get<{ servers: McpServerDto[] }>("/api/mcp/servers");
    setServers(res.servers);
    if (!selectedId && res.servers[0]) {
      setSelectedId(res.servers[0].id);
    }
  };

  useEffect(() => {
    void loadServers();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post<{ server: McpServerDto }>("/api/mcp/servers", {
        name,
        transport,
        command: transport === "stdio" ? command : null,
        args: transport === "stdio" ? argsText.split(/\s+/).filter(Boolean) : [],
        url: transport === "http" ? url : null,
        permissionMode,
      });
      setName("");
      setArgsText("");
      setUrl("");
      setSelectedId(res.server.id);
      notify(`Registered MCP server "${res.server.name}"`, "success");
      await loadServers();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to register server", "error");
    }
  };

  const handleConnect = async (serverId: string) => {
    setBusyId(serverId);
    try {
      const res = await api.post<{ server: McpServerDto }>(`/api/mcp/servers/${serverId}/connect`);
      notify(
        `Discovered ${res.server.tools.length} tools from ${res.server.name}`,
        "success",
      );
      await loadServers();
      if (res.server.tools[0]) {
        setToolName(res.server.tools[0].name);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Discovery failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handlePermissionChange = async (serverId: string, mode: McpPermissionMode) => {
    await api.patch(`/api/mcp/servers/${serverId}/permissions`, { permissionMode: mode });
    notify(`Updated permission policy to ${mode}`, "info");
    await loadServers();
  };

  const handleInvoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !toolName) return;
    setBusyId(selectedId);
    try {
      const parsed = JSON.parse(toolArgs || "{}");
      const out = await api.post<unknown>(`/api/mcp/servers/${selectedId}/invoke`, {
        toolName,
        arguments: parsed,
      });
      setToolOutput(JSON.stringify(out, null, 2));
      notify(`Executed ${toolName}`, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invocation failed";
      setToolOutput(`Error: ${msg}`);
      notify(msg, "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (serverId: string) => {
    try {
      await api.del(`/api/mcp/servers/${serverId}`);
      notify("Removed MCP server", "info");
      await loadServers();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Cannot remove server", "error");
    }
  };

  const selectedServer = servers.find((s) => s.id === selectedId) ?? null;

  return (
    <AppShell title="MCP Client & Tool Discovery">
      <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl af-panel border p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Plus className="h-4 w-4 text-indigo-400" />
              <span>Register Custom MCP Server</span>
            </div>
            <form onSubmit={(e) => void handleRegister(e)} className="space-y-2.5 text-xs">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Server name (e.g. Postgres Read-Only)"
                className="w-full rounded-lg border af-border af-panel-2 px-3 py-2 outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={transport}
                  onChange={(e) => setTransport(e.target.value as "stdio" | "http")}
                  className="rounded-lg border af-border af-panel-2 px-2.5 py-2 outline-none"
                >
                  <option value="stdio">stdio</option>
                  <option value="http">StreamableHTTP</option>
                </select>
                <select
                  value={permissionMode}
                  onChange={(e) => setPermissionMode(e.target.value as McpPermissionMode)}
                  className="rounded-lg border af-border af-panel-2 px-2.5 py-2 outline-none"
                >
                  <option value="read-only">read-only</option>
                  <option value="standard">standard</option>
                  <option value="restricted">restricted</option>
                </select>
              </div>
              {transport === "stdio" ? (
                <>
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="Command (e.g. node)"
                    className="w-full rounded-lg border af-border af-panel-2 px-3 py-2 af-mono outline-none"
                  />
                  <input
                    type="text"
                    value={argsText}
                    onChange={(e) => setArgsText(e.target.value)}
                    placeholder="Arguments separated by spaces"
                    className="w-full rounded-lg border af-border af-panel-2 px-3 py-2 af-mono outline-none"
                  />
                </>
              ) : (
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/mcp"
                  className="w-full rounded-lg border af-border af-panel-2 px-3 py-2 af-mono outline-none"
                />
              )}
              <button
                type="submit"
                className="w-full rounded-lg bg-indigo-600 py-2 font-semibold text-white hover:bg-indigo-500"
              >
                Save MCP Server
              </button>
            </form>
          </div>

          <div className="space-y-2.5">
            {servers.map((srv) => (
              <div
                key={srv.id}
                onClick={() => setSelectedId(srv.id)}
                className={`cursor-pointer rounded-xl af-panel border p-4 space-y-2 transition ${
                  selectedId === srv.id ? "border-indigo-500" : "hover:border-indigo-500/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 font-semibold text-sm">
                      <Cpu className="h-4 w-4 text-indigo-400" />
                      <span>{srv.name}</span>
                    </div>
                    <div className="text-[11px] af-muted af-mono">
                      {srv.transport} • {srv.tools.length} tools • {srv.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={busyId === srv.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleConnect(srv.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-2.5 py-1 text-[11px] text-emerald-300"
                    >
                      <Plug className="h-3 w-3" />
                      <span>{busyId === srv.id ? "..." : "Discover"}</span>
                    </button>
                    {srv.scope !== "system-rea" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(srv.id);
                        }}
                        className="rounded-lg p-1 af-muted hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t af-border pt-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 af-muted">
                    <Shield className="h-3 w-3" />
                    Policy:
                  </span>
                  <select
                    value={srv.permissionMode}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      void handlePermissionChange(srv.id, e.target.value as McpPermissionMode)
                    }
                    className="rounded border af-border af-panel-2 px-2 py-0.5 text-[11px]"
                  >
                    <option value="read-only">read-only</option>
                    <option value="standard">standard</option>
                    <option value="restricted">restricted</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          {selectedServer ? (
            <div className="rounded-xl af-panel border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">{selectedServer.name}</h2>
                  <p className="text-xs af-muted">
                    {selectedServer.tools.length} discovered tools • mode:{" "}
                    <strong>{selectedServer.permissionMode}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleConnect(selectedServer.id)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Refresh Tool Catalog
                </button>
              </div>

              <form onSubmit={(e) => void handleInvoke(e)} className="rounded-xl af-panel-2 border p-4 space-y-3 text-xs">
                <div className="font-semibold text-[11px] uppercase af-muted">
                  Interactive Tool Runner
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={toolName}
                    onChange={(e) => setToolName(e.target.value)}
                    className="rounded-lg border af-border bg-black/20 px-2.5 py-2 af-mono outline-none"
                  >
                    <option value="">-- Select discovered tool --</option>
                    {selectedServer.tools.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={!toolName || busyId === selectedServer.id}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-white disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Invoke Tool</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={toolArgs}
                  onChange={(e) => setToolArgs(e.target.value)}
                  placeholder='{"path": "tests/fixtures/openapi/petstore.json.txt"}'
                  className="w-full rounded-lg border af-border bg-black/25 p-2.5 af-mono text-[11px] outline-none"
                />
                {toolOutput && (
                  <pre className="max-h-60 overflow-auto rounded-lg bg-black/40 p-3 af-mono text-[11px] text-emerald-300 whitespace-pre-wrap">
                    {toolOutput}
                  </pre>
                )}
              </form>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase af-muted">
                  Discovered Tools ({selectedServer.tools.length})
                </div>
                <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                  {selectedServer.tools.length === 0 ? (
                    <div className="rounded-xl af-panel-2 border p-4 text-center text-xs af-muted">
                      Click "Refresh Tool Catalog" above to connect over MCP and discover live tools.
                    </div>
                  ) : (
                    selectedServer.tools.slice(0, 60).map((t) => (
                      <div
                        key={t.name}
                        onClick={() => setToolName(t.name)}
                        className="cursor-pointer rounded-lg af-panel-2 border px-3 py-2 hover:border-indigo-500/40"
                      >
                        <div className="flex items-center justify-between">
                          <span className="af-mono text-xs font-semibold text-indigo-300">{t.name}</span>
                          <span className="text-[10px] af-muted">Click to load</span>
                        </div>
                        {t.description && <div className="mt-0.5 text-[11px] af-muted">{t.description}</div>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl af-panel border p-8 text-center text-xs af-muted">
              Select an MCP server on the left to inspect its tools.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
};
