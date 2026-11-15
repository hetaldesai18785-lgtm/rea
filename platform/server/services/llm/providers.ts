import type { LlmProviderKind } from "../../../shared/types.js";
import type { LlmCompletionRequest, LlmCompletionResult, LlmProviderAdapter } from "./types.js";

const estimateTokens = (text: string): number => Math.max(1, Math.ceil(text.length / 4));

export class OpenAiCompatibleAdapter implements LlmProviderAdapter {
  readonly kind: LlmProviderKind;
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #model: string;
  readonly #extraHeaders: Record<string, string>;

  constructor(options: {
    kind: LlmProviderKind;
    apiKey: string;
    baseUrl: string;
    model: string;
    extraHeaders?: Record<string, string>;
  }) {
    this.kind = options.kind;
    this.#apiKey = options.apiKey;
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#model = options.model;
    this.#extraHeaders = options.extraHeaders ?? {};
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const response = await fetch(`${this.#baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.#apiKey}`,
        ...this.#extraHeaders,
      },
      body: JSON.stringify({
        model: this.#model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 4096,
        ...(request.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`LLM provider (${this.kind}) HTTP ${response.status}: ${errBody.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return {
      content,
      provider: this.kind,
      model: this.#model,
      usage: {
        inputTokens:
          data.usage?.prompt_tokens ??
          estimateTokens(request.messages.map((m) => m.content).join("\n")),
        outputTokens: data.usage?.completion_tokens ?? estimateTokens(content),
      },
    };
  }
}

export class AnthropicAdapter implements LlmProviderAdapter {
  readonly kind: LlmProviderKind = "anthropic";
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #model: string;

  constructor(options: { apiKey: string; baseUrl?: string; model: string }) {
    this.#apiKey = options.apiKey;
    this.#baseUrl = (options.baseUrl ?? "https://api.anthropic.com/v1").replace(/\/+$/, "");
    this.#model = options.model;
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const systemParts = request.messages.filter((m) => m.role === "system").map((m) => m.content);
    const nonSystem = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

    const response = await fetch(`${this.#baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.#apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.#model,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.2,
        ...(systemParts.length > 0 ? { system: systemParts.join("\n\n") } : {}),
        messages: nonSystem,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic HTTP ${response.status}: ${errBody.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const content = data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n") ?? "";
    return {
      content,
      provider: this.kind,
      model: this.#model,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 100,
        outputTokens: data.usage?.output_tokens ?? estimateTokens(content),
      },
    };
  }
}

export class GeminiAdapter implements LlmProviderAdapter {
  readonly kind: LlmProviderKind = "gemini";
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #model: string;

  constructor(options: { apiKey: string; baseUrl?: string; model: string }) {
    this.#apiKey = options.apiKey;
    this.#baseUrl = (options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
    this.#model = options.model;
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const systemParts = request.messages.filter((m) => m.role === "system").map((m) => m.content);
    const contents = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const response = await fetch(
      `${this.#baseUrl}/models/${encodeURIComponent(this.#model)}:generateContent?key=${encodeURIComponent(this.#apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(systemParts.length > 0
            ? { systemInstruction: { parts: [{ text: systemParts.join("\n\n") }] } }
            : {}),
          contents,
          generationConfig: {
            temperature: request.temperature ?? 0.2,
            maxOutputTokens: request.maxTokens ?? 4096,
            ...(request.jsonMode ? { responseMimeType: "application/json" } : {}),
          },
        }),
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Gemini HTTP ${response.status}: ${errBody.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const content =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("\n") ?? "";
    return {
      content,
      provider: this.kind,
      model: this.#model,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 100,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? estimateTokens(content),
      },
    };
  }
}

export class LocalBlueprintAdapter implements LlmProviderAdapter {
  readonly kind: LlmProviderKind = "local-blueprint";
  readonly #model: string;

  constructor(model = "aether-architect-v1") {
    this.#model = model;
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const promptText = request.messages.map((m) => m.content).join("\n");
    return {
      content: JSON.stringify({
        engine: "aether-blueprint-deterministic",
        note: "Synthesized locally without external LLM API credentials.",
        promptChars: promptText.length,
      }),
      provider: "local-blueprint",
      model: this.#model,
      usage: {
        inputTokens: estimateTokens(promptText),
        outputTokens: 64,
      },
    };
  }
}
