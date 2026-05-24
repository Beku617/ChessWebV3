import { Router } from "express";
import { Chess } from "chess.js";
import { authMiddleware } from "../middleware/index.js";

const router = Router();
const MAX_PGN_LENGTH = 200_000;

function normalizeHeaderValue(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizePgnDate(rawDate) {
  const trimmed = String(rawDate || "").trim();
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.replace(/-/g, ".");

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function normalizeResult(rawResult) {
  const result = String(rawResult || "").trim();
  if (result === "1-0" || result === "0-1" || result === "1/2-1/2") {
    return result;
  }
  return "*";
}

function parseElo(rawElo, fallback = 1500) {
  const parsed = Number.parseInt(String(rawElo || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function detectVariant(variantHeader, eventHeader) {
  const variantText = String(variantHeader || "").toLowerCase();
  const eventText = String(eventHeader || "").toLowerCase();
  const combined = `${variantText} ${eventText}`;
  if (combined.includes("960")) return "chess960";
  return "standard";
}

function buildImportedGame({
  headers,
  normalizedPgn,
  moves,
  finalFen,
  requestUserId,
}) {
  const event = normalizeHeaderValue(headers.Event, "Practice PGN Import");
  const site = normalizeHeaderValue(headers.Site, "NeonGambit");
  const date = normalizePgnDate(headers.Date);
  const round = normalizeHeaderValue(headers.Round, "-");
  const white = normalizeHeaderValue(headers.White, "White");
  const black = normalizeHeaderValue(headers.Black, "Black");
  const result = normalizeResult(headers.Result);
  const nowIso = new Date().toISOString();
  const now = new Date(nowIso);
  const utcDateFallback = date;
  const utcTimeFallback = now.toISOString().slice(11, 19);
  const startingFenRaw = normalizeHeaderValue(headers.FEN);
  const startingFen =
    startingFenRaw && startingFenRaw.toLowerCase() !== "start"
      ? startingFenRaw
      : "start";
  const variant = detectVariant(headers.Variant, event);

  return {
    _id: `pgn-import-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    userId: requestUserId || undefined,
    event,
    site,
    date,
    round,
    white,
    black,
    result,
    variant,
    currentPosition: finalFen,
    startingFen,
    timeControl: normalizeHeaderValue(headers.TimeControl, "-"),
    utcDate: normalizeHeaderValue(headers.UTCDate, utcDateFallback),
    utcTime: normalizeHeaderValue(headers.UTCTime, utcTimeFallback),
    startTime: utcTimeFallback,
    endDate: utcDateFallback,
    endTime: utcTimeFallback,
    whiteElo: parseElo(headers.WhiteElo),
    blackElo: parseElo(headers.BlackElo),
    rated: false,
    eco: normalizeHeaderValue(headers.ECO),
    termination: normalizeHeaderValue(headers.Termination, "Normal"),
    moveText: moves.join(" "),
    moves,
    pgn: normalizedPgn,
    playAs: "white",
    opponent: black,
    createdAt: nowIso,
  };
}

router.post("/parse", authMiddleware, async (req, res) => {
  try {
    const rawPgn = String(req.body?.pgn || "");
    const trimmedPgn = rawPgn.trim();
    if (!trimmedPgn) {
      return res.status(400).json({ error: "PGN text is required." });
    }

    if (trimmedPgn.length > MAX_PGN_LENGTH) {
      return res.status(413).json({
        error: `PGN is too large. Maximum supported size is ${MAX_PGN_LENGTH} characters.`,
      });
    }

    const parser = new Chess();
    const loadPgn =
      typeof parser.loadPgn === "function"
        ? parser.loadPgn.bind(parser)
        : typeof parser.load_pgn === "function"
          ? parser.load_pgn.bind(parser)
          : null;

    if (!loadPgn) {
      return res
        .status(500)
        .json({ error: "PGN parser is not available on this server build." });
    }

    let loaded = false;
    try {
      const result = loadPgn(trimmedPgn, { sloppy: true });
      loaded = result !== false;
    } catch {
      loaded = false;
    }

    if (!loaded) {
      return res.status(400).json({
        error: "Invalid PGN. Please check the file or pasted text.",
      });
    }

    const moves = parser.history();
    if (!moves.length) {
      return res.status(400).json({
        error: "PGN parsed but contains no moves to analyze.",
      });
    }

    const headers =
      typeof parser.header === "function" ? parser.header() || {} : {};
    const normalizedPgn = String(parser.pgn() || trimmedPgn).trim();
    const game = buildImportedGame({
      headers,
      normalizedPgn,
      moves,
      finalFen: parser.fen(),
      requestUserId: String(req.user?.userId || "").trim(),
    });

    return res.json({
      game,
      moveCount: moves.length,
      normalizedPgn,
    });
  } catch (error) {
    console.error("PGN parse error:", error);
    return res.status(500).json({ error: "Failed to parse PGN." });
  }
});

export default router;
