import fs from "node:fs";
import path from "node:path";

const DEFAULT_REGION = "eu-north-1";
const DEFAULT_HAIKU_MODEL =
  "global.anthropic.claude-haiku-4-5-20251001-v1:0";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const parsed = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    parsed[key] = raw.replace(/^['"]/, "").replace(/['"]$/, "");
  }
  return parsed;
}

function loadLocalEnv(cwd) {
  return [".env", ".env.local"].reduce(
    (acc, fileName) => ({ ...acc, ...parseEnvFile(path.join(cwd, fileName)) }),
    {},
  );
}

function envValue(env, ...names) {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function fetchWithTimeout(url, options, timeoutMs = 30000) {
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

function clip(value, max = 240) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

async function testBedrockHaiku({ modelId, region, bearerToken }) {
  if (!bearerToken) {
    return {
      provider: "bedrock",
      modelId,
      status: "skipped",
      detail: "Missing AWS_BEARER_TOKEN_BEDROCK",
    };
  }

  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({
        system: [{ text: "You are concise." }],
        messages: [
          { role: "user", content: [{ text: "Reply with OK only." }] },
        ],
        inferenceConfig: {
          maxTokens: 20,
          temperature: 0,
        },
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        provider: "bedrock",
        modelId,
        status: "failed",
        detail: `HTTP ${response.status}: ${clip(text)}`,
      };
    }

    const parsed = JSON.parse(text);
    return {
      provider: "bedrock",
      modelId,
      status: "ok",
      detail: clip(parsed?.output?.message?.content?.[0]?.text || text),
    };
  } catch (error) {
    return {
      provider: "bedrock",
      modelId,
      status: "failed",
      detail: clip(error instanceof Error ? error.message : String(error)),
    };
  }
}

async function testGroqFallback({ modelId, apiKey }) {
  if (!apiKey) {
    return {
      provider: "groq",
      modelId,
      status: "skipped",
      detail: "Missing GROQ_API_KEY",
    };
  }

  try {
    const response = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "Reply with OK only." }],
          max_tokens: 12,
          temperature: 0,
        }),
      },
    );

    const text = await response.text();
    if (!response.ok) {
      return {
        provider: "groq",
        modelId,
        status: "failed",
        detail: `HTTP ${response.status}: ${clip(text)}`,
      };
    }

    const parsed = JSON.parse(text);
    return {
      provider: "groq",
      modelId,
      status: "ok",
      detail: clip(parsed?.choices?.[0]?.message?.content || text),
    };
  } catch (error) {
    return {
      provider: "groq",
      modelId,
      status: "failed",
      detail: clip(error instanceof Error ? error.message : String(error)),
    };
  }
}

function statusCell(status) {
  if (status === "ok") return "OK";
  if (status === "failed") return "FAIL";
  if (status === "skipped") return "SKIP";
  return status;
}

async function main() {
  const env = {
    ...loadLocalEnv(process.cwd()),
    ...process.env,
  };

  const region =
    envValue(env, "BEDROCK_REGION", "AWS_REGION", "VITE_BEDROCK_REGION") ||
    DEFAULT_REGION;
  const haikuModel =
    envValue(
      env,
      "BEDROCK_CLAUDE_HAIKU_MODEL_ID",
      "BEDROCK_CLAUDE_HAIKU_4_5_MODEL_ID",
      "VITE_BEDROCK_CLAUDE_HAIKU_MODEL_ID",
      "VITE_BEDROCK_CLAUDE_HAIKU_4_5_MODEL_ID",
    ) || DEFAULT_HAIKU_MODEL;
  const bedrockToken = envValue(
    env,
    "AWS_BEARER_TOKEN_BEDROCK",
    "VITE_AWS_BEARER_TOKEN_BEDROCK",
  );
  const groqKey = envValue(env, "GROQ_API_KEY", "VITE_GROQ_API_KEY");
  const groqModel =
    envValue(env, "GROQ_MODEL_ID", "VITE_GROQ_MODEL_ID") ||
    DEFAULT_GROQ_MODEL;

  const results = await Promise.all([
    testBedrockHaiku({ modelId: haikuModel, region, bearerToken: bedrockToken }),
    testGroqFallback({ modelId: groqModel, apiKey: groqKey }),
  ]);

  console.log("");
  console.log("AI model connectivity check");
  console.log("=".repeat(80));
  for (const result of results) {
    const left = `${result.provider}/${result.modelId}`.padEnd(54, " ");
    const mid = statusCell(result.status).padEnd(5, " ");
    console.log(`${left} ${mid} ${result.detail}`);
  }
  console.log("=".repeat(80));

  if (results.some((result) => result.status === "failed")) {
    process.exitCode = 1;
  }
}

await main();
