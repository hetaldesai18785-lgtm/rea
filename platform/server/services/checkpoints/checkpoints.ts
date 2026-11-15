import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, relative } from "node:path";
import type { CheckpointDto } from "../../../shared/types.js";
import { SNAPSHOTS_ROOT, WORKSPACES_ROOT } from "../../config/env.js";
import type { PlatformDatabase } from "../../db/database.js";
import { slugify } from "../../crypto/security.js";

const countFiles = (dir: string): number => {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) count += countFiles(p);
    else if (entry.isFile()) count += 1;
  }
  return count;
};

const listRelativeFiles = (dir: string): Map<string, string> => {
  const map = new Map<string, string>();
  if (!existsSync(dir)) return map;
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && statSync(p).size <= 256 * 1024) {
        map.set(relative(dir, p).replace(/\\/g, "/"), readFileSync(p, "utf8"));
      }
    }
  };
  walk(dir);
  return map;
};

export class CheckpointService {
  readonly #db: PlatformDatabase;

  constructor(db: PlatformDatabase) {
    this.#db = db;
  }

  createCheckpoint(params: {
    projectId: string;
    workspacePath: string;
    parentId?: string | null;
    runId?: string | null;
    messageId?: string | null;
    label: string;
    summary: string;
  }): CheckpointDto {
    const id = `chk-${randomUUID().slice(0, 10)}`;
    const snapDir = join(SNAPSHOTS_ROOT, params.projectId, id);
    mkdirSync(snapDir, { recursive: true });
    if (existsSync(params.workspacePath)) {
      cpSync(params.workspacePath, snapDir, {
        recursive: true,
        filter: (src) => !src.includes("node_modules") && !src.endsWith(".git"),
      });
    }
    const filesCount = countFiles(snapDir);
    const createdAt = new Date().toISOString();

    this.#db.run(
      `INSERT INTO checkpoints (id, project_id, parent_id, run_id, message_id, label, summary, git_commit, snapshot_path, files_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.projectId,
        params.parentId ?? null,
        params.runId ?? null,
        params.messageId ?? null,
        params.label,
        params.summary,
        null,
        snapDir,
        filesCount,
        createdAt,
      ],
    );
    this.#db.run("UPDATE projects SET active_checkpoint_id = ?, updated_at = ? WHERE id = ?", [
      id,
      createdAt,
      params.projectId,
    ]);

    return {
      id,
      projectId: params.projectId,
      parentId: params.parentId ?? null,
      runId: params.runId ?? null,
      messageId: params.messageId ?? null,
      label: params.label,
      summary: params.summary,
      gitCommit: null,
      filesCount,
      createdAt,
    };
  }

  listCheckpoints(projectId: string): CheckpointDto[] {
    const rows = this.#db.all<{
      id: string;
      project_id: string;
      parent_id: string | null;
      run_id: string | null;
      message_id: string | null;
      label: string;
      summary: string;
      git_commit: string | null;
      files_count: number;
      created_at: string;
    }>("SELECT * FROM checkpoints WHERE project_id = ? ORDER BY created_at DESC", [projectId]);

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      parentId: r.parent_id,
      runId: r.run_id,
      messageId: r.message_id,
      label: r.label,
      summary: r.summary,
      gitCommit: r.git_commit,
      filesCount: r.files_count,
      createdAt: r.created_at,
    }));
  }

  diffCheckpointWithWorkspace(projectId: string, checkpointId: string, workspacePath: string) {
    const row = this.#db.get<{ snapshot_path: string }>(
      "SELECT snapshot_path FROM checkpoints WHERE id = ? AND project_id = ?",
      [checkpointId, projectId],
    );
    if (!row) throw new Error("Checkpoint not found");
    const snapFiles = listRelativeFiles(row.snapshot_path);
    const liveFiles = listRelativeFiles(workspacePath);
    const allKeys = new Set([...snapFiles.keys(), ...liveFiles.keys()]);
    const diffs: Array<{ path: string; change: "added" | "modified" | "removed" }> = [];
    for (const key of [...allKeys].sort()) {
      const a = snapFiles.get(key);
      const b = liveFiles.get(key);
      if (a === undefined) diffs.push({ path: key, change: "added" });
      else if (b === undefined) diffs.push({ path: key, change: "removed" });
      else if (a !== b) diffs.push({ path: key, change: "modified" });
    }
    return diffs;
  }

  rollbackToCheckpoint(params: {
    projectId: string;
    checkpointId: string;
    workspacePath: string;
    mode: "messages_and_code" | "messages_only";
  }): void {
    const row = this.#db.get<{ snapshot_path: string; created_at: string }>(
      "SELECT snapshot_path, created_at FROM checkpoints WHERE id = ? AND project_id = ?",
      [params.checkpointId, params.projectId],
    );
    if (!row) throw new Error("Checkpoint not found");

    if (params.mode === "messages_and_code" && existsSync(row.snapshot_path)) {
      rmSync(params.workspacePath, { recursive: true, force: true });
      mkdirSync(params.workspacePath, { recursive: true });
      cpSync(row.snapshot_path, params.workspacePath, { recursive: true });
    }

    this.#db.run("DELETE FROM chat_messages WHERE project_id = ? AND created_at > ?", [
      params.projectId,
      row.created_at,
    ]);
    this.#db.run("UPDATE projects SET active_checkpoint_id = ?, updated_at = ? WHERE id = ?", [
      params.checkpointId,
      new Date().toISOString(),
      params.projectId,
    ]);
  }

  forkProject(params: {
    sourceProjectId: string;
    newName: string;
    summaryOverride?: string;
    userId: string;
  }): { newProjectId: string; workspacePath: string } {
    const src = this.#db.get<{
      workspace_id: string;
      description: string;
      app_type: string;
      stack_frontend: string;
      stack_backend: string;
      stack_database: string;
      autonomy_mode: string;
      hitl_mode: string;
      workspace_path: string;
    }>("SELECT * FROM projects WHERE id = ?", [params.sourceProjectId]);
    if (!src) throw new Error("Source project not found");

    const newProjectId = `proj-${randomUUID().slice(0, 10)}`;
    const newWorkspacePath = join(WORKSPACES_ROOT, src.workspace_id, newProjectId);
    mkdirSync(newWorkspacePath, { recursive: true });
    if (existsSync(src.workspace_path)) {
      cpSync(src.workspace_path, newWorkspacePath, {
        recursive: true,
        filter: (p) => !p.includes("node_modules") && !p.endsWith(".git"),
      });
    }

    const now = new Date().toISOString();
    this.#db.run(
      `INSERT INTO projects (id, workspace_id, owner_id, name, slug, description, app_type, stack_frontend, stack_backend, stack_database, status, autonomy_mode, hitl_mode, forked_from_project_id, workspace_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newProjectId,
        src.workspace_id,
        params.userId,
        params.newName,
        slugify(params.newName),
        params.summaryOverride ?? src.description,
        src.app_type,
        src.stack_frontend,
        src.stack_backend,
        src.stack_database,
        "draft",
        src.autonomy_mode,
        src.hitl_mode,
        params.sourceProjectId,
        newWorkspacePath,
        now,
        now,
      ],
    );

    if (params.summaryOverride) {
      this.#db.run(
        `INSERT INTO chat_messages (id, project_id, role, content, created_at)
         VALUES (?, ?, 'system', ?, ?)`,
        [`msg-${randomUUID().slice(0, 10)}`, newProjectId, `Fork summary: ${params.summaryOverride}`, now],
      );
    }

    this.createCheckpoint({
      projectId: newProjectId,
      workspacePath: newWorkspacePath,
      label: "Fork initial snapshot",
      summary: `Forked from ${params.sourceProjectId}`,
    });

    return { newProjectId, workspacePath: newWorkspacePath };
  }
}
