import { loadServerEnv } from "../config/env.js";

loadServerEnv();

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const DEFAULT_BEDROCK_REGION = "eu-north-1";
const DEFAULT_GROQ_MODEL_ID = "llama-3.3-70b-versatile";
const DEFAULT_HAIKU_BEDROCK_MODEL_ID =
  "global.anthropic.claude-haiku-4-5-20251001-v1:0";

const ANALYSIS_AI_MODELS = [
  {
    id: "anthropic.claude-haiku-4-5",
    providerId: "anthropic",
    providerName: "Anthropic",
    name: "Claude Haiku 4.5",
    apiModelId: "claude-haiku-4-5",
    bedrockModelId:
      process.env.BEDROCK_CLAUDE_HAIKU_MODEL_ID ||
      process.env.BEDROCK_CLAUDE_HAIKU_4_5_MODEL_ID ||
      process.env.VITE_BEDROCK_CLAUDE_HAIKU_MODEL_ID ||
      process.env.VITE_BEDROCK_CLAUDE_HAIKU_4_5_MODEL_ID ||
      DEFAULT_HAIKU_BEDROCK_MODEL_ID,
  },
  {
    id: "groq.llama-3.3-70b-versatile",
    providerId: "groq",
    providerName: "Groq",
    name: "Groq Llama 3.3 70B",
    apiModelId: process.env.GROQ_MODEL_ID || process.env.VITE_GROQ_MODEL_ID || DEFAULT_GROQ_MODEL_ID,
  },
];

const MODEL_BY_ID = new Map(ANALYSIS_AI_MODELS.map((model) => [model.id, model]));
const DEFAULT_ANALYSIS_AI_MODEL_ID = "anthropic.claude-haiku-4-5";
const GROQ_FALLBACK_MODEL_ID = "groq.llama-3.3-70b-versatile";

class ModelNotConfiguredError extends Error {
  constructor(message) {
    super(message);
    this.name = "ModelNotConfiguredError";
  }
}

function getEnvValue(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getBedrockRegion() {
  return getEnvValue("BEDROCK_REGION", "AWS_REGION", "VITE_BEDROCK_REGION") || DEFAULT_BEDROCK_REGION;
}

function getBedrockBearerToken() {
  return getEnvValue("AWS_BEARER_TOKEN_BEDROCK", "VITE_AWS_BEARER_TOKEN_BEDROCK");
}

function getGroqApiKey() {
  return getEnvValue("GROQ_API_KEY", "VITE_GROQ_API_KEY");
}

function getAnthropicApiKey() {
  return getEnvValue("ANTHROPIC_API_KEY", "VITE_ANTHROPIC_API_KEY");
}

function resolveSelectedModel(modelId) {
  if (modelId && MODEL_BY_ID.has(modelId)) {
    return MODEL_BY_ID.get(modelId);
  }
  return MODEL_BY_ID.get(DEFAULT_ANALYSIS_AI_MODEL_ID);
}

function getProviderEnvHint(providerId) {
  switch (providerId) {
    case "anthropic":
      return "Configure AWS_BEARER_TOKEN_BEDROCK or ANTHROPIC_API_KEY.";
    case "groq":
      return "Configure GROQ_API_KEY.";
    default:
      return "Provider key is missing.";
  }
}

function isGroqConfigured() {
  return Boolean(getGroqApiKey());
}

function isBedrockConfigured() {
  return Boolean(getBedrockBearerToken());
}

function isAnthropicDirectConfigured() {
  return Boolean(getAnthropicApiKey());
}

function isModelConfigured(model) {
  if (model.providerId === "anthropic") {
    return isBedrockConfigured() || isAnthropicDirectConfigured();
  }
  if (model.providerId === "groq") {
    return isGroqConfigured();
  }
  return false;
}

function buildProviderConfigurationError(model) {
  return new ModelNotConfiguredError(
    `Selected model "${model.name}" is not configured. ${getProviderEnvHint(model.providerId)}`,
  );
}

function buildBedrockApiUrl(modelId) {
  return `https://bedrock-runtime.${getBedrockRegion()}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
}

function clip(value, maxLength = 220) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

async function fetchWithTimeout(url, options, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeQuality(quality) {
  const normalized = String(quality || "").trim().toLowerCase();
  if (normalized === "blunder") return "Blunder";
  if (normalized === "mistake") return "Mistake";
  if (normalized === "brilliant" || normalized === "brillient") return "Brilliant";
  return null;
}

function buildQualityLines(moves) {
  return moves
    .map((move) => {
      const parts = [
        `ply:${move.ply}`,
        `move:${move.san}`,
        `quality:${move.quality}`,
      ];
      if (move.bestMove) parts.push(`best:${move.bestMove}`);
      if (move.epLoss !== undefined) {
        parts.push(`loss:${Number(move.epLoss).toFixed(3)}`);
      }
      return parts.join(" | ");
    })
    .join("\n");
}

async function callOpenAiCompatibleApi({
  apiUrl,
  apiKey,
  modelId,
  messages,
  maxTokens,
  temperature,
  responseFormat,
}) {
  const response = await fetchWithTimeout(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: maxTokens,
      temperature,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Model request failed (${response.status}): ${clip(text, 500)}`);
  }

  const data = JSON.parse(text);
  return {
    content: String(data?.choices?.[0]?.message?.content || ""),
    model: data?.model || modelId,
  };
}

async function callBedrockConverse(modelId, systemPrompt, userPrompt, maxTokens, temperature) {
  const bearerToken = getBedrockBearerToken();
  if (!bearerToken) {
    throw new Error("Bedrock bearer token not configured");
  }

  const response = await fetchWithTimeout(buildBedrockApiUrl(modelId), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      system: [{ text: systemPrompt }],
      messages: [
        {
          role: "user",
          content: [{ text: userPrompt }],
        },
      ],
      inferenceConfig: {
        maxTokens,
        temperature,
      },
    }),
  }, 12000);

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Bedrock API error ${response.status}: ${clip(text, 500)}`);
  }

  const data = JSON.parse(text);
  return {
    content: data?.output?.message?.content?.[0]?.text || "",
    model: modelId,
  };
}

async function callAnthropicApi(modelId, systemPrompt, userPrompt, maxTokens, temperature) {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    throw new Error("Anthropic API key not configured");
  }

  const response = await fetchWithTimeout(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Anthropic API error ${response.status}: ${clip(text, 500)}`);
  }

  const data = JSON.parse(text);
  const content =
    data?.content?.find((item) => item?.type === "text")?.text ||
    data?.content?.[0]?.text ||
    "";
  return {
    content,
    model: data?.model || modelId,
  };
}

async function callSelectedModel(selectedModel, options) {
  const { systemPrompt, userPrompt, maxTokens, temperature, responseFormat } = options;

  if (selectedModel.providerId === "anthropic") {
    if (isBedrockConfigured()) {
      return callBedrockConverse(
        selectedModel.bedrockModelId || selectedModel.apiModelId,
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature,
      );
    }

    if (isAnthropicDirectConfigured()) {
      return callAnthropicApi(
        selectedModel.apiModelId,
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature,
      );
    }

    throw buildProviderConfigurationError(selectedModel);
  }

  if (selectedModel.providerId === "groq") {
    const apiKey = getGroqApiKey();
    if (!apiKey) throw buildProviderConfigurationError(selectedModel);

    return callOpenAiCompatibleApi({
      apiUrl: GROQ_API_URL,
      apiKey,
      modelId: selectedModel.apiModelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens,
      temperature,
      responseFormat,
    });
  }

  throw new Error(`Unsupported provider: ${selectedModel.providerId}`);
}

async function callModelWithGroqFallback(selectedModel, options) {
  try {
    return await callSelectedModel(selectedModel, options);
  } catch (selectedError) {
    if (selectedModel.providerId === "groq" || !isGroqConfigured()) {
      throw selectedError;
    }

    const fallbackReason =
      selectedError instanceof Error ? selectedError.message : String(selectedError);
    console.warn(
      `[ai] Selected model "${selectedModel.name}" failed; falling back to Groq. ${fallbackReason}`,
    );

    const fallbackModel = MODEL_BY_ID.get(GROQ_FALLBACK_MODEL_ID);
    return callSelectedModel(fallbackModel, options);
  }
}

function stripMarkdownCodeFence(content) {
  return String(content || "")
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
}

function parsePlyNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);

  const text = String(value ?? "")
    .trim()
    .replace(/^[^\d-]*/, "")
    .replace(/[^\d-].*$/, "");
  if (!text) return null;

  const numeric = Number(text);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function parseBilingualValue(value) {
  if (typeof value === "string") {
    const text = clip(value);
    return text ? { en: text, mn: text } : null;
  }

  if (!value || typeof value !== "object") return null;

  const english = clip(value.en ?? value.english ?? value.text ?? "");
  const mongolian = clip(value.mn ?? value.mongolian ?? value.mn_MN ?? "");
  if (!english && !mongolian) return null;

  return {
    en: english || mongolian,
    mn: mongolian || english,
  };
}

function collectBilingualFromUnknown(raw) {
  const parsed = {};
  const seen = new Set();

  const addEntry = (plyValue, value) => {
    const ply = parsePlyNumber(plyValue);
    if (!ply || ply < 1) return;

    const explanation = parseBilingualValue(value);
    if (explanation) parsed[ply] = explanation;
  };

  const walk = (node, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 5 || seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, depth + 1));
      return;
    }

    if (node.ply !== undefined || node.moveNumber !== undefined) {
      addEntry(node.ply ?? node.moveNumber, node);
    }

    Object.entries(node).forEach(([key, value]) => {
      const keyPly = parsePlyNumber(key);
      if (keyPly && keyPly > 0) {
        addEntry(keyPly, value);
        return;
      }

      if (value && typeof value === "object") {
        const valueRecord = value;
        if (valueRecord.ply !== undefined || valueRecord.moveNumber !== undefined) {
          addEntry(valueRecord.ply ?? valueRecord.moveNumber, valueRecord);
        }
        walk(value, depth + 1);
      }
    });
  };

  walk(raw);
  return parsed;
}

function tryParseBilingualJsonObject(content) {
  const sanitized = stripMarkdownCodeFence(content);
  const candidates = [sanitized];
  const objectMatch = sanitized.match(/\{[\s\S]*\}/);
  if (objectMatch && objectMatch[0] !== sanitized) candidates.push(objectMatch[0]);
  const arrayMatch = sanitized.match(/\[[\s\S]*\]/);
  if (arrayMatch && arrayMatch[0] !== sanitized) candidates.push(arrayMatch[0]);

  for (const candidate of candidates) {
    try {
      const parsed = collectBilingualFromUnknown(JSON.parse(candidate));
      if (Object.keys(parsed).length > 0) return parsed;
    } catch {
      // Continue trying more permissive candidates.
    }
  }

  return {};
}

export function getAiProviderStatus(selectedModelId) {
  const selectedModel = resolveSelectedModel(selectedModelId);
  return {
    anthropicConfigured: isBedrockConfigured() || isAnthropicDirectConfigured(),
    bedrockConfigured: isBedrockConfigured(),
    groqConfigured: isGroqConfigured(),
    bedrockRegion: getBedrockRegion(),
    bedrockModelId: selectedModel.bedrockModelId || "",
    groqModelId: MODEL_BY_ID.get(GROQ_FALLBACK_MODEL_ID)?.apiModelId || DEFAULT_GROQ_MODEL_ID,
    selectedModelId: selectedModel.id,
    selectedModelName: selectedModel.name,
    supportedModels: ANALYSIS_AI_MODELS.map(({ id, providerId, name }) => ({
      id,
      providerId,
      name,
      configured: isModelConfigured(MODEL_BY_ID.get(id)),
    })),
  };
}

export async function getAiBatchExplanations(moves, selectedModelId) {
  const selectedModel = resolveSelectedModel(selectedModelId);
  if (!isModelConfigured(selectedModel) && !isGroqConfigured()) {
    throw buildProviderConfigurationError(selectedModel);
  }

  if (!Array.isArray(moves) || moves.length === 0) {
    return { explanationsByPly: {}, model: null };
  }

  const filtered = moves
    .slice(0, 40)
    .map((move) => {
      const quality = normalizeQuality(move?.quality);
      if (!quality) return null;
      const ply = Number(move?.ply);
      if (!Number.isFinite(ply) || ply < 1) return null;

      return {
        ply: Math.trunc(ply),
        san: clip(move?.san || `Move ${ply}`, 40),
        quality,
        bestMove: move?.bestMove ? clip(move.bestMove, 40) : undefined,
        epLoss: Number.isFinite(Number(move?.epLoss)) ? Number(move.epLoss) : undefined,
      };
    })
    .filter(Boolean);

  if (filtered.length === 0) {
    return { explanationsByPly: {}, model: null };
  }

  const systemPrompt =
    "You are a strong chess coach. Explain why each move is a blunder, mistake, or brilliant idea. Be concrete about tactics, threats, and material swings.";
  const userPrompt = `Analyze the following moves and return JSON only.
Each move must have two short explanations:
- en: natural English
- mn: natural conversational Mongolian written in Mongolian Cyrillic script

Moves:
${buildQualityLines(filtered)}

Response format:
{
  "12": { "en": "...", "mn": "..." },
  "24": { "en": "...", "mn": "..." }
}

Rules:
- Keep each explanation under 220 characters.
- No markdown, no extra keys, no surrounding commentary.
- Focus on concrete reason (fork, hanging piece, missed tactic, forced mate, etc).`;

  const response = await callModelWithGroqFallback(selectedModel, {
    systemPrompt,
    userPrompt,
    maxTokens: 1200,
    temperature: 0.35,
    responseFormat: { type: "json_object" },
  });

  const parsed = tryParseBilingualJsonObject(response.content);
  if (Object.keys(parsed).length === 0) {
    throw new Error("AI returned an unsupported format for batch explanations.");
  }

  return {
    explanationsByPly: parsed,
    model: response.model || selectedModel.apiModelId,
  };
}

export { ModelNotConfiguredError };
