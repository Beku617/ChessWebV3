import express from "express";
import {
  ModelNotConfiguredError,
  getAiBatchExplanations,
  getAiProviderStatus,
} from "../services/analysisAiService.js";

const router = express.Router();

router.get("/status", (req, res) => {
  res.json(getAiProviderStatus(req.query.modelId));
});

router.post("/explanations", async (req, res) => {
  try {
    const result = await getAiBatchExplanations(
      req.body?.moves,
      req.body?.selectedModelId,
    );
    res.json(result);
  } catch (error) {
    const status = error instanceof ModelNotConfiguredError ? 400 : 502;
    res.status(status).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to get AI explanations.",
    });
  }
});

export default router;
