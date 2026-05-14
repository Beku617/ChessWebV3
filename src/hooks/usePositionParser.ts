import { useMemo } from "react";
import { Chess, Move, Square } from "chess.js";
import { GameHistory } from "../historyTypes";
import { PlyState, MoveRow, PositionData } from "./useGameReplayTypes";
import { isLikelyChess960Game } from "../utils/chessVariantDetection";

/* ──────────────────────────────────────────────────────────
   Chess960 castling helpers (client-side, mirrors server logic)
   ────────────────────────────────────────────────────────── */

/** Parse a FEN string into an 8×8 board array plus metadata. */
function parseFen(fen: string) {
  const [placement, activeColor = "w", , , halfmove = "0", fullmove = "1"] = fen
    .trim()
    .split(/\s+/);
  const rows = placement.split("/");
  if (rows.length !== 8) return null;
  const board: (string | null)[][] = [];
  for (const row of rows) {
    const parsed: (string | null)[] = [];
    for (const ch of row) {
      const n = Number(ch);
      if (n >= 1 && n <= 8) {
        for (let i = 0; i < n; i++) parsed.push(null);
      } else {
        parsed.push(ch);
      }
    }
    board.push(parsed);
  }
  return {
    board,
    activeColor,
    halfmove: Number(halfmove),
    fullmove: Number(fullmove),
  };
}

function sqToCoords(sq: string): { file: number; rank: number } | null {
  if (sq.length !== 2) return null;
  const file = sq.charCodeAt(0) - 97; // a=0 … h=7
  const rank = 8 - Number(sq[1]); // 1→7 … 8→0 (row index)
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return { file, rank };
}

function coordsToSq(file: number, rank: number): string | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return String.fromCharCode(97 + file) + String(8 - rank);
}

function serializeBoard(board: (string | null)[][]): string {
  return board
    .map((row) => {
      let s = "";
      let empty = 0;
      for (const cell of row) {
        if (!cell) {
          empty++;
        } else {
          if (empty) {
            s += empty;
            empty = 0;
          }
          s += cell;
        }
      }
      if (empty) s += empty;
      return s;
    })
    .join("/");
}

/** Find the file index of a piece on a given rank. */
function findPieceFile(
  board: (string | null)[][],
  rank: number,
  piece: string,
): number {
  for (let f = 0; f < 8; f++) {
    if (board[rank][f] === piece) return f;
  }
  return -1;
}

/**
 * Apply a Chess960 castling move (O-O / O-O-O) to a raw board and return the
 * resulting FEN string.  Returns null if the move can't be applied.
 */
function applyChess960Castling(
  fen: string,
  san: string,
): { newFen: string; kingFrom: string; kingTo: string } | null {
  const parsed = parseFen(fen);
  if (!parsed) return null;

  const color = parsed.activeColor; // "w" | "b"
  const rank = color === "w" ? 7 : 0; // board row index
  const kingPiece = color === "w" ? "K" : "k";
  const rookPiece = color === "w" ? "R" : "r";

  const kingFile = findPieceFile(parsed.board, rank, kingPiece);
  if (kingFile < 0) return null;

  const isKingside = san === "O-O";
  const kingToFile = isKingside ? 6 : 2; // g-file or c-file
  const rookToFile = isKingside ? 5 : 3; // f-file or d-file

  // Find the correct rook: for kingside, search right of king; for queenside, left.
  let rookFile = -1;
  if (isKingside) {
    for (let f = 7; f > kingFile; f--) {
      if (parsed.board[rank][f] === rookPiece) {
        rookFile = f;
        break;
      }
    }
  } else {
    for (let f = 0; f < kingFile; f++) {
      if (parsed.board[rank][f] === rookPiece) {
        rookFile = f;
        break;
      }
    }
  }
  if (rookFile < 0) return null;

  // Move pieces: clear old positions, set new.
  parsed.board[rank][kingFile] = null;
  parsed.board[rank][rookFile] = null;
  parsed.board[rank][kingToFile] = kingPiece;
  parsed.board[rank][rookToFile] = rookPiece;

  const nextTurn = color === "w" ? "b" : "w";
  const nextHalf = parsed.halfmove + 1;
  const nextFull = parsed.fullmove + (color === "b" ? 1 : 0);
  const newFen = `${serializeBoard(parsed.board)} ${nextTurn} - - ${nextHalf} ${nextFull}`;

  const kingFrom = coordsToSq(kingFile, rank) || "e1";
  const kingTo = coordsToSq(kingToFile, rank) || "g1";
  return { newFen, kingFrom, kingTo };
}

/* ──────────────────────────────────────────────────────────
   Main parser
   ────────────────────────────────────────────────────────── */

function isChess960Game(game: GameHistory): boolean {
  return isLikelyChess960Game(game);
}

function initChess(game: GameHistory): Chess {
  const normalizedStartingFen = String(game.startingFen || "").trim();
  if (normalizedStartingFen && normalizedStartingFen.toLowerCase() !== "start") {
    try {
      return new Chess(normalizedStartingFen);
    } catch {
      // fall through
    }
  }
  return new Chess();
}

export function usePositionParser(game: GameHistory): PositionData {
  return useMemo(() => {
    const is960 = isChess960Game(game);
    const chess = initChess(game);
    const verboseMoves: Move[] = [];

    /* ---- Helper: try to apply a single SAN move (with 960 castling fallback) ---- */
    const tryApplySan = (
      engine: Chess,
      san: string,
    ): { applied: Move | null; engine: Chess } => {
      // Normal move via chess.js first
      try {
        const res = engine.move(san, { sloppy: true });
        if (res) return { applied: res, engine };
      } catch {
        // fall through
      }

      // Chess960 castling fallback
      if (is960 && (san === "O-O" || san === "O-O-O")) {
        const result = applyChess960Castling(engine.fen(), san);
        if (result) {
          try {
            const nextEngine = new Chess(result.newFen);
            const syntheticMove: Move = {
              color: engine.turn() as "w" | "b",
              from: result.kingFrom as Square,
              to: result.kingTo as Square,
              piece: "k",
              san,
              flags: san === "O-O" ? "k" : "q",
              lan: `${result.kingFrom}${result.kingTo}`,
              before: engine.fen(),
              after: result.newFen,
            };
            return { applied: syntheticMove, engine: nextEngine };
          } catch {
            // fall through
          }
        }
      }

      return { applied: null, engine };
    };

    /* ---- Load from stored moves array ---- */
    if (game.moves && game.moves.length > 0) {
      let eng = initChess(game);
      for (const moveStr of game.moves) {
        const { applied, engine: nextEng } = tryApplySan(eng, moveStr);
        if (applied) {
          verboseMoves.push(applied);
          eng = nextEng;
        } else {
          console.warn("Invalid move:", moveStr);
        }
      }
    }

    /* ---- Fallback: parse PGN (only for standard games) ---- */
    const loadPgn = (pgnText: string) => {
      if (!pgnText || is960) return false;
      try {
        chess.reset();
        const loader =
          (chess as any).load_pgn?.bind(chess) ||
          (chess as any).loadPgn?.bind(chess);
        if (typeof loader !== "function") return false;
        const ok = loader(pgnText, { sloppy: true });
        if (ok === false) return false;
        const hist = chess.history({ verbose: true });
        if (hist.length > 0) {
          verboseMoves.push(...hist);
          return true;
        }
      } catch (e) {
        console.warn("Failed to parse PGN:", e);
      }
      return false;
    };

    const loadMoveText = (moveText: string) => {
      if (!moveText) return false;
      const sanitized = moveText
        .replace(/\{[^}]*\}/g, " ")
        .replace(/\([^)]*\)/g, " ")
        .replace(/\$\d+/g, " ")
        .replace(/\d+\.(\.\.)?/g, " ")
        .replace(/\b1-0\b|\b0-1\b|\b1\/2-1\/2\b|\*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!sanitized) return false;

      let eng = initChess(game);
      for (const token of sanitized.split(" ")) {
        if (!token) continue;
        const { applied, engine: nextEng } = tryApplySan(eng, token);
        if (applied) {
          verboseMoves.push(applied);
          eng = nextEng;
        } else {
          console.warn("Invalid move token:", token);
          return false;
        }
      }
      return verboseMoves.length > 0;
    };

    if (verboseMoves.length === 0 && game.pgn) {
      loadPgn(game.pgn);
    }

    if (verboseMoves.length === 0 && game.moveText) {
      if (!loadPgn(game.moveText)) {
        loadMoveText(game.moveText);
      }
    }

    // If parsing failed, return minimal state to avoid crashes
    if (verboseMoves.length === 0) {
      const startFen =
        is960 && game.startingFen ? game.startingFen : chess.fen();
      return {
        positions: [startFen],
        plies: [],
        moveRows: [],
        totalPlies: 0,
      };
    }

    // Rebuild from start to capture all intermediate FENs and captures
    let replayEngine = initChess(game);
    const fens: string[] = [replayEngine.fen()];
    const plyStates: PlyState[] = [];

    for (const move of verboseMoves) {
      try {
        let applied: Move | null = null;
        let nextEngine: Chess = replayEngine;

        // For synthetic 960 castling moves, use our helper
        if (is960 && (move.san === "O-O" || move.san === "O-O-O")) {
          const result = applyChess960Castling(replayEngine.fen(), move.san);
          if (result) {
            try {
              nextEngine = new Chess(result.newFen);
              applied = {
                ...move,
                from: result.kingFrom as Square,
                to: result.kingTo as Square,
                before: replayEngine.fen(),
                after: result.newFen,
              };
            } catch {
              // fall through
            }
          }
        }

        // Normal move
        if (!applied) {
          const res = replayEngine.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion,
          });
          if (!res) {
            const resSloppy = replayEngine.move(move.san, { sloppy: true });
            if (resSloppy) applied = resSloppy;
          } else {
            applied = res;
          }
          nextEngine = replayEngine;
        }

        if (applied) {
          const capturedPiece = applied.captured
            ? applied.color === "w"
              ? applied.captured.toLowerCase()
              : applied.captured.toUpperCase()
            : undefined;

          const isCheck =
            typeof (nextEngine as any).inCheck === "function"
              ? (nextEngine as any).inCheck()
              : ((nextEngine as any).in_check?.() ?? false);
          const isCheckmate =
            typeof (nextEngine as any).isCheckmate === "function"
              ? (nextEngine as any).isCheckmate()
              : ((nextEngine as any).in_checkmate?.() ?? false);
          const isStalemate =
            typeof (nextEngine as any).isStalemate === "function"
              ? (nextEngine as any).isStalemate()
              : ((nextEngine as any).in_stalemate?.() ?? false);

          plyStates.push({
            fen: nextEngine.fen(),
            moveSAN: applied.san,
            from: applied.from,
            to: applied.to,
            color: applied.color,
            captured: capturedPiece,
            isCheck,
            isCheckmate,
            isStalemate,
          });

          fens.push(nextEngine.fen());
          replayEngine = nextEngine;
        } else {
          console.warn("Failed to apply move", move);
        }
      } catch (e) {
        console.warn("Error applying move:", move, e);
      }
    }

    // Build move rows for the table
    const rows: MoveRow[] = [];
    for (let i = 0; i < verboseMoves.length; i += 2) {
      const whiteMove = verboseMoves[i];
      const blackMove = verboseMoves[i + 1];
      rows.push({
        moveNumber: Math.floor(i / 2) + 1,
        white: whiteMove?.san,
        black: blackMove?.san,
        plyWhite: i + 1,
        plyBlack: blackMove ? i + 2 : undefined,
        timeWhite: game.moveTimes?.[i],
        timeBlack: game.moveTimes?.[i + 1],
      });
    }

    return {
      positions: fens,
      plies: plyStates,
      moveRows: rows,
      totalPlies: verboseMoves.length,
    };
  }, [game]);
}
