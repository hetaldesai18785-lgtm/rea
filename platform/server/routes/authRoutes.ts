import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SERVER_CONFIG } from "../config/env.js";
import {
  generateSessionToken,
  hashPassword,
  hashToken,
  slugify,
  verifyPassword,
} from "../crypto/security.js";
import type { PlatformDatabase } from "../db/database.js";
import { seedUserDefaults } from "../db/seed.js";
import { createAuthMiddleware } from "../middleware/auth.js";

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(80),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createAuthRouter = (db: PlatformDatabase) => {
  const router = Router();
  const { requireAuth } = createAuthMiddleware(db);

  const cookieOptions = (req: import("express").Request) => {
    const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
    return {
      httpOnly: true,
      sameSite: (isHttps ? "none" : "lax") as "none" | "lax",
      secure: isHttps,
      maxAge: SERVER_CONFIG.sessionTtlMs,
      path: "/",
    };
  };

  const issueSession = (userId: string) => {
    const rawToken = generateSessionToken();
    const tokenHash = hashToken(rawToken);
    const sessionId = `sess-${randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SERVER_CONFIG.sessionTtlMs).toISOString();
    db.run(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
      [sessionId, userId, tokenHash, expiresAt, now],
    );
    return { rawToken, expiresAt };
  };

  router.post("/register", (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid registration input" });
      return;
    }

    const email = parsed.data.email.trim().toLowerCase();
    const existing = db.get<{ id: string }>("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const userId = `usr-${randomUUID().slice(0, 10)}`;
    const workspaceId = `ws-${randomUUID().slice(0, 10)}`;
    const now = new Date().toISOString();
    const passwordHash = hashPassword(parsed.data.password);

    db.transaction(() => {
      db.run(
        `INSERT INTO users (id, email, name, password_hash, role, theme, credits_balance, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'builder', 'dark', 1000, ?, ?)`,
        [userId, email, parsed.data.name.trim(), passwordHash, now, now],
      );
      db.run(
        "INSERT INTO workspaces (id, owner_id, name, slug, created_at) VALUES (?, ?, ?, ?, ?)",
        [workspaceId, userId, `${parsed.data.name.trim()}'s Workspace`, slugify(parsed.data.name), now],
      );
      db.run(
        "INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)",
        [workspaceId, userId, now],
      );
      seedUserDefaults(db, userId, workspaceId);
    });

    const { rawToken } = issueSession(userId);
    res.cookie(SERVER_CONFIG.cookieName, rawToken, cookieOptions(req));
    res.status(201).json({
      token: rawToken,
      workspaceId,
      user: {
        id: userId,
        email,
        name: parsed.data.name.trim(),
        role: "builder",
        theme: "dark",
        creditsBalance: 1000,
        createdAt: now,
      },
    });
  });

  router.post("/login", (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Valid email and password are required" });
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    const user = db.get<{
      id: string;
      email: string;
      name: string;
      password_hash: string;
      role: "admin" | "builder";
      theme: "dark" | "light";
      credits_balance: number;
      created_at: string;
    }>("SELECT * FROM users WHERE email = ?", [email]);

    if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const member = db.get<{ workspace_id: string }>(
      "SELECT workspace_id FROM workspace_members WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
      [user.id],
    );
    const { rawToken } = issueSession(user.id);
    res.cookie(SERVER_CONFIG.cookieName, rawToken, cookieOptions(req));
    res.json({
      token: rawToken,
      workspaceId: member?.workspace_id ?? null,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        theme: user.theme,
        creditsBalance: user.credits_balance,
        createdAt: user.created_at,
      },
    });
  });

  router.post("/logout", requireAuth, (req, res) => {
    if (req.auth) {
      db.run("DELETE FROM sessions WHERE id = ?", [req.auth.sessionId]);
    }
    res.clearCookie(SERVER_CONFIG.cookieName, { path: "/" });
    res.json({ ok: true });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({
      user: req.auth!.user,
      workspaceId: req.auth!.workspaceId,
      workspaceRole: req.auth!.workspaceRole,
    });
  });

  router.patch("/me", requireAuth, (req, res) => {
    const schema = z.object({
      name: z.string().min(1).max(80).optional(),
      theme: z.enum(["dark", "light"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid profile update" });
      return;
    }
    const now = new Date().toISOString();
    const user = req.auth!.user;
    const nextName = parsed.data.name ?? user.name;
    const nextTheme = parsed.data.theme ?? user.theme;
    db.run("UPDATE users SET name = ?, theme = ?, updated_at = ? WHERE id = ?", [
      nextName,
      nextTheme,
      now,
      user.id,
    ]);
    res.json({ user: { ...user, name: nextName, theme: nextTheme } });
  });

  return router;
};
