import {
  getAnalysisAiModelById,
  getAnalysisProviderAvailability,
  type AnalysisAiModel,
} from "./analysisAiModels";
import { MoveQualityInfo } from "./moveQuality";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL_ID =
  import.meta.env.VITE_GROQ_MODEL_ID || "llama-3.3-70b-versatile";

export interface AiLocalizedExplanation {
  en: string;
  mn: string;
}

export interface AiBatchExplanationsResult {
  explanationsByPly: Record<number, AiLocalizedExplanation>;
  model: string | null;
}

export interface AiProviderStatus {
  anthropicConfigured: boolean;
  bedrockConfigured: boolean;
  groqConfigured: boolean;
  openaiConfigured: boolean;
  xaiConfigured: boolean;
  deepseekConfigured: boolean;
  bedrockRegion: string;
  bedrockModelId: string;
  groqModelId: string;
  selectedModelId: string;
  selectedModelName: string;
}

function localProviderStatus(selectedModelId?: string): AiProviderStatus {
  const availability = getAnalysisProviderAvailability();
  const selectedModel = getAnalysisAiModelById(selectedModelId);
  return {
    anthropicConfigured: availability.anthropic,
    bedrockConfigured: Boolean(import.meta.env.VITE_AWS_BEARER_TOKEN_BEDROCK),
    groqConfigured: availability.groq,
    openaiConfigured: false,
    xaiConfigured: false,
    deepseekConfigured: false,
    bedrockRegion: import.meta.env.VITE_BEDROCK_REGION || "eu-north-1",
    bedrockModelId: selectedModel.bedrockModelId || selectedModel.apiModelId,
    groqModelId: GROQ_MODEL_ID,
    selectedModelId: selectedModel.id,
    selectedModelName: selectedModel.name,
  };
}

function normalizeProviderStatus(
  value: Partial<AiProviderStatus> | null | undefined,
  selectedModelId?: string,
): AiProviderStatus {
  return {
    ...localProviderStatus(selectedModelId),
    ...(value || {}),
    openaiConfigured: false,
    xaiConfigured: false,
    deepseekConfigured: false,
  };
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(
      String(
        (data && typeof data === "object" && "error" in data
          ? data.error
          : "") || `Request failed with HTTP ${response.status}`,
      ),
    );
  }
  return data as T;
}

export function isAiConfigured(modelId?: string): boolean {
  const selectedModel = getAnalysisAiModelById(modelId);
  const status = localProviderStatus(modelId);
  return selectedModel.providerId === "anthropic"
    ? status.anthropicConfigured || status.groqConfigured
    : status.groqConfigured;
}

export function getAiProviderStatus(selectedModelId?: string): AiProviderStatus {
  return localProviderStatus(selectedModelId);
}

export async function fetchAiProviderStatus(
  selectedModelId?: string,
): Promise<AiProviderStatus> {
  const params = new URLSearchParams();
  if (selectedModelId) params.set("modelId", selectedModelId);

  const response = await fetch(`${API_URL}/api/ai/status?${params}`, {
    credentials: "include",
  });
  const data = await readJsonResponse<Partial<AiProviderStatus>>(response);
  return normalizeProviderStatus(data, selectedModelId);
}

export async function getAiMoveExplanation(
  _fen: string,
  movePlayed: string,
  bestMove: string | undefined,
  qualityInfo: MoveQualityInfo | undefined,
  moveNumber: number,
  selectedModelId?: string,
): Promise<string> {
  const result = await getAiBatchExplanations(
    [
      {
        ply: moveNumber,
        san: movePlayed,
        quality: qualityInfo?.label || "Unknown",
        bestMove,
        epLoss: qualityInfo?.epLoss,
      },
    ],
    selectedModelId,
  );

  const explanation = result.explanationsByPly[moveNumber];
  return (explanation?.en || explanation?.mn || "").slice(0, 220);
}

export async function getAiBatchExplanations(
  moves: Array<{
    ply: number;
    san: string;
    quality: string;
    bestMove?: string;
    epLoss?: number;
  }>,
  selectedModelId?: string,
): Promise<AiBatchExplanationsResult> {
  const selectedModel: AnalysisAiModel = getAnalysisAiModelById(selectedModelId);
  const response = await fetch(`${API_URL}/api/ai/explanations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      selectedModelId: selectedModel.id,
      moves,
    }),
  });

  return readJsonResponse<AiBatchExplanationsResult>(response);
}

export async function validateGroqApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey || apiKey.length < 10) return false;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL_ID,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}
