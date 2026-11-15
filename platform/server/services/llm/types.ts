import type { LlmProviderKind } from "../../../shared/types.js";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionRequest {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface LlmCompletionResult {
  content: string;
  provider: LlmProviderKind;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LlmProviderAdapter {
  readonly kind: LlmProviderKind;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
}
