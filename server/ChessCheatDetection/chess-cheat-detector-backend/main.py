"""
Chess Cheat Detector API.

This backend is built around the 17-feature XGBoost pipeline in the bundled
FICS checkpoint artifacts. Neural-network loading is optional and only enabled
when the model's feature contract matches the backend extractor.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, List, Literal, Optional, Tuple

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from feature_extractor import (
    FEATURE_NAMES,
    extract_features_from_moves,
    extract_features_from_pgn,
    parse_moves_list,
)

APP_DIR = Path(__file__).resolve().parent
MODEL_DIR = APP_DIR / "models"

app = FastAPI(
    title="Chess Cheat Detector API",
    description="Detects suspicious engine-like play from PGN or move lists.",
    version="2.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOW_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _load_xgb_feature_names() -> List[str]:
    model_json = _load_json(MODEL_DIR / "xgboost_cheat_detector.json")
    feature_names = (
        model_json
        .get("learner", {})
        .get("feature_names", [])
    )
    if not feature_names:
        return FEATURE_NAMES
    return feature_names


def _load_metadata(feature_names: List[str]) -> dict:
    metadata_path = MODEL_DIR / "model_metadata.json"
    if metadata_path.exists():
        return _load_json(metadata_path)

    return {
        "bundle_name": "chess_cheat_detector_FINAL.zip",
        "backend_feature_set": "fics_checkpoint_17_features",
        "feature_names": feature_names,
        "notes": [
            "XGBoost bundle matches the 17-feature FICS checkpoint contract.",
            "Bundled neural-network artifacts may use a different 9-feature contract and can be skipped automatically.",
        ],
    }


def _create_session(path: Path) -> ort.InferenceSession:
    return ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])


def _extract_input_dim(session: ort.InferenceSession) -> Optional[int]:
    shape = session.get_inputs()[0].shape
    if not shape:
        return None

    last_dim = shape[-1]
    if isinstance(last_dim, int):
        return last_dim

    try:
        return int(last_dim)
    except (TypeError, ValueError):
        return None


def _load_scaler() -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
    scaler_path = MODEL_DIR / "scaler_params.json"
    if not scaler_path.exists():
        return None, None

    scaler_params = _load_json(scaler_path)
    means = np.asarray(scaler_params.get("mean", []), dtype=np.float32)
    scales = np.asarray(scaler_params.get("scale", []), dtype=np.float32)
    if means.size == 0 or scales.size == 0:
        return None, None
    return means, scales


def _load_nn_model(feature_count: int) -> Tuple[Optional[ort.InferenceSession], Optional[str], List[str]]:
    warnings: List[str] = []
    scaler_mean, scaler_std = _load_scaler()
    nn_candidates = [
        MODEL_DIR / "nn_cheat_detector.onnx",
        MODEL_DIR / "neural_network_cheat_detector.onnx",
    ]

    for candidate in nn_candidates:
        if not candidate.exists():
            continue

        try:
            session = _create_session(candidate)
        except Exception as exc:  # pragma: no cover - runtime-specific
            warnings.append(f"Failed to load {candidate.name}: {exc}")
            continue

        input_dim = _extract_input_dim(session)
        if input_dim is not None and input_dim != feature_count:
            warnings.append(
                f"{candidate.name} expects {input_dim} features, but the backend extractor emits {feature_count}; skipping."
            )
            continue

        if scaler_mean is not None and scaler_mean.size != feature_count:
            warnings.append(
                f"{candidate.name} scaler has {scaler_mean.size} features, which does not match the backend {feature_count}-feature contract; skipping."
            )
            continue

        return session, session.get_inputs()[0].name, warnings

    if not warnings:
        warnings.append("No compatible neural-network artifact was found.")
    return None, None, warnings


def _extract_xgb_probability(outputs: List[object]) -> float:
    for output in outputs[1:] + outputs[:1]:
        if isinstance(output, list) and output:
            first_item = output[0]
            if isinstance(first_item, dict):
                for key in (1, "1", True, "true", 0, "0"):
                    if key in first_item:
                        value = float(first_item[key])
                        return value if key not in (0, "0") else 1.0 - value

        if isinstance(output, np.ndarray):
            array = np.asarray(output)
            if array.dtype == object and array.size:
                first_item = array.flat[0]
                if isinstance(first_item, dict):
                    for key in (1, "1", True, "true", 0, "0"):
                        if key in first_item:
                            value = float(first_item[key])
                            return value if key not in (0, "0") else 1.0 - value
            if array.ndim == 2 and array.shape[1] >= 2:
                return float(array[0, 1])
            if array.ndim == 1 and array.size >= 2:
                return float(array[1])
            if array.ndim == 2 and array.shape[1] == 1:
                return float(array[0, 0])
            if array.ndim == 1 and array.size == 1:
                return float(array[0])

    return 0.5


XGB_FEATURE_NAMES = _load_xgb_feature_names()
METADATA = _load_metadata(XGB_FEATURE_NAMES)
SCALER_MEAN, SCALER_STD = _load_scaler()
MODEL_WARNINGS: List[str] = []

xgb_session: Optional[ort.InferenceSession] = None
xgb_input_name: Optional[str] = None
try:
    xgb_session = _create_session(MODEL_DIR / "xgboost_cheat_detector.onnx")
    xgb_input_name = xgb_session.get_inputs()[0].name
except Exception as exc:  # pragma: no cover - runtime-specific
    MODEL_WARNINGS.append(f"Failed to load xgboost_cheat_detector.onnx: {exc}")

nn_session, nn_input_name, nn_warnings = _load_nn_model(len(XGB_FEATURE_NAMES))
MODEL_WARNINGS.extend(nn_warnings)


class PGNRequest(BaseModel):
    pgn: str = Field(..., min_length=10)
    analyze_side: Literal["auto", "white", "black"] = "auto"


class MovesRequest(BaseModel):
    moves: List[str]
    analyze_white: bool = True
    player_elo: int = 1500
    opponent_elo: int = 1500
    player_rd: float = 50.0
    time_base: int = 600


class PredictionResponse(BaseModel):
    is_cheating: bool
    confidence: float
    verdict: str
    xgboost_probability: Optional[float] = None
    neural_net_probability: Optional[float] = None
    features_used: Dict[str, float]
    explanation: str
    model_warnings: List[str] = Field(default_factory=list)


def _round_features(features: Dict[str, float]) -> Dict[str, float]:
    rounded: Dict[str, float] = {}
    for key, value in features.items():
        rounded[key] = round(float(value), 4)
    return rounded


def _build_explanation(features: Dict[str, float], ensemble_prob: float) -> str:
    explanations: List[str] = []
    if features.get("avg_centipawn_loss", 999.0) < 30:
        explanations.append("Very low average centipawn loss.")
    if features.get("top1_move_rate", 0.0) > 0.60:
        explanations.append("High agreement with the backend best-move heuristic.")
    if features.get("cp_loss_variance", 9999.0) < 500:
        explanations.append("Move quality is unusually consistent.")
    if features.get("blunder_rate", 1.0) < 0.01:
        explanations.append("Almost no large mistakes were detected.")
    if not explanations:
        if ensemble_prob >= 0.50:
            explanations.append("Combined feature patterns lean suspicious.")
        else:
            explanations.append("Feature patterns look more human-like than engine-like.")
    return " ".join(explanations)


def predict_from_features(features: Dict[str, float]) -> PredictionResponse:
    if xgb_session is None or xgb_input_name is None:
        raise HTTPException(status_code=503, detail="XGBoost model is not available.")

    feature_vector = [float(features.get(name, 0.0)) for name in XGB_FEATURE_NAMES]
    x = np.asarray([feature_vector], dtype=np.float32)

    xgb_outputs = xgb_session.run(None, {xgb_input_name: x})
    xgb_prob = _extract_xgb_probability(xgb_outputs)

    nn_prob: Optional[float] = None
    ensemble_prob = xgb_prob
    if nn_session is not None and nn_input_name is not None:
        nn_input = x
        if SCALER_MEAN is not None and SCALER_STD is not None and SCALER_MEAN.size == x.shape[1]:
            safe_std = np.where(SCALER_STD == 0, 1.0, SCALER_STD)
            nn_input = (x - SCALER_MEAN) / safe_std
        nn_outputs = nn_session.run(None, {nn_input_name: nn_input.astype(np.float32)})
        nn_array = np.asarray(nn_outputs[0], dtype=np.float32)
        nn_prob = float(nn_array.reshape(-1)[0])
        ensemble_prob = 0.6 * xgb_prob + 0.4 * nn_prob

    if ensemble_prob >= 0.80:
        verdict = "HIGHLY LIKELY CHEATING"
        is_cheating = True
    elif ensemble_prob >= 0.65:
        verdict = "SUSPICIOUS"
        is_cheating = True
    elif ensemble_prob >= 0.50:
        verdict = "BORDERLINE"
        is_cheating = False
    elif ensemble_prob >= 0.35:
        verdict = "LIKELY FAIR PLAY"
        is_cheating = False
    else:
        verdict = "FAIR PLAY"
        is_cheating = False

    return PredictionResponse(
        is_cheating=is_cheating,
        confidence=round(float(ensemble_prob), 4),
        verdict=verdict,
        xgboost_probability=round(float(xgb_prob), 4),
        neural_net_probability=round(float(nn_prob), 4) if nn_prob is not None else None,
        features_used=_round_features(features),
        explanation=_build_explanation(features, ensemble_prob),
        model_warnings=MODEL_WARNINGS,
    )


@app.get("/")
async def root() -> dict:
    return {
        "name": "Chess Cheat Detector API",
        "version": app.version,
        "models": {
            "xgboost": "loaded" if xgb_session is not None else "not available",
            "neural_network": "loaded" if nn_session is not None else "not available",
        },
        "feature_count": len(XGB_FEATURE_NAMES),
        "warnings": MODEL_WARNINGS,
        "metadata": METADATA,
    }


@app.get("/health")
async def health() -> dict:
    return {
        "status": "healthy" if xgb_session is not None else "degraded",
        "models_loaded": {
            "xgboost": xgb_session is not None,
            "neural_network": nn_session is not None,
        },
        "warnings": MODEL_WARNINGS,
    }


@app.post("/predict/pgn", response_model=PredictionResponse)
async def predict_pgn(request: PGNRequest) -> PredictionResponse:
    features = extract_features_from_pgn(request.pgn, request.analyze_side)
    if features is None:
        raise HTTPException(
            status_code=400,
            detail="Could not parse PGN or extract enough features. A game needs at least 6 plies.",
        )
    return predict_from_features(features)


@app.post("/predict/moves", response_model=PredictionResponse)
async def predict_moves(request: MovesRequest) -> PredictionResponse:
    parsed_moves = parse_moves_list(request.moves)
    if parsed_moves is None:
        raise HTTPException(
            status_code=400,
            detail="Could not parse the move list or the game is too short.",
        )

    features = extract_features_from_moves(
        moves=parsed_moves,
        analyze_white=request.analyze_white,
        player_elo=request.player_elo,
        opponent_elo=request.opponent_elo,
        player_rd=request.player_rd,
        time_base=request.time_base,
    )
    if features is None:
        raise HTTPException(status_code=400, detail="Could not extract features from moves.")
    return predict_from_features(features)


@app.get("/model-info")
async def model_info() -> dict:
    return {
        "metadata": METADATA,
        "feature_names": XGB_FEATURE_NAMES,
        "n_features": len(XGB_FEATURE_NAMES),
        "models": {
            "xgboost": {
                "loaded": xgb_session is not None,
                "input_name": xgb_input_name,
            },
            "neural_network": {
                "loaded": nn_session is not None,
                "input_name": nn_input_name,
            },
        },
        "warnings": MODEL_WARNINGS,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )
