const FOUR_PLAYER_BOARD_SIZE = 14;
const CORNER_CUT_SIZE = 3;
export const FOUR_PLAYER_COLORS = ["red", "blue", "yellow", "green"];
const BACK_RANK_ORDER = ["r", "n", "b", "q", "k", "b", "n", "r"];

const KNIGHT_OFFSETS = [
  { dr: -2, dc: -1 },
  { dr: -2, dc: 1 },
  { dr: -1, dc: -2 },
  { dr: -1, dc: 2 },
  { dr: 1, dc: -2 },
  { dr: 1, dc: 2 },
  { dr: 2, dc: -1 },
  { dr: 2, dc: 1 },
];

const KING_OFFSETS = [
  { dr: -1, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: -1, dc: 1 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
];

const CASTLING_META = {
  red: {
    axis: "col",
    kingStart: { row: 13, col: 7 },
    rookKStart: { row: 13, col: 10 },
    rookQStart: { row: 13, col: 3 },
  },
  yellow: {
    axis: "col",
    kingStart: { row: 0, col: 7 },
    rookKStart: { row: 0, col: 10 },
    rookQStart: { row: 0, col: 3 },
  },
  blue: {
    axis: "row",
    kingStart: { row: 7, col: 0 },
    rookKStart: { row: 10, col: 0 },
    rookQStart: { row: 3, col: 0 },
  },
  green: {
    axis: "row",
    kingStart: { row: 7, col: 13 },
    rookKStart: { row: 10, col: 13 },
    rookQStart: { row: 3, col: 13 },
  },
};

function inBounds(row, col) {
  return row >= 0 && row < FOUR_PLAYER_BOARD_SIZE && col >= 0 && col < FOUR_PLAYER_BOARD_SIZE;
}

function squareEquals(a, b) {
  return a.row === b.row && a.col === b.col;
}

function shiftSquare(square, axis, delta) {
  return axis === "row"
    ? { row: square.row + delta, col: square.col }
    : { row: square.row, col: square.col + delta };
}

function coordByAxis(square, axis) {
  return axis === "row" ? square.row : square.col;
}

function emptyBoard() {
  return Array.from({ length: FOUR_PLAYER_BOARD_SIZE }, () =>
    Array.from({ length: FOUR_PLAYER_BOARD_SIZE }, () => null),
  );
}

export function isPlayableFourPlayerSquare(row, col) {
  if (!inBounds(row, col)) return false;

  const topLeftCut = row < CORNER_CUT_SIZE && col < CORNER_CUT_SIZE;
  const topRightCut =
    row < CORNER_CUT_SIZE && col >= FOUR_PLAYER_BOARD_SIZE - CORNER_CUT_SIZE;
  const bottomLeftCut =
    row >= FOUR_PLAYER_BOARD_SIZE - CORNER_CUT_SIZE && col < CORNER_CUT_SIZE;
  const bottomRightCut =
    row >= FOUR_PLAYER_BOARD_SIZE - CORNER_CUT_SIZE &&
    col >= FOUR_PLAYER_BOARD_SIZE - CORNER_CUT_SIZE;

  return !(topLeftCut || topRightCut || bottomLeftCut || bottomRightCut);
}

function placePiece(board, row, col, piece) {
  if (!isPlayableFourPlayerSquare(row, col)) return;
  board[row][col] = piece;
}

function setupRed(board) {
  const backRow = 13;
  const pawnRow = 12;
  for (let i = 0; i < BACK_RANK_ORDER.length; i += 1) {
    const col = 3 + i;
    placePiece(board, backRow, col, { color: "red", type: BACK_RANK_ORDER[i] });
    placePiece(board, pawnRow, col, { color: "red", type: "p" });
  }
}

function setupYellow(board) {
  const backRow = 0;
  const pawnRow = 1;
  for (let i = 0; i < BACK_RANK_ORDER.length; i += 1) {
    const col = 3 + i;
    placePiece(board, backRow, col, { color: "yellow", type: BACK_RANK_ORDER[i] });
    placePiece(board, pawnRow, col, { color: "yellow", type: "p" });
  }
}

function setupBlue(board) {
  const backCol = 0;
  const pawnCol = 1;
  for (let i = 0; i < BACK_RANK_ORDER.length; i += 1) {
    const row = 3 + i;
    placePiece(board, row, backCol, { color: "blue", type: BACK_RANK_ORDER[i] });
    placePiece(board, row, pawnCol, { color: "blue", type: "p" });
  }
}

function setupGreen(board) {
  const backCol = 13;
  const pawnCol = 12;
  for (let i = 0; i < BACK_RANK_ORDER.length; i += 1) {
    const row = 3 + i;
    placePiece(board, row, backCol, { color: "green", type: BACK_RANK_ORDER[i] });
    placePiece(board, row, pawnCol, { color: "green", type: "p" });
  }
}

function cloneBoard(board) {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

function createInitialCastlingRights() {
  return {
    red: { k: true, q: true },
    blue: { k: true, q: true },
    yellow: { k: true, q: true },
    green: { k: true, q: true },
  };
}

function cloneCastlingRights(castlingRights) {
  return {
    red: { ...castlingRights.red },
    blue: { ...castlingRights.blue },
    yellow: { ...castlingRights.yellow },
    green: { ...castlingRights.green },
  };
}

export function createInitialFourPlayerState() {
  const board = emptyBoard();
  setupRed(board);
  setupBlue(board);
  setupYellow(board);
  setupGreen(board);

  return {
    board,
    turn: "red",
    winner: null,
    eliminated: [],
    castlingRights: createInitialCastlingRights(),
    enPassant: null,
    moves: [],
  };
}

function isEnemy(piece, color) {
  return !!piece && piece.color !== color;
}

function isFriendly(piece, color) {
  return !!piece && piece.color === color;
}

function isAliveColor(state, color) {
  return !state.eliminated.includes(color);
}

function getForwardData(color) {
  if (color === "red") {
    return {
      dr: -1,
      dc: 0,
      captures: [
        { dr: -1, dc: -1 },
        { dr: -1, dc: 1 },
      ],
      isStart: (row, col) => row === 12 && col >= 3 && col <= 10,
      isPromotion: (row) => row === 0,
    };
  }

  if (color === "yellow") {
    return {
      dr: 1,
      dc: 0,
      captures: [
        { dr: 1, dc: -1 },
        { dr: 1, dc: 1 },
      ],
      isStart: (row, col) => row === 1 && col >= 3 && col <= 10,
      isPromotion: (row) => row === 13,
    };
  }

  if (color === "blue") {
    return {
      dr: 0,
      dc: 1,
      captures: [
        { dr: -1, dc: 1 },
        { dr: 1, dc: 1 },
      ],
      isStart: (row, col) => col === 1 && row >= 3 && row <= 10,
      isPromotion: (_row, col) => col === 13,
    };
  }

  return {
    dr: 0,
    dc: -1,
    captures: [
      { dr: -1, dc: -1 },
      { dr: 1, dc: -1 },
    ],
    isStart: (row, col) => col === 12 && row >= 3 && row <= 10,
    isPromotion: (_row, col) => col === 0,
  };
}

function nextActiveColor(current, eliminated) {
  const eliminatedSet = new Set(eliminated);
  let index = FOUR_PLAYER_COLORS.indexOf(current);

  for (let step = 0; step < FOUR_PLAYER_COLORS.length; step += 1) {
    index = (index + 1) % FOUR_PLAYER_COLORS.length;
    const candidate = FOUR_PLAYER_COLORS[index];
    if (!eliminatedSet.has(candidate)) {
      return candidate;
    }
  }

  return current;
}

function alivePlayers(eliminated) {
  const eliminatedSet = new Set(eliminated);
  return FOUR_PLAYER_COLORS.filter((color) => !eliminatedSet.has(color));
}

function canCaptureTarget(state, target, moverColor) {
  if (!target) return true;
  if (target.color === moverColor) return false;
  if (target.type === "k" && isAliveColor(state, target.color)) {
    return false;
  }
  return true;
}

function findKingSquare(board, color) {
  for (let row = 0; row < FOUR_PLAYER_BOARD_SIZE; row += 1) {
    for (let col = 0; col < FOUR_PLAYER_BOARD_SIZE; col += 1) {
      const piece = board[row][col];
      if (piece && piece.color === color && piece.type === "k") {
        return { row, col };
      }
    }
  }
  return null;
}

function attacksSquareByPiece(board, from, piece, target) {
  if (piece.type === "p") {
    const forward = getForwardData(piece.color);
    return forward.captures.some(({ dr, dc }) => {
      return from.row + dr === target.row && from.col + dc === target.col;
    });
  }

  if (piece.type === "n") {
    return KNIGHT_OFFSETS.some(({ dr, dc }) => {
      return from.row + dr === target.row && from.col + dc === target.col;
    });
  }

  if (piece.type === "k") {
    return KING_OFFSETS.some(({ dr, dc }) => {
      return from.row + dr === target.row && from.col + dc === target.col;
    });
  }

  const lineDirections = [];
  if (piece.type === "b" || piece.type === "q") {
    lineDirections.push(
      { dr: -1, dc: -1 },
      { dr: -1, dc: 1 },
      { dr: 1, dc: -1 },
      { dr: 1, dc: 1 },
    );
  }
  if (piece.type === "r" || piece.type === "q") {
    lineDirections.push(
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    );
  }

  for (const { dr, dc } of lineDirections) {
    let row = from.row + dr;
    let col = from.col + dc;
    while (isPlayableFourPlayerSquare(row, col)) {
      if (row === target.row && col === target.col) {
        return true;
      }
      if (board[row][col]) {
        break;
      }
      row += dr;
      col += dc;
    }
  }

  return false;
}

function isSquareAttacked(state, square, defenderColor) {
  for (let row = 0; row < FOUR_PLAYER_BOARD_SIZE; row += 1) {
    for (let col = 0; col < FOUR_PLAYER_BOARD_SIZE; col += 1) {
      const piece = state.board[row][col];
      if (!piece) continue;
      if (piece.color === defenderColor) continue;
      if (!isAliveColor(state, piece.color)) continue;
      if (attacksSquareByPiece(state.board, { row, col }, piece, square)) {
        return true;
      }
    }
  }
  return false;
}

function isKingInCheck(state, color) {
  if (!isAliveColor(state, color)) return false;
  const kingSquare = findKingSquare(state.board, color);
  if (!kingSquare) return true;
  return isSquareAttacked(state, kingSquare, color);
}

function addSlidingMoves(state, from, color, directions, moves) {
  directions.forEach(({ dr, dc }) => {
    let row = from.row + dr;
    let col = from.col + dc;

    while (isPlayableFourPlayerSquare(row, col)) {
      const target = state.board[row][col];
      if (isFriendly(target, color)) {
        break;
      }

      if (canCaptureTarget(state, target, color)) {
        moves.push({ to: { row, col } });
      }

      if (target) {
        break;
      }

      row += dr;
      col += dc;
    }
  });
}

function getCastlingCandidates(state, color) {
  if (state.winner || !isAliveColor(state, color)) return [];
  const rights = state.castlingRights[color];
  if (!rights.k && !rights.q) return [];

  const meta = CASTLING_META[color];
  const kingPiece = state.board[meta.kingStart.row][meta.kingStart.col];
  if (!kingPiece || kingPiece.type !== "k" || kingPiece.color !== color) {
    return [];
  }

  if (isKingInCheck(state, color)) return [];

  const candidates = [];
  ["k", "q"].forEach((side) => {
    if (!rights[side]) return;

    const rookStart = side === "k" ? meta.rookKStart : meta.rookQStart;
    const rookPiece = state.board[rookStart.row][rookStart.col];
    if (!rookPiece || rookPiece.type !== "r" || rookPiece.color !== color) {
      return;
    }

    const kingCoord = coordByAxis(meta.kingStart, meta.axis);
    const rookCoord = coordByAxis(rookStart, meta.axis);
    const dir = rookCoord > kingCoord ? 1 : -1;
    const kingTo = shiftSquare(meta.kingStart, meta.axis, 2 * dir);

    if (!isPlayableFourPlayerSquare(kingTo.row, kingTo.col)) {
      return;
    }

    for (let coord = kingCoord + dir; coord !== rookCoord; coord += dir) {
      const sq = shiftSquare(meta.kingStart, meta.axis, coord - kingCoord);
      if (state.board[sq.row][sq.col] && !squareEquals(sq, rookStart)) {
        return;
      }
    }

    for (let step = 1; step <= 2; step += 1) {
      const sq = shiftSquare(meta.kingStart, meta.axis, step * dir);
      if (state.board[sq.row][sq.col]) return;
      if (isSquareAttacked(state, sq, color)) return;
    }

    candidates.push({ to: kingTo, castlingSide: side });
  });

  return candidates;
}

function getPseudoLegalMoveCandidates(state, from, piece) {
  const moves = [];

  if (!isAliveColor(state, piece.color)) {
    return moves;
  }

  if (piece.type === "p") {
    const forward = getForwardData(piece.color);
    const oneStepRow = from.row + forward.dr;
    const oneStepCol = from.col + forward.dc;

    if (
      isPlayableFourPlayerSquare(oneStepRow, oneStepCol) &&
      state.board[oneStepRow][oneStepCol] === null
    ) {
      moves.push({ to: { row: oneStepRow, col: oneStepCol } });

      const twoStepRow = oneStepRow + forward.dr;
      const twoStepCol = oneStepCol + forward.dc;
      if (
        forward.isStart(from.row, from.col) &&
        isPlayableFourPlayerSquare(twoStepRow, twoStepCol) &&
        state.board[twoStepRow][twoStepCol] === null
      ) {
        moves.push({ to: { row: twoStepRow, col: twoStepCol } });
      }
    }

    forward.captures.forEach(({ dr, dc }) => {
      const row = from.row + dr;
      const col = from.col + dc;
      if (!isPlayableFourPlayerSquare(row, col)) return;
      const target = state.board[row][col];
      if (isEnemy(target, piece.color) && canCaptureTarget(state, target, piece.color)) {
        moves.push({ to: { row, col } });
      }
    });

    if (
      state.enPassant &&
      state.enPassant.availableFor === piece.color &&
      state.enPassant.color !== piece.color
    ) {
      forward.captures.forEach(({ dr, dc }) => {
        const row = from.row + dr;
        const col = from.col + dc;
        if (
          row === state.enPassant.target.row &&
          col === state.enPassant.target.col &&
          state.board[row][col] === null
        ) {
          moves.push({
            to: { row, col },
            enPassant: true,
          });
        }
      });
    }

    return moves;
  }

  if (piece.type === "n") {
    KNIGHT_OFFSETS.forEach(({ dr, dc }) => {
      const row = from.row + dr;
      const col = from.col + dc;
      if (!isPlayableFourPlayerSquare(row, col)) return;
      const target = state.board[row][col];
      if (!isFriendly(target, piece.color) && canCaptureTarget(state, target, piece.color)) {
        moves.push({ to: { row, col } });
      }
    });
    return moves;
  }

  if (piece.type === "k") {
    KING_OFFSETS.forEach(({ dr, dc }) => {
      const row = from.row + dr;
      const col = from.col + dc;
      if (!isPlayableFourPlayerSquare(row, col)) return;
      const target = state.board[row][col];
      if (!isFriendly(target, piece.color) && canCaptureTarget(state, target, piece.color)) {
        moves.push({ to: { row, col } });
      }
    });

    return [...moves, ...getCastlingCandidates(state, piece.color)];
  }

  if (piece.type === "b" || piece.type === "q") {
    addSlidingMoves(
      state,
      from,
      piece.color,
      [
        { dr: -1, dc: -1 },
        { dr: -1, dc: 1 },
        { dr: 1, dc: -1 },
        { dr: 1, dc: 1 },
      ],
      moves,
    );
  }

  if (piece.type === "r" || piece.type === "q") {
    addSlidingMoves(
      state,
      from,
      piece.color,
      [
        { dr: -1, dc: 0 },
        { dr: 1, dc: 0 },
        { dr: 0, dc: -1 },
        { dr: 0, dc: 1 },
      ],
      moves,
    );
  }

  return moves;
}

function updateCastlingRightsForMove(castlingRights, mover, from, captureSquare, captured) {
  if (mover.type === "k") {
    castlingRights[mover.color].k = false;
    castlingRights[mover.color].q = false;
  }

  if (mover.type === "r") {
    const moverMeta = CASTLING_META[mover.color];
    if (squareEquals(from, moverMeta.rookKStart)) castlingRights[mover.color].k = false;
    if (squareEquals(from, moverMeta.rookQStart)) castlingRights[mover.color].q = false;
  }

  if (captured?.type === "r" && captureSquare) {
    const capturedMeta = CASTLING_META[captured.color];
    if (squareEquals(captureSquare, capturedMeta.rookKStart)) {
      castlingRights[captured.color].k = false;
    }
    if (squareEquals(captureSquare, capturedMeta.rookQStart)) {
      castlingRights[captured.color].q = false;
    }
  }
}

function applyMoveCandidate(state, from, candidate, mover) {
  const board = cloneBoard(state.board);
  const castlingRights = cloneCastlingRights(state.castlingRights);
  let enPassant = null;
  let captureSquare = null;

  board[from.row][from.col] = null;

  let captured = null;
  let promoted;

  if (candidate.castlingSide) {
    const meta = CASTLING_META[mover.color];
    const rookStart =
      candidate.castlingSide === "k" ? meta.rookKStart : meta.rookQStart;
    const rookStartPiece = board[rookStart.row][rookStart.col];
    board[rookStart.row][rookStart.col] = null;
    board[candidate.to.row][candidate.to.col] = { ...mover };

    const kingCoord = coordByAxis(meta.kingStart, meta.axis);
    const rookCoord = coordByAxis(rookStart, meta.axis);
    const dir = rookCoord > kingCoord ? 1 : -1;
    const rookTo = shiftSquare(meta.kingStart, meta.axis, dir);
    if (rookStartPiece) {
      board[rookTo.row][rookTo.col] = { ...rookStartPiece };
    }
    castlingRights[mover.color].k = false;
    castlingRights[mover.color].q = false;
  } else {
    captureSquare = { ...candidate.to };
    if (candidate.enPassant && state.enPassant) {
      captureSquare = { ...state.enPassant.pawn };
      captured = board[captureSquare.row][captureSquare.col];
      board[captureSquare.row][captureSquare.col] = null;
    } else {
      captured = board[candidate.to.row][candidate.to.col];
    }

    if (mover.type === "p") {
      const forward = getForwardData(mover.color);
      if (forward.isPromotion(candidate.to.row, candidate.to.col)) {
        promoted = "q";
        board[candidate.to.row][candidate.to.col] = {
          color: mover.color,
          type: "q",
        };
      } else {
        board[candidate.to.row][candidate.to.col] = { ...mover };
      }

      const isDoubleStep =
        candidate.to.row === from.row + forward.dr * 2 &&
        candidate.to.col === from.col + forward.dc * 2;
      if (isDoubleStep) {
        enPassant = {
          target: { row: from.row + forward.dr, col: from.col + forward.dc },
          pawn: { ...candidate.to },
          color: mover.color,
          availableFor: nextActiveColor(mover.color, state.eliminated),
        };
      }
    } else {
      board[candidate.to.row][candidate.to.col] = { ...mover };
    }

    updateCastlingRightsForMove(
      castlingRights,
      mover,
      from,
      captureSquare,
      captured,
    );
  }

  return {
    board,
    castlingRights,
    enPassant,
    captured,
    promoted,
  };
}

function getLegalMoveCandidates(state, from, piece) {
  const pseudo = getPseudoLegalMoveCandidates(state, from, piece);
  const legal = [];

  for (const candidate of pseudo) {
    const applied = applyMoveCandidate(state, from, candidate, piece);
    const simulated = {
      ...state,
      board: applied.board,
      castlingRights: applied.castlingRights,
      enPassant: applied.enPassant,
    };
    if (!isKingInCheck(simulated, piece.color)) {
      legal.push(candidate);
    }
  }

  return legal;
}

function hasAnyLegalMove(state, color) {
  if (!isAliveColor(state, color)) return false;
  const asTurn = { ...state, turn: color };

  for (let row = 0; row < FOUR_PLAYER_BOARD_SIZE; row += 1) {
    for (let col = 0; col < FOUR_PLAYER_BOARD_SIZE; col += 1) {
      const piece = asTurn.board[row][col];
      if (!piece || piece.color !== color) continue;
      const candidates = getLegalMoveCandidates(asTurn, { row, col }, piece);
      if (candidates.length > 0) return true;
    }
  }

  return false;
}

function eliminateColorKeepPieces(state, color) {
  if (state.eliminated.includes(color)) return state;
  const eliminated = [...state.eliminated, color];
  const survivors = alivePlayers(eliminated);
  const winner = survivors.length === 1 ? survivors[0] : null;

  const castlingRights = cloneCastlingRights(state.castlingRights);
  castlingRights[color].k = false;
  castlingRights[color].q = false;

  let enPassant = state.enPassant;
  if (enPassant && (enPassant.color === color || enPassant.availableFor === color)) {
    enPassant = null;
  }

  const nextTurn = winner
    ? winner
    : state.turn === color
      ? nextActiveColor(color, eliminated)
      : state.turn;

  return {
    ...state,
    eliminated,
    winner,
    castlingRights,
    enPassant,
    turn: nextTurn,
  };
}

function resolveTurnEliminations(state) {
  let nextState = state;
  let nextTurn = nextActiveColor(state.turn, state.eliminated);
  const eliminatedNow = [];

  for (let i = 0; i < FOUR_PLAYER_COLORS.length; i += 1) {
    if (nextState.winner) break;
    if (nextState.eliminated.includes(nextTurn)) {
      nextTurn = nextActiveColor(nextTurn, nextState.eliminated);
      continue;
    }

    if (hasAnyLegalMove(nextState, nextTurn)) {
      nextState = {
        ...nextState,
        turn: nextTurn,
      };
      break;
    }

    nextState = eliminateColorKeepPieces(nextState, nextTurn);
    eliminatedNow.push(nextTurn);
    if (nextState.winner) break;
    nextTurn = nextActiveColor(nextTurn, nextState.eliminated);
  }

  return { state: nextState, eliminatedNow };
}

export function applyFourPlayerMove(state, from, to, moverColor) {
  if (!state || state.winner) {
    return { ok: false, reason: "Game is over." };
  }

  if (
    !from ||
    !to ||
    !isPlayableFourPlayerSquare(from.row, from.col) ||
    !isPlayableFourPlayerSquare(to.row, to.col)
  ) {
    return { ok: false, reason: "Invalid square." };
  }
  if (!isAliveColor(state, moverColor)) {
    return { ok: false, reason: "Eliminated players cannot move." };
  }

  const piece = state.board[from.row]?.[from.col];
  if (!piece) return { ok: false, reason: "No piece on source square." };
  if (piece.color !== moverColor) return { ok: false, reason: "Not your piece." };
  if (state.turn !== moverColor) return { ok: false, reason: "Not your turn." };

  const legalCandidates = getLegalMoveCandidates(state, from, piece);
  const candidate = legalCandidates.find((move) => squareEquals(move.to, to));
  if (!candidate) {
    return { ok: false, reason: "Illegal move." };
  }

  const applied = applyMoveCandidate(state, from, candidate, piece);
  const partialState = {
    ...state,
    board: applied.board,
    castlingRights: applied.castlingRights,
    enPassant: applied.enPassant,
  };

  const resolved = resolveTurnEliminations(partialState);
  const eliminatedColor = resolved.eliminatedNow[0] || null;

  const move = {
    from,
    to: candidate.to,
    piece,
    captured: applied.captured || null,
    promoted: applied.promoted,
    castlingSide: candidate.castlingSide,
    enPassant: candidate.enPassant,
    eliminated: eliminatedColor,
  };

  return {
    ok: true,
    state: {
      ...resolved.state,
      moves: [...state.moves, move],
    },
    move,
  };
}

export function eliminateFourPlayerColor(state, color) {
  if (!state || state.winner) return state;
  if (!FOUR_PLAYER_COLORS.includes(color)) return state;
  return eliminateColorKeepPieces(state, color);
}
