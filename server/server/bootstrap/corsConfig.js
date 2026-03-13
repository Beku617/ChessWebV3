const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://neongambit-chesswebv3.vercel.app",
];

const VERCEL_PREVIEW_ORIGIN_PATTERN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

function parseAllowedOrigins(rawOrigins) {
  const values = String(rawOrigins || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length > 0 ? values : DEFAULT_ALLOWED_ORIGINS;
}

const allowedOrigins = parseAllowedOrigins(
  process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN,
);

const allowVercelPreviews =
  String(process.env.ALLOW_VERCEL_PREVIEWS || "").toLowerCase() === "true";

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (allowVercelPreviews && VERCEL_PREVIEW_ORIGIN_PATTERN.test(origin)) {
    return true;
  }
  return false;
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true,
};

const PORT = Number.parseInt(process.env.PORT || "3001", 10);

export { PORT, allowVercelPreviews, allowedOrigins, corsOptions };
