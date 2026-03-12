import { Router } from "express";

const router = Router();

const LICHESS_API_BASE = "https://lichess.org/api";
const DEFAULT_TIMEOUT_MS = 8000;
const TV_CACHE_TTL_MS = 15000;
const TV_REQUEST_COOLDOWN_MS = 2500;

// simple in-memory cache to keep last good response
let cachedGames = [];
let cachedAt = 0;
let lastTvFetchAt = 0;
let tvInFlightPromise = null;

const sampleGames = [
  {
    id: "sample-1",
    white: "Nakamura",
    whiteRating: 2900,
    black: "Firouzja",
    blackRating: 2780,
    viewers: "8200",
    time: "3+0",
    type: "Blitz",
    category: "Blitz",
    speed: "blitz",
    gameUrl: "https://lichess.org",
  },
  {
    id: "sample-2",
    white: "Hou Yifan",
    whiteRating: 2660,
    black: "Ju Wenjun",
    blackRating: 2600,
    viewers: "4100",
    time: "10+5",
    type: "Rapid",
    category: "Rapid",
    speed: "rapid",
    gameUrl: "https://lichess.org",
  },
  {
    id: "sample-3",
    white: "Carlsen",
    whiteRating: 2850,
    black: "Caruana",
    blackRating: 2800,
    viewers: "9600",
    time: "1+0",
    type: "Blitz",
    category: "Blitz",
    speed: "bullet",
    gameUrl: "https://lichess.org",
  },
];

const SPEED_TO_CATEGORY = {
  bullet: "Blitz",
  ultrabullet: "Blitz",
  blitz: "Blitz",
  rapid: "Rapid",
  classical: "Classical",
  correspondence: "Classical",
};

function formatTimeControl(clock, speed) {
  if (clock && typeof clock.initial === "number") {
    const base = clock.initial / 60;
    const baseStr =
      Number.isInteger(base) || base >= 1
        ? `${base}`
        : `${Math.round(base * 100) / 100}`;
    const increment = clock.increment || 0;
    return `${baseStr}+${increment}`;
  }

  const fallback = {
    bullet: "1+0",
    ultrabullet: "0.25+0",
    blitz: "3+0",
    rapid: "15+10",
    classical: "30+0",
    correspondence: "Unlimited",
  };

  return fallback[speed] || "10+0";
}

function categoryFromClockOrSpeed(clock, speed) {
  if (speed) {
    const mapped = SPEED_TO_CATEGORY[speed.toLowerCase()];
    if (mapped) return mapped;
  }

  if (clock && typeof clock.initial === "number") {
    const minutes = clock.initial / 60;
    if (minutes <= 8) return "Blitz";
    if (minutes <= 25) return "Rapid";
    return "Classical";
  }

  return "Blitz";
}

function getPlayerName(player) {
  return player?.user?.name || player?.name || "Anonymous";
}

function getPlayerTitle(player) {
  return player?.user?.title || player?.title;
}

function getPlayerRating(player) {
  return player?.rating || player?.user?.rating || 1500;
}

function isAbortError(error) {
  return (
    error?.name === "AbortError" ||
    error?.code === "ABORT_ERR" ||
    String(error?.message || "").toLowerCase().includes("aborted")
  );
}

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGameExport(gameId) {
  try {
    const response = await fetchWithTimeout(
      `${LICHESS_API_BASE}/game/export/${gameId}?pgnInJson=true`,
      {
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    return null;
  }
}

async function fetchGameStreamHead(gameId) {
  try {
    const response = await fetchWithTimeout(
      `${LICHESS_API_BASE}/stream/game/${gameId}`,
      { headers: { Accept: "application/x-ndjson" } },
    );
    if (!response.ok || !response.body) return null;

    const reader = response.body.getReader();
    let buffer = "";

    for (let i = 0; i < 3; i += 1) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      buffer += Buffer.from(value).toString("utf8");
      const lineEnd = buffer.indexOf("\n");
      if (lineEnd !== -1) {
        const firstLine = buffer.slice(0, lineEnd).trim();
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        if (!firstLine) return null;
        return JSON.parse(firstLine);
      }
    }

    try {
      await reader.cancel();
    } catch {
      // ignore
    }
    return null;
  } catch (error) {
    return null;
  }
}

function isPlaceholderName(name) {
  if (!name) return true;
  const lowered = name.toLowerCase();
  return (
    lowered === "anonymous" ||
    lowered === "unknown" ||
    lowered === "opponent" ||
    lowered === "playing..."
  );
}

function mergePlayer(primary, fallback) {
  const primaryName = getPlayerName(primary);
  const fallbackName = getPlayerName(fallback);
  const name = !isPlaceholderName(primaryName)
    ? primaryName
    : fallbackName;
  const rating = getPlayerRating(primary) || getPlayerRating(fallback);
  const title = getPlayerTitle(primary) || getPlayerTitle(fallback);
  return { name, rating, title };
}

async function buildTvPayload() {
  const response = await fetchWithTimeout(`${LICHESS_API_BASE}/tv/channels`);
  if (!response.ok) throw new Error("Failed to fetch Lichess TV");

  const channels = await response.json();
  const entries = Object.entries(channels || {});

  const games = await Promise.all(
    entries.map(async ([channel, data]) => {
      if (!data?.gameId) return null;
      const gameDetails = await fetchGameExport(data.gameId);
      const speed = (gameDetails?.speed || channel || "").toLowerCase();
      const time = formatTimeControl(gameDetails?.clock, speed);
      const category = categoryFromClockOrSpeed(gameDetails?.clock, speed);

      const streamDetails =
        !gameDetails?.players || !gameDetails?.players?.white
          ? await fetchGameStreamHead(data.gameId)
          : null;

      if (gameDetails?.players || streamDetails?.white || streamDetails?.black) {
        const white = mergePlayer(
          gameDetails?.players?.white,
          streamDetails?.white,
        );
        const black = mergePlayer(
          gameDetails?.players?.black,
          streamDetails?.black,
        );

        return {
          id: data.gameId,
          white: white.name,
          whiteRating: white.rating,
          whiteTitle: white.title,
          black: black.name,
          blackRating: black.rating,
          blackTitle: black.title,
          viewers: `${Math.floor(Math.random() * 1000) + 100}`,
          time,
          type: category,
          category,
          speed,
          gameUrl: `https://lichess.org/${data.gameId}`,
        };
      }

      return {
        id: data.gameId,
        white: data.user?.name || "Unknown",
        whiteRating: data.rating || data.user?.rating || 1500,
        whiteTitle: data.user?.title,
        black: "Opponent",
        blackRating: data.rating ? data.rating - 50 : 1500,
        blackTitle: undefined,
        viewers: `${Math.floor(Math.random() * 1000) + 100}`,
        time,
        type: category,
        category,
        speed,
        gameUrl: `https://lichess.org/${data.gameId}`,
      };
    }),
  );

  const result = games.filter(Boolean);
  if (result.length > 0) {
    cachedGames = result;
    cachedAt = Date.now();
    return { games: result, source: "live" };
  }

  if (cachedGames.length > 0) {
    return { games: cachedGames, cachedAt, source: "cache" };
  }

  return { games: sampleGames, source: "sample" };
}

router.get("/tv", async (_req, res) => {
  const now = Date.now();

  if (cachedGames.length > 0 && now - cachedAt < TV_CACHE_TTL_MS) {
    return res.json({ games: cachedGames, cachedAt, source: "cache" });
  }

  if (tvInFlightPromise) {
    const payload = await tvInFlightPromise;
    return res.json(payload);
  }

  if (now - lastTvFetchAt < TV_REQUEST_COOLDOWN_MS) {
    if (cachedGames.length > 0) {
      return res.json({ games: cachedGames, cachedAt, source: "cache" });
    }
    return res.json({ games: sampleGames, source: "sample" });
  }

  lastTvFetchAt = now;
  tvInFlightPromise = (async () => {
    try {
      return await buildTvPayload();
    } catch (err) {
      if (isAbortError(err)) {
        console.warn(
          "Lichess TV proxy timeout/abort. Serving cache or sample.",
        );
      } else {
        console.error("Lichess TV proxy error:", err);
      }
      if (cachedGames.length > 0) {
        return { games: cachedGames, cachedAt, source: "cache" };
      }
      return { games: sampleGames, source: "sample" };
    } finally {
      tvInFlightPromise = null;
    }
  })();

  const payload = await tvInFlightPromise;
  return res.json(payload);
});

// Streamers proxy with fallback
router.get("/streamers", async (_req, res) => {
  try {
    const response = await fetchWithTimeout(`${LICHESS_API_BASE}/streamer/live`);
    if (!response.ok) throw new Error("Failed to fetch streamers");
    const data = await response.json();
    const mapped = (data || []).slice(0, 8).map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      viewers: `${Math.floor(Math.random() * 5000) + 500}`,
      streamTitle: `${s.name} is streaming chess!`,
      avatar: s.name?.charAt(0)?.toUpperCase() || "S",
      platform: s.streamer?.twitch ? "twitch" : "youtube",
      url: s.streamer?.twitch
        ? `https://twitch.tv/${s.streamer.twitch.channel}`
        : s.streamer?.youTube
          ? `https://youtube.com/channel/${s.streamer.youTube.channel}`
          : `https://lichess.org/@/${s.id}`,
    }));
    return res.json({ streamers: mapped, source: "live" });
  } catch (err) {
    if (isAbortError(err)) {
      console.warn(
        "Lichess streamers proxy timeout/abort. Serving sample streamers.",
      );
    } else {
      console.error("Lichess streamers proxy error:", err);
    }
    const sample = [
      {
        id: "s1",
        name: "ChessLive",
        title: "IM",
        viewers: "1200",
        streamTitle: "Live chess show",
        avatar: "C",
        platform: "twitch",
        url: "https://lichess.org",
      },
      {
        id: "s2",
        name: "RapidBlitz",
        title: "GM",
        viewers: "980",
        streamTitle: "Speed chess",
        avatar: "R",
        platform: "youtube",
        url: "https://lichess.org",
      },
    ];
    return res.json({ streamers: sample, source: "sample" });
  }
});

export default router;
