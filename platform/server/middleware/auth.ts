import type { NextFunction, Request, Response } from "express";
import type { PlatformDatabase } from "../db/database.js";
import { SERVER_CONFIG } from "../config/env.js";
import { hashToken } from "../crypto/security.js";
import type { UserDto, WorkspaceRole } from "../../shared/types.js";

export interface AuthenticatedContext {
  user: UserDto;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedContext;
    }
  }
}

interface UserSessionRow {
  session_id: string;
  expires_at: string;
  id: string;
  email: string;
  name: string;
  role: "admin" | "builder";
  theme: "dark" | "light";
  credits_balance: number;
  created_at: string;
  workspace_id: string;
  workspace_role: WorkspaceRole;
}

export const param = (req: Request, key: string): string => {
  const val = req.params[key];
  return Array.isArray(val) ? (val[0] ?? "") : (val ?? "");
};

export const extractSessionToken = (req: Request): string | null => {
  const cookieToken = req.cookies?.[SERVER_CONFIG.cookieName];
  if (typeof cookieToken === "string" && cookieToken.length > 0) {
    return cookieToken;
  }
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const queryToken = req.query.token;
  if (typeof queryToken === "string" && queryToken.length > 0) {
    return queryToken;
  }
  return null;
};

export const createAuthMiddleware = (db: PlatformDatabase) => {
  const resolveSession = (req: Request): AuthenticatedContext | null => {
    const rawToken = extractSessionToken(req);
    if (!rawToken) return null;
    const tokenHash = hashToken(rawToken);
    const row = db.get<UserSessionRow>(
      `SELECT
         s.id AS session_id, s.expires_at,
         u.id, u.email, u.name, u.role, u.theme, u.credits_balance, u.created_at,
         wm.workspace_id, wm.role AS workspace_role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN workspace_members wm ON wm.user_id = u.id
       WHERE s.token_hash = ?
       ORDER BY wm.created_at ASC
       LIMIT 1`,
      [tokenHash],
    );
    if (!row) return null;
    if (Date.parse(row.expires_at) <= Date.now()) {
      db.run("DELETE FROM sessions WHERE id = ?", [row.session_id]);
      return null;
    }
    return {
      sessionId: row.session_id,
      workspaceId: row.workspace_id,
      workspaceRole: row.workspace_role,
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        theme: row.theme,
        creditsBalance: row.credits_balance,
        createdAt: row.created_at,
      },
    };
  };

  const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    const ctx = resolveSession(req);
    if (!ctx) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    req.auth = ctx;
    next();
  };

  const requireProjectAccess = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const projectId = param(req, "id") || param(req, "projectId");
    if (!projectId) {
      res.status(400).json({ error: "Missing project ID" });
      return;
    }
    const project = db.get<{ id: string; workspace_id: string; owner_id: string }>(
      "SELECT id, workspace_id, owner_id FROM projects WHERE id = ?",
      [projectId],
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const member = db.get<{ role: WorkspaceRole }>(
      "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
      [project.workspace_id, auth.user.id],
    );
    if (!member && project.owner_id !== auth.user.id) {
      res.status(403).json({ error: "Access denied for this project" });
      return;
    }
    next();
  };

  const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (auth.user.role !== "admin") {
      res.status(403).json({ error: "Administrator privileges required" });
      return;
    }
    next();
  };

  return { resolveSession, requireAuth, requireAdmin, requireProjectAccess };
};
