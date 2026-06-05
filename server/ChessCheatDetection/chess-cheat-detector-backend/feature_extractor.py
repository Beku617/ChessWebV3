"""
Feature extraction for chess cheat detection.

The bundled XGBoost model expects the 17-feature contract used in
`fics_features_checkpoint.csv`. This extractor recreates that contract
without requiring an external engine binary.
"""

from __future__ import annotations

import io
import re
from typing import Dict, List, Optional

import chess
import chess.pgn
import numpy as np

FEATURE_NAMES = [
    "avg_centipawn_loss",
    "std_centipawn_loss",
    "median_centipawn_loss",
    "max_centipawn_loss",
    "cp_loss_q25",
    "cp_loss_q75",
    "top1_move_rate",
    "blunder_rate",
    "mistake_rate",
    "cp_loss_variance",
    "player_elo",
    "opponent_elo",
    "elo_diff",
    "player_rd",
    "game_length",
    "time_base",
    "won",
]

_RESULT_TOKENS = {"1-0", "0-1", "1/2-1/2", "*"}
_MOVE_NUMBER_RE = re.compile(r"^\d+\.(\.\.)?")


def parse_pgn_string(pgn_string: str) -> Optional[chess.pgn.Game]:
    """Parse a PGN string into a chess game object."""
    try:
        return chess.pgn.read_game(io.StringIO(pgn_string))
    except Exception:
        return None


def parse_moves_list(moves: List[str]) -> Optional[List[chess.Move]]:
    """Parse a list of SAN or UCI moves into legal `chess.Move` objects."""
    board = chess.Board()
    parsed_moves: List[chess.Move] = []

    for raw_move in moves:
        move_str = raw_move.strip()
        if not move_str:
            continue
        if move_str in _RESULT_TOKENS:
            continue

        move_str = _MOVE_NUMBER_RE.sub("", move_str).strip()
        if not move_str:
            continue

        try:
            move = chess.Move.from_uci(move_str)
            if move in board.legal_moves:
                parsed_moves.append(move)
                board.push(move)
                continue
        except Exception:
            pass

        try:
            move = board.parse_san(move_str)
            parsed_moves.append(move)
            board.push(move)
        except Exception:
            return None

    return parsed_moves if len(parsed_moves) >= 6 else None


def simple_piece_value_eval(board: chess.Board) -> int:
    """
    Lightweight evaluation in centipawns from White's perspective.

    This is intentionally simple. It does not try to match Stockfish strength;
    it only provides a stable heuristic so the API can run without an engine.
    """
    outcome = board.outcome(claim_draw=True)
    if outcome is not None:
        if outcome.winner is None:
            return 0
        return 10000 if outcome.winner == chess.WHITE else -10000

    piece_values = {
        chess.PAWN: 100,
        chess.KNIGHT: 320,
        chess.BISHOP: 330,
        chess.ROOK: 500,
        chess.QUEEN: 900,
        chess.KING: 0,
    }

    score = 0
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is None:
            continue

        value = piece_values[piece.piece_type]
        rank = chess.square_rank(square)
        file = chess.square_file(square)
        center_distance = abs(rank - 3.5) + abs(file - 3.5)
        center_bonus = max(0.0, 4.0 - center_distance)
        value += int(center_bonus * 6)

        if piece.color == chess.WHITE:
            score += value
        else:
            score -= value

    own_mobility = board.legal_moves.count()
    board.push(chess.Move.null())
    opp_mobility = board.legal_moves.count()
    board.pop()
    score += (own_mobility - opp_mobility) * 4

    return int(score)


def _safe_int(value: str, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value: str, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _player_eval(score_from_white_pov: int, analyze_white: bool) -> float:
    return float(score_from_white_pov if analyze_white else -score_from_white_pov)


def _result_score(board: chess.Board, analyze_white: bool) -> float:
    outcome = board.outcome(claim_draw=True)
    if outcome is None or outcome.winner is None:
        return 0.5
    if outcome.winner == chess.WHITE:
        return 1.0 if analyze_white else 0.0
    return 0.0 if analyze_white else 1.0


def extract_features_from_moves(
    moves: List[chess.Move],
    analyze_white: bool = True,
    player_elo: int = 1500,
    opponent_elo: int = 1500,
    player_rd: float = 50.0,
    time_base: int = 600,
    max_analyzed_moves: int = 35,
    candidate_limit: int = 20,
) -> Optional[Dict[str, float]]:
    """Extract the 17 backend features from a legal move list."""
    board = chess.Board()
    cp_losses: List[float] = []
    top1_count = 0
    analyzed_moves = 0

    for move in moves:
        is_player_turn = (board.turn == chess.WHITE) == analyze_white

        if is_player_turn and analyzed_moves < max_analyzed_moves:
            legal_moves = list(board.legal_moves)
            if move not in legal_moves:
                return None

            best_eval = float("-inf")
            best_move: Optional[chess.Move] = None

            for candidate in legal_moves[:candidate_limit]:
                board.push(candidate)
                candidate_eval = _player_eval(simple_piece_value_eval(board), analyze_white)
                board.pop()
                if candidate_eval > best_eval:
                    best_eval = candidate_eval
                    best_move = candidate

            board.push(move)
            played_eval = _player_eval(simple_piece_value_eval(board), analyze_white)

            cp_loss = max(0.0, best_eval - played_eval) if best_move is not None else 0.0
            cp_losses.append(cp_loss)
            if best_move is not None and move == best_move:
                top1_count += 1
            analyzed_moves += 1
            continue

        if move not in board.legal_moves:
            return None
        board.push(move)

    if analyzed_moves < 5 or not cp_losses:
        return None

    cp = np.asarray(cp_losses, dtype=np.float32)
    result_score = _result_score(board, analyze_white)

    return {
        "avg_centipawn_loss": float(np.mean(cp)),
        "std_centipawn_loss": float(np.std(cp)),
        "median_centipawn_loss": float(np.median(cp)),
        "max_centipawn_loss": float(np.max(cp)),
        "cp_loss_q25": float(np.percentile(cp, 25)),
        "cp_loss_q75": float(np.percentile(cp, 75)),
        "top1_move_rate": float(top1_count / analyzed_moves),
        "blunder_rate": float(np.mean(cp > 200)),
        "mistake_rate": float(np.mean((cp > 100) & (cp <= 200))),
        "cp_loss_variance": float(np.var(cp)),
        "player_elo": float(player_elo),
        "opponent_elo": float(opponent_elo),
        "elo_diff": float(player_elo - opponent_elo),
        "player_rd": float(player_rd),
        "game_length": float(len(moves)),
        "time_base": float(time_base),
        "won": float(result_score),
    }


def extract_features_from_pgn(
    pgn_string: str,
    analyze_side: str = "auto",
) -> Optional[Dict[str, float]]:
    """Extract features from a PGN string."""
    game = parse_pgn_string(pgn_string)
    if game is None:
        return None

    moves: List[chess.Move] = list(game.mainline_moves())
    if len(moves) < 6:
        return None

    headers = game.headers
    white_elo = _safe_int(headers.get("WhiteElo"), 1500)
    black_elo = _safe_int(headers.get("BlackElo"), 1500)
    white_rd = _safe_float(headers.get("WhiteRD"), 50.0)
    black_rd = _safe_float(headers.get("BlackRD"), 50.0)

    tc = headers.get("TimeControl", "600+0")
    try:
        time_base = int(str(tc).split("+", 1)[0])
    except (TypeError, ValueError):
        time_base = 600

    if analyze_side == "white":
        analyze_white = True
    elif analyze_side == "black":
        analyze_white = False
    else:
        result = headers.get("Result", "*")
        analyze_white = result != "0-1"

    if analyze_white:
        player_elo = white_elo
        opponent_elo = black_elo
        player_rd = white_rd
    else:
        player_elo = black_elo
        opponent_elo = white_elo
        player_rd = black_rd

    return extract_features_from_moves(
        moves=moves,
        analyze_white=analyze_white,
        player_elo=player_elo,
        opponent_elo=opponent_elo,
        player_rd=player_rd,
        time_base=time_base,
    )
