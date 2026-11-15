import type { AgentRole, LlmProviderKind } from "../../../shared/types.js";
import type { PlatformDatabase } from "../../db/database.js";
import { decryptSecret } from "../../crypto/security.js";
import {
  AnthropicAdapter,
  GeminiAdapter,
  LocalBlueprintAdapter,
  OpenAiCompatibleAdapter,
} from "./providers.js";
import type { LlmCompletionRequest, LlmCompletionResult, LlmProviderAdapter } from "./types.js";

interface ProviderRow {
  id: string;
  provider: LlmProviderKind;
  base_url: string | null;
  encrypted_api_key: string | null;
  default_model: string;
  status: string;
}

interface AgentConfigRow {
  provider_id: string | null;
  model_name: string;
  system_prompt_override: string | null;
  temperature: number;
}

export class LlmRouter {
  readonly #db: PlatformDatabase;

  constructor(db: PlatformDatabase) {
    this.#db = db;
  }

  resolveAdapter(userId: string, agentRole: AgentRole): {
    adapter: LlmProviderAdapter;
    modelName: string;
    systemPromptOverride: string | null;
    temperature: number;
    isExternalLlm: boolean;
  } {
    const cfg = this.#db.get<AgentConfigRow>(
      "SELECT provider_id, model_name, system_prompt_override, temperature FROM agent_configs WHERE user_id = ? AND agent_role = ?",
      [userId, agentRole],
    );

    const providerRow = cfg?.provider_id
      ? this.#db.get<ProviderRow>(
          "SELECT id, provider, base_url, encrypted_api_key, default_model, status FROM llm_providers WHERE id = ? AND user_id = ?",
          [cfg.provider_id, userId],
        )
      : undefined;

    if (!providerRow || providerRow.provider === "local-blueprint" || !providerRow.encrypted_api_key) {
      return {
        adapter: new LocalBlueprintAdapter(cfg?.model_name ?? "aether-architect-v1"),
        modelName: cfg?.model_name ?? "aether-architect-v1",
        systemPromptOverride: cfg?.system_prompt_override ?? null,
        temperature: cfg?.temperature ?? 0.2,
        isExternalLlm: false,
      };
    }

    const apiKey = decryptSecret(providerRow.encrypted_api_key);
    const model = cfg?.model_name || providerRow.default_model;

    let adapter: LlmProviderAdapter;
    switch (providerRow.provider) {
      case "anthropic":
        adapter = new AnthropicAdapter({
          apiKey,
          baseUrl: providerRow.base_url ?? undefined,
          model,
        });
        break;
      case "gemini":
        adapter = new GeminiAdapter({
          apiKey,
          baseUrl: providerRow.base_url ?? undefined,
          model,
        });
        break;
      case "openrouter":
        adapter = new OpenAiCompatibleAdapter({
          kind: "openrouter",
          apiKey,
          baseUrl: providerRow.base_url ?? "https://openrouter.ai/api/v1",
          model,
          extraHeaders: { "HTTP-Referer": "https://aetherforge.local", "X-Title": "AetherForge Studio" },
        });
        break;
      case "openai":
      case "openai-compatible":
      default:
        adapter = new OpenAiCompatibleAdapter({
          kind: providerRow.provider,
          apiKey,
          baseUrl: providerRow.base_url ?? "https://api.openai.com/v1",
          model,
        });
        break;
    }

    return {
      adapter,
      modelName: model,
      systemPromptOverride: cfg?.system_prompt_override ?? null,
      temperature: cfg?.temperature ?? 0.2,
      isExternalLlm: true,
    };
  }

  async tryExternalComplete(
    userId: string,
    agentRole: AgentRole,
    request: LlmCompletionRequest,
  ): Promise<LlmCompletionResult | null> {
    const resolved = this.resolveAdapter(userId, agentRole);
    if (!resolved.isExternalLlm) return null;
    try {
      return await resolved.adapter.complete({
        ...request,
        temperature: request.temperature ?? resolved.temperature,
      });
    } catch {
      return null;
    }
  }

  async testProviderById(
    userId: string,
    providerId: string,
  ): Promise<{
    ok: boolean;
    provider: LlmProviderKind;
    model: string;
    latencyMs: number;
    preview?: string;
    error?: string;
  }> {
    const row = this.#db.get<ProviderRow>(
      "SELECT id, provider, base_url, encrypted_api_key, default_model, status FROM llm_providers WHERE id = ? AND user_id = ?",
      [providerId, userId],
    );
    if (!row) {
      throw new Error("Provider not found");
    }

    const t0 = Date.now();
    if (row.provider === "local-blueprint") {
      const adapter = new LocalBlueprintAdapter(row.default_model);
      const res = await adapter.complete({
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 32,
      });
      return {
        ok: true,
        provider: row.provider,
        model: res.model,
        latencyMs: Date.now() - t0,
        preview: "Local deterministic synthesis engine active",
      };
    }

    if (!row.encrypted_api_key) {
      return {
        ok: false,
        provider: row.provider,
        model: row.default_model,
        latencyMs: Date.now() - t0,
        error: "No API key stored for this provider",
      };
    }

    const apiKey = decryptSecret(row.encrypted_api_key);
    let adapter: LlmProviderAdapter;
    switch (row.provider) {
      case "anthropic":
        adapter = new AnthropicAdapter({
          apiKey,
          baseUrl: row.base_url ?? undefined,
          model: row.default_model,
        });
        break;
      case "gemini":
        adapter = new GeminiAdapter({
          apiKey,
          baseUrl: row.base_url ?? undefined,
          model: row.default_model,
        });
        break;
      case "openrouter":
        adapter = new OpenAiCompatibleAdapter({
          kind: "openrouter",
          apiKey,
          baseUrl: row.base_url ?? "https://openrouter.ai/api/v1",
          model: row.default_model,
          extraHeaders: { "HTTP-Referer": "https://aetherforge.local", "X-Title": "AetherForge Studio" },
        });
        break;
      case "openai":
      case "openai-compatible":
      default:
        adapter = new OpenAiCompatibleAdapter({
          kind: row.provider,
          apiKey,
          baseUrl: row.base_url ?? "https://api.openai.com/v1",
          model: row.default_model,
        });
        break;
    }

    try {
      const result = await adapter.complete({
        messages: [{ role: "user", content: "Reply with OK" }],
        maxTokens: 16,
        temperature: 0,
      });
      return {
        ok: true,
        provider: row.provider,
        model: result.model,
        latencyMs: Date.now() - t0,
        preview: result.content.slice(0, 80),
      };
    } catch (err) {
      return {
        ok: false,
        provider: row.provider,
        model: row.default_model,
        latencyMs: Date.now() - t0,
        error: err instanceof Error ? err.message : "Connection test failed",
      };
    }
  }
}
