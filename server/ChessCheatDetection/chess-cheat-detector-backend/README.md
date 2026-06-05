# Chess Cheat Detector Backend API

## What this backend does

This FastAPI service accepts a PGN or move list, extracts a 17-feature
cheat-detection vector, and runs the bundled ONNX models.

Important: the backend extractor uses a lightweight heuristic evaluation, not
Stockfish. That keeps deployment simple, but it also means live inference will
not perfectly match any training pipeline that used engine-grade centipawn loss.

The downloaded zip is internally inconsistent:

- `xgboost_cheat_detector.onnx` matches the 17-feature FICS checkpoint data.
- The bundled neural-network artifacts appear to come from a separate 9-feature
  pipeline (`chess_games_features.csv` + `scaler_params.json`).

Because of that, this backend enables XGBoost immediately and only enables the
neural network if its feature contract matches at runtime.

## Project structure

```text
chess-cheat-detector-backend/
├── main.py
├── feature_extractor.py
├── requirements.txt
├── Dockerfile
├── README.md
├── fics_features_checkpoint.csv
├── chess_games_features.csv
└── models/
    ├── model_metadata.json
    ├── neural_network_cheat_detector.onnx
    ├── nn_cheat_detector.onnx
    ├── scaler_params.json
    ├── xgboost_cheat_detector.json
    └── xgboost_cheat_detector.onnx
```

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Service and model status |
| `GET` | `/health` | Health check |
| `POST` | `/predict/pgn` | Predict from PGN |
| `POST` | `/predict/moves` | Predict from move list |
| `GET` | `/model-info` | Detailed model contract info |

## Run locally

```bash
pip install -r requirements.txt
python main.py
```

Open [http://localhost:8000/docs](http://localhost:8000/docs).

## Example request

Use `POST /predict/pgn` with:

```json
{
  "pgn": "[Event \"Game\"]\n[White \"Player1\"]\n[Black \"Player2\"]\n[WhiteElo \"1800\"]\n[BlackElo \"2200\"]\n[Result \"0-1\"]\n\n1. e4 d5 2. Nf3 dxe4 3. Ng5 Bf5 4. g4 Bg6 5. Nc3 Nf6 6. h4 h6 7. Nh3 e5 8. Bc4 Nc6 9. h5 Bh7 10. g5 hxg5 11. Nxg5 Bg6 12. d3 Rxh5 13. Rxh5 Bxh5 14. Qd2 exd3 15. cxd3 Nd4 16. b3 Qd7 17. Bb2 Qc6 18. Nd5 Nxd5 19. Bxd4 Bb4 0-1",
  "analyze_side": "black"
}
```

## Render notes

- The Docker image listens on `PORT`, which Render injects automatically.
- The service is safe to deploy with XGBoost only.
- If you want both models live, retrain or export a neural network on the same
  17-feature contract as the XGBoost checkpoint.
- If you want the strongest detection quality, retrain and validate against the
  exact same feature extractor you deploy.
