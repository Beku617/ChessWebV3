import { Chess } from "chess.js";

const UCI_MOVE_REGEX = /^[a-h][1-8][a-h][1-8][qrbn]?$/i;

function normalizeSan(value = "") {
  return String(value || "")
    .trim()
    .replace(/[+#?!]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function normalizeRawMove(value = "") {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function moveToUci(move) {
  if (!move?.from || !move?.to) return "";
  const promotion = move.promotion ? String(move.promotion).toLowerCase() : "";
  return `${String(move.from).toLowerCase()}${String(move.to).toLowerCase()}${promotion}`;
}

function parseUciMove(uci) {
  const raw = normalizeRawMove(uci);
  if (!UCI_MOVE_REGEX.test(raw)) return null;
  return {
    from: raw.slice(0, 2),
    to: raw.slice(2, 4),
    promotion: raw.length > 4 ? raw[4] : undefined,
  };
}

function parseSubmittedMove(chess, payload = {}) {
  const from = String(payload?.from || "").trim().toLowerCase();
  const to = String(payload?.to || "").trim().toLowerCase();
  const promotion = String(payload?.promotion || "").trim().toLowerCase();
  const rawMove = String(payload?.move || payload?.san || payload?.uci || "")
    .trim();

  if (from && to) {
    const move = chess.move({
      from,
      to,
      promotion: promotion || "q",
    });
    return move || null;
  }

  if (!rawMove) return null;

  const sanMove = chess.move(rawMove, { sloppy: true });
  if (sanMove) return sanMove;

  const uciParsed = parseUciMove(rawMove);
  if (!uciParsed) return null;

  return (
    chess.move({
      from: uciParsed.from,
      to: uciParsed.to,
      promotion: uciParsed.promotion || "q",
    }) || null
  );
}

function parseAcceptedMove(fen, moveValue) {
  const source = String(moveValue || "").trim();
  if (!source) return null;

  const sanChess = new Chess(fen);
  const sanParsed = sanChess.move(source, { sloppy: true });
  if (sanParsed) {
    return {
      raw: normalizeRawMove(source),
      san: normalizeSan(sanParsed.san),
      uci: moveToUci(sanParsed),
    };
  }

  const uci = parseUciMove(source);
  if (!uci) return null;

  const uciChess = new Chess(fen);
  const uciParsed = uciChess.move({
    from: uci.from,
    to: uci.to,
    promotion: uci.promotion || "q",
  });
  if (!uciParsed) return null;

  return {
    raw: normalizeRawMove(source),
    san: normalizeSan(uciParsed.san),
    uci: moveToUci(uciParsed),
  };
}

function isMoveAccepted(submittedMove, acceptedMoves, fen) {
  const submitted = {
    raw: normalizeRawMove(submittedMove.san || submittedMove.lan || ""),
    san: normalizeSan(submittedMove.san),
    uci: moveToUci(submittedMove),
  };

  return acceptedMoves
    .map((candidate) => parseAcceptedMove(fen, candidate))
    .filter(Boolean)
    .some(
      (accepted) =>
        (submitted.uci && submitted.uci === accepted.uci) ||
        (submitted.san && submitted.san === accepted.san) ||
        (submitted.raw && submitted.raw === accepted.raw),
    );
}

function validateLessonMove({ fen, sideToMove, acceptedMoves, payload }) {
  const chess = new Chess(fen);
  const expectedTurn = sideToMove === "black" ? "b" : "w";

  if (chess.turn() !== expectedTurn) {
    return {
      isValid: false,
      isCorrect: false,
      reason: "Position side-to-move mismatch.",
      move: null,
      fenAfterMove: fen,
    };
  }

  const move = parseSubmittedMove(chess, payload);
  if (!move) {
    return {
      isValid: false,
      isCorrect: false,
      reason: "Illegal move for this lesson position.",
      move: null,
      fenAfterMove: fen,
    };
  }

  const isCorrect = isMoveAccepted(move, acceptedMoves, fen);

  return {
    isValid: true,
    isCorrect,
    reason: null,
    move: {
      san: move.san,
      from: move.from,
      to: move.to,
      promotion: move.promotion || "",
      uci: moveToUci(move),
    },
    fenAfterMove: chess.fen(),
  };
}

export { validateLessonMove };
