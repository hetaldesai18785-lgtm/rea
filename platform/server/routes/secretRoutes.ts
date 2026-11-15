import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { encryptSecret, maskSecretHint } from "../crypto/security.js";
import type { PlatformDatabase } from "../db/database.js";
import { createAuthMiddleware, param } from "../middleware/auth.js";
import type { SecretDto } from "../../shared/types.js";

export const createSecretRouter = (db: PlatformDatabase) => {
  const router = Router();
  const { requireAuth, requireProjectAccess } = createAuthMiddleware(db);

  router.use("/projects", requireAuth);

  router.get("/projects/:id/secrets", requireProjectAccess, (req, res) => {
    const projectId = param(req, "id");
    const rows = db.all<{
      id: string;
      project_id: string;
      environment: "preview" | "production";
      key_name: string;
      value_hint: string;
      updated_at: string;
    }>(
      "SELECT id, project_id, environment, key_name, value_hint, updated_at FROM project_secrets WHERE project_id = ? ORDER BY environment ASC, key_name ASC",
      [projectId],
    );
    const secrets: SecretDto[] = rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      environment: r.environment,
      keyName: r.key_name,
      valueHint: r.value_hint,
      updatedAt: r.updated_at,
    }));
    res.json({ secrets });
  });

  router.put("/projects/:id/secrets", requireProjectAccess, (req, res) => {
    const projectId = param(req, "id");
    const schema = z.object({
      environment: z.enum(["preview", "production"]),
      keyName: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/, "Key must be UPPER_SNAKE_CASE"),
      value: z.string().min(1).max(4000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid secret" });
      return;
    }
    const id = `sec-${randomUUID().slice(0, 10)}`;
    const now = new Date().toISOString();
    const enc = encryptSecret(parsed.data.value);
    const hint = maskSecretHint(parsed.data.value);
    db.run(
      `INSERT INTO project_secrets (id, project_id, environment, key_name, encrypted_value, value_hint, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, environment, key_name)
       DO UPDATE SET encrypted_value = excluded.encrypted_value, value_hint = excluded.value_hint, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      [
        id,
        projectId,
        parsed.data.environment,
        parsed.data.keyName,
        enc,
        hint,
        req.auth!.user.id,
        now,
        now,
      ],
    );
    res.json({ ok: true, keyName: parsed.data.keyName, environment: parsed.data.environment, valueHint: hint });
  });

  router.delete("/projects/:id/secrets/:secretId", requireProjectAccess, (req, res) => {
    db.run("DELETE FROM project_secrets WHERE id = ? AND project_id = ?", [
      param(req, "secretId"),
      param(req, "id"),
    ]);
    res.json({ ok: true });
  });

  return router;
};
