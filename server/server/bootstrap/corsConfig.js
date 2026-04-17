const allowedOrigins = [
  "http://localhost:5173",
  "https://neongambit-chesswebv3.vercel.app",
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
