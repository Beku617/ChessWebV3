export type AnalysisAiProviderId = "anthropic" | "groq";

export interface AnalysisAiProvider {
  id: AnalysisAiProviderId;
  name: string;
  logo: string;
}

export interface AnalysisAiModel {
  id: string;
  providerId: AnalysisAiProviderId;
  providerName: string;
  name: string;
  versionBadge?: string;
  input: string;
  output: string;
  maxInputTokens: string;
  apiModelId: string;
  bedrockModelId?: string;
  description?: string;
}

export interface AnalysisProviderAvailability {
  anthropic: boolean;
  groq: boolean;
}

export const ANALYSIS_AI_PROVIDERS: AnalysisAiProvider[] = [
  { id: "anthropic", name: "Anthropic", logo: "A" },
  { id: "groq", name: "Groq", logo: "G" },
];

export const ANALYSIS_AI_MODELS: AnalysisAiModel[] = [
  {
    id: "anthropic.claude-haiku-4-5",
    providerId: "anthropic",
    providerName: "Anthropic",
    name: "Claude Haiku 4.5",
    versionBadge: "Default",
    input: "Text, Image",
    output: "Text",
    maxInputTokens: "200K tokens",
    apiModelId: "claude-haiku-4-5",
    bedrockModelId:
      import.meta.env.VITE_BEDROCK_CLAUDE_HAIKU_MODEL_ID ||
      import.meta.env.VITE_BEDROCK_CLAUDE_HAIKU_4_5_MODEL_ID ||
      "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    description: "Primary Amazon Bedrock Claude Haiku model.",
  },
  {
    id: "groq.llama-3.3-70b-versatile",
    providerId: "groq",
    providerName: "Groq",
    name: "Groq Llama 3.3 70B",
    versionBadge: "Fallback",
    input: "Text",
    output: "Text",
    maxInputTokens: "128K tokens",
    apiModelId:
      import.meta.env.VITE_GROQ_MODEL_ID || "llama-3.3-70b-versatile",
    description: "Fallback model when Haiku is unavailable.",
  },
];

const MODEL_BY_ID = new Map<string, AnalysisAiModel>(
  ANALYSIS_AI_MODELS.map((model) => [model.id, model]),
);

export const DEFAULT_ANALYSIS_AI_MODEL_ID = "anthropic.claude-haiku-4-5";

export function getAnalysisAiModelById(id?: string | null): AnalysisAiModel {
  if (id && MODEL_BY_ID.has(id)) {
    return MODEL_BY_ID.get(id)!;
  }
  return MODEL_BY_ID.get(DEFAULT_ANALYSIS_AI_MODEL_ID)!;
}

export function getAnalysisAiModelsForProvider(
  providerId: AnalysisAiProviderId,
): AnalysisAiModel[] {
  return ANALYSIS_AI_MODELS.filter((model) => model.providerId === providerId);
}

export function getDefaultAnalysisAiModelId(): string {
  const availability = getAnalysisProviderAvailability();
  if (availability.anthropic) return "anthropic.claude-haiku-4-5";
  if (availability.groq) return "groq.llama-3.3-70b-versatile";
  return DEFAULT_ANALYSIS_AI_MODEL_ID;
}

export function getAnalysisProviderAvailability(): AnalysisProviderAvailability {
  const bedrockToken = import.meta.env.VITE_AWS_BEARER_TOKEN_BEDROCK || "";
  const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY || "";
  const groqKey = import.meta.env.VITE_GROQ_API_KEY || "";

  return {
    anthropic: Boolean(bedrockToken || anthropicKey),
    groq: Boolean(groqKey),
  };
}

export function getProviderEnvHint(providerId: AnalysisAiProviderId): string {
  switch (providerId) {
    case "anthropic":
      return "Configure AWS_BEARER_TOKEN_BEDROCK in the backend environment";
    case "groq":
      return "Configure GROQ_API_KEY or VITE_GROQ_API_KEY";
    default:
      return "Provider key is missing";
  }
}
