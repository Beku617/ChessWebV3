const BASE_URL = import.meta.env.BASE_URL || "/";

export const STOCKFISH_WORKER_URL = `${BASE_URL.replace(/\/?$/, "/")}stockfish.js`;

export function createStockfishWorker(): Worker | null {
  if (typeof Worker === "undefined") {
    return null;
  }

  try {
    return new Worker(STOCKFISH_WORKER_URL);
  } catch (error) {
    console.error("Failed to initialize Stockfish worker.", error);
    return null;
  }
}
