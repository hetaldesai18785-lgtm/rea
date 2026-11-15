import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { decryptSecret, encryptSecret, maskSecretHint } from "../../crypto/security.js";
import type { PlatformDatabase } from "../../db/database.js";

const execFileAsync = promisify(execFile);

export interface GitHubConnectionStatus {
  connected: boolean;
  username: string | null;
  tokenHint: string | null;
  authSource: "oauth" | "pat" | "environment" | "none";
}

export class GitHubService {
  readonly #db: PlatformDatabase;

  constructor(db: PlatformDatabase) {
    this.#db = db;
  }

  private getStoredToken(userId: string): { token: string | null; authSource: GitHubConnectionStatus["authSource"]; username: string | null; hint: string | null } {
    const row = this.#db.get<{
      username: string | null;
      encrypted_token: string | null;
      token_hint: string | null;
      auth_source: GitHubConnectionStatus["authSource"];
    }>("SELECT * FROM github_connections WHERE user_id = ?", [userId]);

    if (row?.encrypted_token) {
      try {
        return {
          token: decryptSecret(row.encrypted_token),
          authSource: row.auth_source,
          username: row.username,
          hint: row.token_hint,
        };
      } catch {
        // fallback below
      }
    }
    const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || null;
    return {
      token: envToken,
      authSource: envToken ? "environment" : "none",
      username: row?.username ?? null,
      hint: envToken ? maskSecretHint(envToken) : null,
    };
  }

  async getStatus(userId: string): Promise<GitHubConnectionStatus> {
    const stored = this.getStoredToken(userId);
    if (!stored.token) {
      return { connected: false, username: null, tokenHint: null, authSource: "none" };
    }
    if (!stored.username) {
      try {
        const res = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${stored.token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "AetherForge-Studio",
          },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = (await res.json()) as { login?: string };
          if (data.login) {
            this.#db.run("UPDATE github_connections SET username = ?, updated_at = ? WHERE user_id = ?", [
              data.login,
              new Date().toISOString(),
              userId,
            ]);
            return {
              connected: true,
              username: data.login,
              tokenHint: stored.hint,
              authSource: stored.authSource,
            };
          }
        }
      } catch {
        // Offline or network blocked; still report token present
      }
    }
    return {
      connected: true,
      username: stored.username,
      tokenHint: stored.hint,
      authSource: stored.authSource,
    };
  }

  async connectToken(
    userId: string,
    token: string,
    source: "pat" | "oauth" = "pat",
  ): Promise<GitHubConnectionStatus> {
    const trimmed = token.trim();
    if (trimmed.length < 10) throw new Error("Invalid GitHub token");

    let username: string | null = null;
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${trimmed}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "AetherForge-Studio",
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        throw new Error(`GitHub authentication rejected token (HTTP ${res.status})`);
      }
      const data = (await res.json()) as { login?: string };
      username = data.login ?? null;
    } catch (err) {
      if (err instanceof Error && err.message.includes("rejected")) throw err;
      // Network unreachable in offline mode; still verify non-empty format
    }

    const now = new Date().toISOString();
    const hint = maskSecretHint(trimmed);
    this.#db.run(
      `INSERT INTO github_connections (user_id, username, encrypted_token, token_hint, auth_source, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, encrypted_token = excluded.encrypted_token, token_hint = excluded.token_hint, auth_source = excluded.auth_source, updated_at = excluded.updated_at`,
      [userId, username, encryptSecret(trimmed), hint, source, now],
    );
    return { connected: true, username, tokenHint: hint, authSource: source };
  }

  async listRepositories(userId: string): Promise<Array<{
    id: number;
    name: string;
    fullName: string;
    private: boolean;
    defaultBranch: string;
    htmlUrl: string;
    cloneUrl: string;
  }>> {
    const stored = this.getStoredToken(userId);
    if (!stored.token) throw new Error("GitHub account not connected");

    const res = await fetch("https://api.github.com/user/repos?per_page=30&sort=updated", {
      headers: {
        Authorization: `Bearer ${stored.token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "AetherForge-Studio",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new Error(`GitHub API error HTTP ${res.status}`);
    }
    const repos = (await res.json()) as Array<{
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      default_branch: string;
      html_url: string;
      clone_url: string;
    }>;
    return repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch,
      htmlUrl: r.html_url,
      cloneUrl: r.clone_url,
    }));
  }

  async createRepository(params: {
    userId: string;
    name: string;
    description?: string;
    isPrivate?: boolean;
    confirmDestructive: boolean;
  }) {
    if (!params.confirmDestructive) {
      throw new Error("Confirmation required before creating remote GitHub repository");
    }
    const stored = this.getStoredToken(params.userId);
    if (!stored.token) throw new Error("GitHub account not connected");

    const res = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stored.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "AetherForge-Studio",
      },
      body: JSON.stringify({
        name: params.name,
        description: params.description ?? "Created with AetherForge Studio",
        private: params.isPrivate ?? true,
        auto_init: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Failed to create GitHub repo (HTTP ${res.status}): ${errBody.slice(0, 200)}`);
    }
    return await res.json();
  }

  private async runGit(workspacePath: string, args: string[]): Promise<string> {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: workspacePath,
      timeout: 30_000,
      env: {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        HOME: process.env.HOME ?? "/tmp",
        GIT_TERMINAL_PROMPT: "0",
      },
    });
    return `${stdout}\n${stderr}`.trim();
  }

  async getProjectGitStatus(workspacePath: string): Promise<{
    initialized: boolean;
    branch: string | null;
    branches: string[];
    statusLines: string[];
    recentCommits: string[];
  }> {
    if (!existsSync(join(workspacePath, ".git"))) {
      return { initialized: false, branch: null, branches: [], statusLines: [], recentCommits: [] };
    }
    const branch = (await this.runGit(workspacePath, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    const branchesOut = await this.runGit(workspacePath, ["branch", "--format=%(refname:short)"]);
    const statusOut = await this.runGit(workspacePath, ["status", "--short"]);
    let commitsOut = "";
    try {
      commitsOut = await this.runGit(workspacePath, ["log", "-n", "10", "--oneline"]);
    } catch {
      commitsOut = "";
    }
    return {
      initialized: true,
      branch: branch || "main",
      branches: branchesOut.split(/\r?\n/).filter(Boolean),
      statusLines: statusOut.split(/\r?\n/).filter(Boolean),
      recentCommits: commitsOut.split(/\r?\n/).filter(Boolean),
    };
  }

  async initAndCommitLocal(params: {
    projectId: string;
    workspacePath: string;
    commitMessage: string;
    authorName: string;
    authorEmail: string;
    branch?: string;
  }): Promise<{ commitHash: string; branch: string }> {
    mkdirSync(params.workspacePath, { recursive: true });
    if (!existsSync(join(params.workspacePath, ".git"))) {
      await this.runGit(params.workspacePath, ["init", "-b", params.branch ?? "main"]);
    }
    await this.runGit(params.workspacePath, ["config", "user.name", params.authorName]);
    await this.runGit(params.workspacePath, ["config", "user.email", params.authorEmail]);
    if (params.branch) {
      const branches = await this.runGit(params.workspacePath, ["branch", "--list", params.branch]);
      if (branches.trim()) {
        await this.runGit(params.workspacePath, ["checkout", params.branch]);
      } else {
        await this.runGit(params.workspacePath, ["checkout", "-B", params.branch]);
      }
    }
    await this.runGit(params.workspacePath, ["add", "-A"]);
    try {
      await this.runGit(params.workspacePath, ["commit", "-m", params.commitMessage]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("nothing to commit")) throw err;
    }
    const commitHash = (await this.runGit(params.workspacePath, ["rev-parse", "--short", "HEAD"])).trim();
    const branch = (await this.runGit(params.workspacePath, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    this.#db.run("UPDATE projects SET github_branch = ?, updated_at = ? WHERE id = ?", [
      branch,
      new Date().toISOString(),
      params.projectId,
    ]);
    return { commitHash, branch };
  }

  async cloneRepoIntoProject(params: {
    userId: string;
    projectId: string;
    workspacePath: string;
    repoFullName: string;
    branch?: string;
    confirmDestructive: boolean;
  }): Promise<{ cloned: string; branch: string }> {
    if (!params.confirmDestructive) {
      throw new Error("Explicit confirmation required before cloning repository into workspace");
    }
    const stored = this.getStoredToken(params.userId);
    const repoUrl = stored.token
      ? `https://x-access-token:${encodeURIComponent(stored.token)}@github.com/${params.repoFullName}.git`
      : `https://github.com/${params.repoFullName}.git`;

    const args = ["clone", "--depth", "1"];
    if (params.branch) args.push("--branch", params.branch);
    args.push(repoUrl, ".");

    await this.runGit(params.workspacePath, args);
    const activeBranch = (await this.runGit(params.workspacePath, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    this.#db.run("UPDATE projects SET github_repo = ?, github_branch = ?, updated_at = ? WHERE id = ?", [
      params.repoFullName,
      activeBranch,
      new Date().toISOString(),
      params.projectId,
    ]);
    return { cloned: params.repoFullName, branch: activeBranch };
  }

  async pushToGitHub(params: {
    userId: string;
    projectId: string;
    workspacePath: string;
    repoFullName: string;
    branch: string;
    commitMessage: string;
    confirmDestructive: boolean;
  }): Promise<{ pushed: boolean; branch: string; commitHash: string }> {
    if (!params.confirmDestructive) {
      throw new Error("Confirmation required before pushing commits to remote GitHub repository");
    }
    const stored = this.getStoredToken(params.userId);
    if (!stored.token) throw new Error("GitHub account not connected");

    const { commitHash } = await this.initAndCommitLocal({
      projectId: params.projectId,
      workspacePath: params.workspacePath,
      commitMessage: params.commitMessage,
      authorName: stored.username ?? "AetherForge Builder",
      authorEmail: `${stored.username ?? "builder"}@users.noreply.github.com`,
      branch: params.branch,
    });

    const authRemote = `https://x-access-token:${encodeURIComponent(stored.token)}@github.com/${params.repoFullName}.git`;
    await this.runGit(params.workspacePath, ["push", authRemote, `HEAD:refs/heads/${params.branch}`]);
    this.#db.run("UPDATE projects SET github_repo = ?, github_branch = ?, updated_at = ? WHERE id = ?", [
      params.repoFullName,
      params.branch,
      new Date().toISOString(),
      params.projectId,
    ]);
    return { pushed: true, branch: params.branch, commitHash };
  }

  async createPullRequest(params: {
    userId: string;
    repoFullName: string;
    title: string;
    body: string;
    head: string;
    base: string;
    confirmDestructive: boolean;
  }) {
    if (!params.confirmDestructive) {
      throw new Error("Confirmation required before opening a GitHub Pull Request");
    }
    const stored = this.getStoredToken(params.userId);
    if (!stored.token) throw new Error("GitHub account not connected");

    const res = await fetch(`https://api.github.com/repos/${params.repoFullName}/pulls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stored.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "AetherForge-Studio",
      },
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        head: params.head,
        base: params.base,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Failed to open PR (HTTP ${res.status}): ${errBody.slice(0, 240)}`);
    }
    return await res.json();
  }
}
