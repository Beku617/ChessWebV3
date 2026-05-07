import { execSync, spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const nodeExecutable = process.execPath;
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const viteEntry = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
const backendPort = 3001;
const healthUrl = `http://localhost:${backendPort}/healthz`;
const clientArgs = process.argv.slice(2);
const children = new Set();

let shuttingDown = false;

function getPidsOnPort(port) {
  if (!Number.isInteger(port) || port <= 0) return [];

  try {
    if (process.platform === "win32") {
      const output = execSync(`netstat -ano -p tcp | findstr :${port}`, {
        shell: "cmd.exe",
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });

      const pids = output
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(/\s+/).at(-1))
        .map((pid) => Number(pid))
        .filter((pid) => Number.isInteger(pid) && pid > 0);

      return [...new Set(pids)];
    }

    const output = execSync(`lsof -ti:${port}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pids = output
      .split(/\s+/g)
      .map((value) => Number(value.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
    return [...new Set(pids)];
  } catch {
    return [];
  }
}

function freeBackendPort(port) {
  const pids = getPidsOnPort(port).filter((pid) => pid !== process.pid);
  for (const pid of pids) {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/f", "/pid", String(pid)], { stdio: "ignore" });
      } else {
        process.kill(pid, "SIGKILL");
      }
      console.log(`[dev] Freed port ${port} by stopping PID ${pid}.`);
    } catch {
      // Ignore failures; startup health checks will still validate readiness.
    }
  }
}

async function getBackendHealth() {
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

function spawnProcess(label, command, args) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  children.add(child);

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(chunk);
  });

  child.stderr?.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  child.on("error", (error) => {
    if (shuttingDown) return;
    console.error(`[dev] Failed to start ${label}:`, error);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
    children.delete(child);

    if (shuttingDown) return;

    if (signal) {
      console.error(`[dev] ${label} stopped by ${signal}.`);
    } else if (code !== 0) {
      console.error(`[dev] ${label} exited with code ${code}.`);
    }

    shutdown(code ?? 1);
  });

  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      });
      continue;
    }

    child.kill("SIGTERM");
  }

  setTimeout(() => process.exit(exitCode), 300).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function spawnBackend() {
  console.log("[dev] Starting backend on http://localhost:3001...");
  if (process.platform === "win32") {
    const command = process.env.ComSpec || "cmd.exe";
    return spawnProcess("backend", command, [
      "/d",
      "/s",
      "/c",
      "npm --prefix server run dev",
    ]);
  }

  return spawnProcess("backend", npmExecutable, [
    "--prefix",
    "server",
    "run",
    "dev",
  ]);
}

async function waitForBackendHealth(serverProcess) {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    await delay(500);

    const health = await getBackendHealth();
    if (health?.service === "neongambit-server") {
      console.log("[dev] Backend is healthy.");
      return serverProcess;
    }

    if (serverProcess.exitCode !== null) {
      throw new Error("Backend failed to start. See the server output above.");
    }
  }

  throw new Error("Timed out waiting for the backend health check on port 3001.");
}

async function ensureBackend() {
  const existingHealth = await getBackendHealth();
  if (existingHealth?.service === "neongambit-server") {
    console.log("[dev] Reusing backend on http://localhost:3001.");
    return { reused: true };
  }

  freeBackendPort(backendPort);
  const serverProcess = spawnBackend();
  await waitForBackendHealth(serverProcess);
  return { reused: false };
}

function monitorReusedBackend() {
  let misses = 0;
  let recovering = false;

  const interval = setInterval(async () => {
    if (shuttingDown || recovering) return;

    const health = await getBackendHealth();
    if (health?.service === "neongambit-server") {
      misses = 0;
      return;
    }

    misses += 1;
    if (misses < 5) return;

    recovering = true;
    console.warn(
      "[dev] Reused backend stopped responding; starting a nodemon backend.",
    );

    try {
      const serverProcess = spawnBackend();
      await waitForBackendHealth(serverProcess);
      console.log("[dev] Backend recovered.");
      clearInterval(interval);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[dev] ${message}`);
      shutdown(1);
    }
  }, 2000);

  interval.unref?.();
}

async function main() {
  try {
    const backend = await ensureBackend();
    if (backend.reused) {
      monitorReusedBackend();
    }

    console.log("[dev] Starting frontend...");
    spawnProcess("frontend", nodeExecutable, [viteEntry, ...clientArgs]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[dev] ${message}`);
    shutdown(1);
  }
}

void main();
