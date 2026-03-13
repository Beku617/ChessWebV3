import mongoose from "mongoose";

const DB_STATE_LABELS = Object.freeze({
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
});

function registerHealthRoute(app) {
  app.get("/healthz", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: "neongambit-server",
      db: DB_STATE_LABELS[mongoose.connection.readyState] || "unknown",
      timestamp: new Date().toISOString(),
    });
  });
}

export { registerHealthRoute };
