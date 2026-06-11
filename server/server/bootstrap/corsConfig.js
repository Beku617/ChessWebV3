const allowedOrigins = [
  ...new Set(
    String(process.env.CLIENT_ORIGINS || process.env.CORS_ORIGINS || "")
      .split(",")
      .map((origin) => String(origin || "").trim())
      .filter(Boolean),
  ),
];

function isAllowedOrigin(origin) {
  return !origin || allowedOrigins.includes(origin);
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

export { PORT, allowedOrigins, corsOptions };
