import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import type { AgentRole } from "../../../shared/types.js";
import { resolveContainedPath } from "../../crypto/security.js";
import type { LlmRouter } from "../llm/router.js";
import type { ProjectBlueprint } from "./blueprintCompiler.js";

const codegenResponseSchema = z.object({
  summary: z.string().min(2).max(500).optional(),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(160),
        content: z.string().min(1).max(200_000),
      }),
    )
    .min(1)
    .max(24),
});

const ALLOWED_EXTENSIONS = /\.(html|css|js|mjs|cjs|ts|tsx|json|sql|md|py|txt)$/i;

const readKeyWorkspaceFiles = (workspacePath: string, paths: string[]): string => {
  const sections: string[] = [];
  for (const rel of paths) {
    try {
      const safe = resolveContainedPath(workspacePath, rel);
      if (!existsSync(safe)) continue;
      const content = readFileSync(safe, "utf8");
      sections.push(`--- FILE: ${rel} ---\n${content.slice(0, 8000)}`);
    } catch {
      // Ignore invalid or missing path
    }
  }
  return sections.join("\n\n");
};

export interface LlmCodegenResult {
  applied: boolean;
  summary: string;
  writtenFiles: string[];
}

export const synthesizeWorkspaceWithLlm = async (options: {
  llm: LlmRouter;
  userId: string;
  agentRole: AgentRole;
  workspacePath: string;
  prompt: string;
  mode: "build" | "modify" | "debug";
  blueprint: ProjectBlueprint;
  errorTrace?: string;
}): Promise<LlmCodegenResult> => {
  const resolved = options.llm.resolveAdapter(options.userId, options.agentRole);
  if (!resolved.isExternalLlm) {
    return { applied: false, summary: "Local engine active", writtenFiles: [] };
  }

  const contextFiles = readKeyWorkspaceFiles(options.workspacePath, [
    "package.json",
    "src/server.mjs",
    "public/index.html",
    "public/styles.css",
    "public/app.js",
    ...(options.blueprint.appType === "mobile-expo"
      ? ["mobile/App.tsx", "mobile/src/api/client.ts"]
      : []),
    "tests/app.test.mjs",
  ]);

  const systemPrompt = [
    "You are an autonomous senior full-stack and mobile engineer in AetherForge Studio.",
    'Output strictly valid JSON: {"summary": string, "files": [{"path": string, "content": string}]}.',
    "Rules:",
    "- Keep src/server.mjs exporting `createAppServer()` and serving `/health` (HTTP 200), `/openapi.json`, and `./` relative static assets in `public/`.",
    "- Keep tests/app.test.mjs runnable via `node --test tests/app.test.mjs`.",
    "- Never hardcode localhost/127.0.0.1 in browser fetch calls; use relative `./api/...` paths.",
    "- If appType is `mobile-expo`, include real Expo/React Native TSX files under `mobile/` AND a mobile interactive web simulator in `public/`.",
    "- Do NOT return `data/database.json` unless missing; preserve user data.",
  ].join("\n");

  const userPrompt = [
    `Mode: ${options.mode}`,
    `App Type: ${options.blueprint.appType}`,
    `Blueprint Title: ${options.blueprint.title}`,
    `Primary Entity: ${options.blueprint.primaryEntity.name} (${options.blueprint.primaryEntity.plural})`,
    `User Prompt: ${options.prompt}`,
    options.errorTrace ? `Failing Trace To Fix:\n${options.errorTrace.slice(0, 3000)}` : "",
    contextFiles ? `Current Workspace Baseline Files:\n${contextFiles}` : "",
    "Generate updated/custom workspace files implementing the user's request cleanly.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await options.llm.tryExternalComplete(options.userId, options.agentRole, {
    jsonMode: true,
    maxTokens: 4096,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  if (!result?.content) {
    return { applied: false, summary: "No external response", writtenFiles: [] };
  }

  try {
    const cleaned = result.content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = codegenResponseSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) {
      return { applied: false, summary: "LLM returned non-file response", writtenFiles: [] };
    }

    const writtenFiles: string[] = [];
    for (const file of parsed.data.files) {
      const rel = file.path.replace(/^\/+/, "");
      if (rel.startsWith("data/") || !ALLOWED_EXTENSIONS.test(rel)) continue;
      const safeFull = resolveContainedPath(options.workspacePath, rel);
      mkdirSync(dirname(safeFull), { recursive: true });
      writeFileSync(safeFull, file.content, "utf8");
      writtenFiles.push(rel);
    }

    if (writtenFiles.length === 0) {
      return { applied: false, summary: "No valid workspace files in LLM output", writtenFiles: [] };
    }

    return {
      applied: true,
      summary: parsed.data.summary ?? `Synthesized ${writtenFiles.length} custom files via ${resolved.modelName}`,
      writtenFiles,
    };
  } catch {
    return { applied: false, summary: "Failed to parse LLM file bundle", writtenFiles: [] };
  }
};
