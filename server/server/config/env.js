import dotenv from "dotenv";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const envCandidates = [
  join(__dirname, "..", "..", "..", ".env.local"),
  join(__dirname, "..", "..", "..", ".env"),
  join(__dirname, "..", "..", ".env.local"),
  join(__dirname, "..", "..", ".env"),
  join(process.cwd(), ".env.local"),
  join(process.cwd(), ".env"),
];

const loadedEnvPaths = new Set();

export function loadServerEnv() {
  for (const candidate of envCandidates) {
    if (!existsSync(candidate) || loadedEnvPaths.has(candidate)) continue;
    dotenv.config({ path: candidate });
    loadedEnvPaths.add(candidate);
  }
}

loadServerEnv();
