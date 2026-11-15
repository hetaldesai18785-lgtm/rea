import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { McpServerDto } from "../../../shared/types.js";
import { REA_CLI_SCRIPT, REPO_ROOT } from "../../config/env.js";
import { decryptSecret, encryptSecret } from "../../crypto/security.js";
import type { PlatformDatabase } from "../../db/database.js";

interface McpServerRow {
  id: string;
  workspace_id: string;
  name: string;
  scope: "system-rea" | "public" | "private";
  transport: "stdio" | "http";
  command: string | null;
  args_json: string;
  url: string | null;
  encrypted_env_json: string | null;
  permission_mode: "read-only" | "standard" | "restricted";
  status: "connected" | "disconnected" | "error";
  tools_cache_json: string;
  last_verified_at: string | null;
  created_at: string;
}

const MUTATING_MCP_TOOL_PATTERNS = [
  /^install_/,
  /^uninstall_/,
  /^push_/,
  /^start_/,
  /^stop_/,
  /^execute_/,
  /^write_/,
  /^delete_/,
  /^create_/,
  /^update_/,
  /^instrument_/,
  /^annotate_/,
];

export class McpManager {
  readonly #db: PlatformDatabase;
  readonly #liveClients = new Map<string, { client: Client; close: () => Promise<void> }>();

  constructor(db: PlatformDatabase) {
    this.#db = db;
  }

  private mapRow(row: McpServerRow): McpServerDto {
    let args: string[] = [];
    let tools: McpServerDto["tools"] = [];
    try {
      args = JSON.parse(row.args_json) as string[];
    } catch {
      args = [];
    }
    try {
      tools = JSON.parse(row.tools_cache_json) as McpServerDto["tools"];
    } catch {
      tools = [];
    }
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      scope: row.scope,
      transport: row.transport,
      command: row.command,
      args,
      url: row.url,
      permissionMode: row.permission_mode,
      status: row.status,
      toolCount: tools.length,
      tools,
      lastVerifiedAt: row.last_verified_at,
      createdAt: row.created_at,
    };
  }

  listServers(workspaceId: string): McpServerDto[] {
    const rows = this.#db.all<McpServerRow>(
      "SELECT * FROM mcp_servers WHERE workspace_id = ? OR scope = 'public' ORDER BY scope DESC, created_at ASC",
      [workspaceId],
    );
    return rows.map((r) => this.mapRow(r));
  }

  registerServer(params: {
    workspaceId: string;
    name: string;
    scope?: "public" | "private";
    transport: "stdio" | "http";
    command?: string | null;
    args?: string[];
    url?: string | null;
    env?: Record<string, string>;
    permissionMode?: "read-only" | "standard" | "restricted";
  }): McpServerDto {
    const id = `mcp-${randomUUID().slice(0, 8)}`;
    const createdAt = new Date().toISOString();
    const encryptedEnv = params.env && Object.keys(params.env).length > 0
      ? encryptSecret(JSON.stringify(params.env))
      : null;

    this.#db.run(
      `INSERT INTO mcp_servers (id, workspace_id, name, scope, transport, command, args_json, url, encrypted_env_json, permission_mode, status, tools_cache_json, last_verified_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disconnected', '[]', NULL, ?)`,
      [
        id,
        params.workspaceId,
        params.name,
        params.scope ?? "private",
        params.transport,
        params.command ?? null,
        JSON.stringify(params.args ?? []),
        params.url ?? null,
        encryptedEnv,
        params.permissionMode ?? "standard",
        createdAt,
      ],
    );

    const row = this.#db.get<McpServerRow>("SELECT * FROM mcp_servers WHERE id = ?", [id])!;
    return this.mapRow(row);
  }

  updatePermissions(serverId: string, permissionMode: "read-only" | "standard" | "restricted"): McpServerDto {
    this.#db.run("UPDATE mcp_servers SET permission_mode = ? WHERE id = ?", [permissionMode, serverId]);
    const row = this.#db.get<McpServerRow>("SELECT * FROM mcp_servers WHERE id = ?", [serverId]);
    if (!row) throw new Error("MCP server not found");
    return this.mapRow(row);
  }

  async deleteServer(serverId: string): Promise<void> {
    const row = this.#db.get<McpServerRow>("SELECT * FROM mcp_servers WHERE id = ?", [serverId]);
    if (!row) throw new Error("MCP server not found");
    if (row.scope === "system-rea") throw new Error("Built-in REA MCP runtime cannot be deleted");
    await this.disconnect(serverId);
    this.#db.run("DELETE FROM mcp_servers WHERE id = ?", [serverId]);
  }

  async disconnect(serverId: string): Promise<void> {
    const active = this.#liveClients.get(serverId);
    if (active) {
      this.#liveClients.delete(serverId);
      try {
        await active.close();
      } catch {
        // ignore close errors
      }
    }
    this.#db.run("UPDATE mcp_servers SET status = 'disconnected' WHERE id = ?", [serverId]);
  }

  async connectAndDiscover(serverId: string): Promise<McpServerDto> {
    const row = this.#db.get<McpServerRow>("SELECT * FROM mcp_servers WHERE id = ?", [serverId]);
    if (!row) throw new Error("MCP server not found");

    await this.disconnect(serverId);

    let envVars: Record<string, string> | undefined;
    if (row.encrypted_env_json) {
      envVars = JSON.parse(decryptSecret(row.encrypted_env_json)) as Record<string, string>;
    }

    const client = new Client({ name: "aetherforge-studio", version: "1.0.0" });

    try {
      let transportClose: () => Promise<void>;
      if (row.transport === "stdio") {
        let cmd = row.command ?? "node";
        let args = JSON.parse(row.args_json) as string[];
        let cwd: string | undefined;

        if (row.scope === "system-rea") {
          cmd = process.execPath;
          args = [REA_CLI_SCRIPT, "mcp"];
          cwd = REPO_ROOT;
        }

        const transport = new StdioClientTransport({
          command: cmd,
          args,
          cwd,
          env: {
            PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
            HOME: process.env.HOME ?? "/tmp",
            ...(envVars ?? {}),
          },
          stderr: "pipe",
        });
        await client.connect(transport);
        transportClose = async () => {
          await client.close();
        };
      } else {
        if (!row.url) throw new Error("HTTP MCP server requires a valid url");
        const transport = new StreamableHTTPClientTransport(new URL(row.url));
        await client.connect(transport);
        transportClose = async () => {
          await client.close();
        };
      }

      const listed = await client.listTools();
      const tools = (listed.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description ?? "",
        category: row.scope === "system-rea" ? "reverse-engineering" : "external-mcp",
        inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
      }));

      this.#liveClients.set(serverId, { client, close: transportClose });
      const now = new Date().toISOString();
      this.#db.run(
        "UPDATE mcp_servers SET status = 'connected', tools_cache_json = ?, last_verified_at = ? WHERE id = ?",
        [JSON.stringify(tools), now, serverId],
      );
      const updated = this.#db.get<McpServerRow>("SELECT * FROM mcp_servers WHERE id = ?", [serverId])!;
      return this.mapRow(updated);
    } catch (err) {
      this.#db.run("UPDATE mcp_servers SET status = 'error' WHERE id = ?", [serverId]);
      throw err;
    }
  }

  async invokeTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ result: unknown; category: "reverse-engineering" | "external-mcp" }> {
    const row = this.#db.get<McpServerRow>("SELECT * FROM mcp_servers WHERE id = ?", [serverId]);
    if (!row) throw new Error("MCP server not found");

    if (row.permission_mode === "restricted") {
      throw new Error(`Execution blocked: MCP server '${row.name}' is in restricted mode`);
    }
    if (
      row.permission_mode === "read-only" &&
      MUTATING_MCP_TOOL_PATTERNS.some((pat) => pat.test(toolName))
    ) {
      throw new Error(
        `Permission denied: tool '${toolName}' is blocked under read-only policy for '${row.name}'`,
      );
    }

    if (!this.#liveClients.has(serverId)) {
      await this.connectAndDiscover(serverId);
    }
    const conn = this.#liveClients.get(serverId);
    if (!conn) throw new Error("MCP client connection unavailable");

    const result = await conn.client.callTool({ name: toolName, arguments: args });
    return {
      result,
      category: row.scope === "system-rea" ? "reverse-engineering" : "external-mcp",
    };
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.#liveClients.keys()].map((id) => this.disconnect(id)));
  }
}
