const DEFAULT_INITIAL_MS = 300_000;
const DEFAULT_INCREMENT_MS = 0;

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNonNegativeInteger(value, fallback = 0) {
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed < 0) return Math.max(0, Math.round(fallback));
  return Math.max(0, Math.round(parsed));
}

function toMsFromUnknown(value, fallbackMs = 0, fallbackSeconds = null) {
  if (value !== undefined && value !== null && value !== "") {
    return toNonNegativeInteger(value, fallbackMs);
  }
  if (fallbackSeconds !== null) {
    return toNonNegativeInteger(fallbackSeconds * 1000, fallbackMs);
  }
  return toNonNegativeInteger(fallbackMs, 0);
}

function parsePlusNotation(input) {
  if (typeof input !== "string") return null;
  const match = input.trim().match(/^(\d+)\s*\+\s*(\d+)$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const incrementSeconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(incrementSeconds)) {
    return null;
  }
  return {
    initialMs: Math.max(0, Math.round(minutes * 60_000)),
    incrementMs: Math.max(0, Math.round(incrementSeconds * 1_000)),
    kind: incrementSeconds > 0 ? "fischer" : "sudden_death",
  };
}

function normalizeDelayType(raw, fallback = "none") {
  const normalized = String(raw || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "simple" ||
    normalized === "delay" ||
    normalized === "simple_delay"
  ) {
    return "simple";
  }
  if (
    normalized === "bronstein" ||
    normalized === "bronstein_delay" ||
    normalized === "bronstein-delay"
  ) {
    return "bronstein";
  }
  if (fallback === "simple" || fallback === "bronstein") {
    return fallback;
  }
  return "none";
}

function normalizeKind(rawKind, hasStages, incrementMs, delayMs, delayType) {
  const normalized = String(rawKind || "")
    .trim()
    .toLowerCase();

  if (hasStages) return "staged";
  if (
    normalized === "staged" ||
    normalized === "classical" ||
    normalized === "stage" ||
    normalized === "multi_stage"
  ) {
    return "staged";
  }
  if (
    normalized === "delay" ||
    normalized === "simple" ||
    normalized === "simple_delay"
  ) {
    return "delay";
  }
  if (
    normalized === "bronstein" ||
    normalized === "bronstein_delay" ||
    normalized === "bronstein-delay"
  ) {
    return "bronstein";
  }
  if (
    normalized === "fischer" ||
    normalized === "increment" ||
    normalized === "fischer_increment" ||
    normalized === "fischer-increment"
  ) {
    return "fischer";
  }
  if (
    normalized === "sudden_death" ||
    normalized === "sudden" ||
    normalized === "none" ||
    normalized === "no_increment"
  ) {
    return "sudden_death";
  }

  if (delayMs > 0) {
    return delayType === "bronstein" ? "bronstein" : "delay";
  }
  if (incrementMs > 0) {
    return "fischer";
  }
  return "sudden_death";
}

function normalizeStageInput(stageInput, fallback, index) {
  const raw = stageInput && typeof stageInput === "object" ? stageInput : {};
  const startsOnMoveNumber = Math.max(
    1,
    toNonNegativeInteger(
      raw.startsOnMoveNumber ??
        raw.startMove ??
        raw.fromMove ??
        raw.moveNumber ??
        raw.startsOnFullMove,
      fallback.startsOnMoveNumber + index,
    ),
  );

  const hasIncrement =
    hasOwn(raw, "incrementMs") || hasOwn(raw, "increment") || hasOwn(raw, "incMs");
  const hasDelay = hasOwn(raw, "delayMs") || hasOwn(raw, "delay") || hasOwn(raw, "delaySeconds");
  const incrementMs = hasIncrement
    ? toMsFromUnknown(raw.incrementMs ?? raw.incMs, 0, raw.increment)
    : fallback.incrementMs;
  const delayMs = hasDelay
    ? toMsFromUnknown(raw.delayMs, 0, raw.delay ?? raw.delaySeconds)
    : fallback.delayMs;
  const delayType = normalizeDelayType(raw.delayType ?? raw.kind, fallback.delayType);

  const extraBankMs = toMsFromUnknown(
    raw.extraBankMs ?? raw.extraTimeMs ?? raw.bonusMs,
    0,
    raw.extraBank ?? raw.extraTime ?? raw.bonus,
  );

  return {
    startsOnMoveNumber,
    extraBankMs,
    incrementMs,
    delayMs,
    delayType,
  };
}

function normalizeStagedTimeControl(raw, fallbackInitialMs, fallbackIncrementMs, fallbackDelayMs, fallbackDelayType) {
  const rawStages = Array.isArray(raw?.stages) ? raw.stages : [];

  const stageZero = {
    startsOnMoveNumber: 1,
    extraBankMs: 0,
    incrementMs: fallbackIncrementMs,
    delayMs: fallbackDelayMs,
    delayType: fallbackDelayType,
  };

  const normalizedStages = rawStages
    .map((stage, index) => normalizeStageInput(stage, stageZero, index))
    .filter((stage) => Number.isFinite(stage.startsOnMoveNumber))
    .sort((a, b) => a.startsOnMoveNumber - b.startsOnMoveNumber);

  if (normalizedStages.length === 0 || normalizedStages[0].startsOnMoveNumber !== 1) {
    normalizedStages.unshift(stageZero);
  }

  const deduped = [];
  for (const stage of normalizedStages) {
    if (deduped.length === 0) {
      deduped.push(stage);
      continue;
    }
    const last = deduped[deduped.length - 1];
    if (stage.startsOnMoveNumber === last.startsOnMoveNumber) {
      deduped[deduped.length - 1] = {
        ...last,
        ...stage,
      };
    } else {
      deduped.push(stage);
    }
  }

  const carried = [];
  let previous = { ...stageZero };
  for (const stage of deduped) {
    const normalizedStage = {
      startsOnMoveNumber: stage.startsOnMoveNumber,
      extraBankMs: Math.max(0, toNonNegativeInteger(stage.extraBankMs, 0)),
      incrementMs: Math.max(0, toNonNegativeInteger(stage.incrementMs, previous.incrementMs)),
      delayMs: Math.max(0, toNonNegativeInteger(stage.delayMs, previous.delayMs)),
      delayType: normalizeDelayType(stage.delayType, previous.delayType),
    };
    carried.push(normalizedStage);
    previous = normalizedStage;
  }

  const firstStage = carried[0];

  return {
    kind: "staged",
    initialMs: Math.max(0, toNonNegativeInteger(fallbackInitialMs, DEFAULT_INITIAL_MS)),
    incrementMs: firstStage.incrementMs,
    delayMs: firstStage.delayMs,
    delayType: firstStage.delayType,
    stages: carried,
  };
}

function toSerializableStage(stage) {
  return {
    startsOnMoveNumber: stage.startsOnMoveNumber,
    extraBankMs: stage.extraBankMs,
    incrementMs: stage.incrementMs,
    delayMs: stage.delayMs,
    delayType: stage.delayType,
    extraBank: Math.round(stage.extraBankMs / 1000),
    increment: Math.round(stage.incrementMs / 1000),
    delay: Math.round(stage.delayMs / 1000),
  };
}

export function normalizeTimeControl(input) {
  const plusNotation = parsePlusNotation(input);
  const raw =
    plusNotation !== null
      ? {
          kind: plusNotation.kind,
          initialMs: plusNotation.initialMs,
          incrementMs: plusNotation.incrementMs,
        }
      : input && typeof input === "object"
        ? input
        : {};

  const initialMs = toMsFromUnknown(
    raw.initialMs ?? raw.baseMs ?? raw.startingTimeMs,
    DEFAULT_INITIAL_MS,
    raw.initial,
  );
  const incrementMs = toMsFromUnknown(
    raw.incrementMs ?? raw.incMs,
    DEFAULT_INCREMENT_MS,
    raw.increment,
  );
  const delayMs = toMsFromUnknown(
    raw.delayMs,
    0,
    raw.delay,
  );
  const delayType = normalizeDelayType(raw.delayType ?? raw.kind, "simple");
  const hasStages = Array.isArray(raw.stages) && raw.stages.length > 0;

  const normalizedKind = normalizeKind(
    raw.kind ?? raw.type ?? raw.mode,
    hasStages,
    incrementMs,
    delayMs,
    delayType,
  );

  if (normalizedKind === "staged") {
    const staged = normalizeStagedTimeControl(
      raw,
      initialMs,
      incrementMs,
      delayMs,
      delayType,
    );
    const serializableStages = staged.stages.map(toSerializableStage);
    return {
      kind: staged.kind,
      label:
        typeof raw.label === "string" && raw.label.trim()
          ? raw.label.trim()
          : undefined,
      initialMs: staged.initialMs,
      incrementMs: staged.incrementMs,
      delayMs: staged.delayMs,
      delayType: staged.delayType,
      stages: serializableStages,
      initial: Math.round(staged.initialMs / 1000),
      increment: Math.round(staged.incrementMs / 1000),
      delay: Math.round(staged.delayMs / 1000),
    };
  }

  const resolvedDelayMs =
    normalizedKind === "delay" || normalizedKind === "bronstein" ? delayMs : 0;
  const resolvedIncrementMs = normalizedKind === "fischer" ? incrementMs : 0;
  const resolvedDelayType =
    normalizedKind === "bronstein"
      ? "bronstein"
      : normalizedKind === "delay"
        ? "simple"
        : "none";

  return {
    kind: normalizedKind,
    label:
      typeof raw.label === "string" && raw.label.trim()
        ? raw.label.trim()
        : undefined,
    initialMs,
    incrementMs: resolvedIncrementMs,
    delayMs: resolvedDelayMs,
    delayType: resolvedDelayType,
    initial: Math.round(initialMs / 1000),
    increment: Math.round(resolvedIncrementMs / 1000),
    delay: Math.round(resolvedDelayMs / 1000),
  };
}

export function resolveFullMoveNumberFromPlies(plies) {
  const safePlies = Math.max(0, Math.floor(Number(plies) || 0));
  return Math.floor(safePlies / 2) + 1;
}

function buildStageFromBase(control) {
  return {
    startsOnMoveNumber: 1,
    extraBankMs: 0,
    incrementMs: Math.max(0, toNonNegativeInteger(control?.incrementMs, 0)),
    delayMs: Math.max(0, toNonNegativeInteger(control?.delayMs, 0)),
    delayType: normalizeDelayType(control?.delayType, "none"),
  };
}

export function getStageForMoveNumber(controlInput, moveNumber) {
  const control = normalizeTimeControl(controlInput);
  const safeMoveNumber = Math.max(1, Math.floor(Number(moveNumber) || 1));

  if (control.kind !== "staged") {
    return buildStageFromBase(control);
  }

  const stages = Array.isArray(control.stages) ? control.stages : [];
  let active = stages[0] || buildStageFromBase(control);
  for (const stage of stages) {
    if (safeMoveNumber >= Number(stage.startsOnMoveNumber || 1)) {
      active = stage;
      continue;
    }
    break;
  }

  return {
    startsOnMoveNumber: Math.max(1, toNonNegativeInteger(active.startsOnMoveNumber, 1)),
    extraBankMs: Math.max(0, toNonNegativeInteger(active.extraBankMs, 0)),
    incrementMs: Math.max(0, toNonNegativeInteger(active.incrementMs, 0)),
    delayMs: Math.max(0, toNonNegativeInteger(active.delayMs, 0)),
    delayType: normalizeDelayType(active.delayType, "none"),
  };
}

export function getStageTransitionBonusMs(controlInput, fromMoveNumber, toMoveNumber) {
  const control = normalizeTimeControl(controlInput);
  if (control.kind !== "staged") return 0;

  const fromMove = Math.max(1, Math.floor(Number(fromMoveNumber) || 1));
  const toMove = Math.max(fromMove, Math.floor(Number(toMoveNumber) || fromMove));

  let bonusMs = 0;
  const stages = Array.isArray(control.stages) ? control.stages : [];
  for (const stage of stages) {
    const startsOn = Math.max(1, Math.floor(Number(stage.startsOnMoveNumber) || 1));
    if (startsOn > fromMove && startsOn <= toMove) {
      bonusMs += Math.max(0, toNonNegativeInteger(stage.extraBankMs, 0));
    }
  }
  return bonusMs;
}

function computeEffectiveElapsedMsWithStage(stage, elapsedMs) {
  const safeElapsedMs = Math.max(0, toNonNegativeInteger(elapsedMs, 0));
  const delayMs = Math.max(0, toNonNegativeInteger(stage?.delayMs, 0));
  const delayType = normalizeDelayType(stage?.delayType, "none");

  if (delayType === "simple" || delayType === "bronstein") {
    return Math.max(0, safeElapsedMs - delayMs);
  }
  return safeElapsedMs;
}

export function computeEffectiveElapsedMs(controlInput, moveCount, elapsedMs) {
  const fullMoveNumber = resolveFullMoveNumberFromPlies(moveCount);
  const stage = getStageForMoveNumber(controlInput, fullMoveNumber);
  return computeEffectiveElapsedMsWithStage(stage, elapsedMs);
}

function inferMoveCount(game) {
  const explicitMoveCount = Number(game?.moveCount);
  if (Number.isFinite(explicitMoveCount) && explicitMoveCount >= 0) {
    return Math.floor(explicitMoveCount);
  }

  if (Array.isArray(game?.persistedMoves)) {
    return game.persistedMoves.length;
  }

  if (game?.chess && typeof game.chess.history === "function") {
    const history = game.chess.history();
    if (Array.isArray(history)) {
      return history.length;
    }
  }

  return 0;
}

function resolveActiveColor(game, existingState) {
  if (existingState?.activeColor === "b" || existingState?.activeColor === "w") {
    return existingState.activeColor;
  }
  const chessTurn = game?.chess?.turn?.();
  return chessTurn === "b" ? "b" : "w";
}

function resolveTurnStartedAtMs(game, existingState, nowMs) {
  const rawCandidate =
    existingState?.turnStartedAtMs ??
    existingState?.turnStartedAt ??
    existingState?.asOf ??
    game?.turnStartedAtMs ??
    game?.turnStartedAt;

  const parsed = toFiniteNumber(rawCandidate);
  if (parsed !== null && parsed > 0) {
    return Math.floor(parsed);
  }

  if (rawCandidate) {
    const dateParsed = new Date(rawCandidate).getTime();
    if (Number.isFinite(dateParsed) && dateParsed > 0) {
      return Math.floor(dateParsed);
    }
  }

  return Math.floor(nowMs);
}

export function createInitialClockState(controlInput, nowMs = Date.now(), options = {}) {
  const control = normalizeTimeControl(controlInput);
  const activeColor = options.activeColor === "b" ? "b" : "w";
  const moveCount = Math.max(0, Math.floor(Number(options.moveCount) || 0));
  return {
    whiteBankMs: control.initialMs,
    blackBankMs: control.initialMs,
    activeColor,
    turnStartedAtMs: Math.floor(nowMs),
    lastUpdatedAtMs: Math.floor(nowMs),
    moveCount,
    running: options.running !== false,
  };
}

export function ensureClockState(game, nowMs = Date.now()) {
  if (!game || typeof game !== "object") {
    return createInitialClockState(null, nowMs);
  }

  const normalizedTimeControl = normalizeTimeControl(game.timeControl);
  game.timeControl = normalizedTimeControl;

  const existingState =
    game.clockState && typeof game.clockState === "object" ? game.clockState : {};

  const whiteBankMs =
    hasOwn(existingState, "whiteBankMs")
      ? toNonNegativeInteger(existingState.whiteBankMs, normalizedTimeControl.initialMs)
      : hasOwn(existingState, "white")
        ? toNonNegativeInteger(Number(existingState.white) * 1000, normalizedTimeControl.initialMs)
        : normalizedTimeControl.initialMs;

  const blackBankMs =
    hasOwn(existingState, "blackBankMs")
      ? toNonNegativeInteger(existingState.blackBankMs, normalizedTimeControl.initialMs)
      : hasOwn(existingState, "black")
        ? toNonNegativeInteger(Number(existingState.black) * 1000, normalizedTimeControl.initialMs)
        : normalizedTimeControl.initialMs;

  const moveCount = Math.max(
    0,
    Math.floor(
      toFiniteNumber(existingState.moveCount) ?? inferMoveCount(game),
    ),
  );

  const state = {
    whiteBankMs,
    blackBankMs,
    activeColor: resolveActiveColor(game, existingState),
    turnStartedAtMs: resolveTurnStartedAtMs(game, existingState, nowMs),
    lastUpdatedAtMs: Math.floor(nowMs),
    moveCount,
    running:
      existingState.running === false || game.isEnding || game.gameOver
        ? false
        : true,
  };

  game.clockState = state;
  game.moveCount = moveCount;
  game.turnStartedAtMs = state.turnStartedAtMs;
  return state;
}

function roundSecondsFromMs(ms) {
  return Math.round((Math.max(0, ms) / 1000) * 100) / 100;
}

export function materializeClock(game, nowMs = Date.now()) {
  const state = ensureClockState(game, nowMs);
  const control = normalizeTimeControl(game?.timeControl);

  let whiteMs = Math.max(0, toNonNegativeInteger(state.whiteBankMs, 0));
  let blackMs = Math.max(0, toNonNegativeInteger(state.blackBankMs, 0));
  const activeColor = state.activeColor === "b" ? "b" : "w";
  const elapsedMs = Math.max(0, Math.floor(nowMs) - Math.floor(state.turnStartedAtMs || nowMs));

  if (state.running !== false) {
    const effectiveElapsedMs = computeEffectiveElapsedMs(
      control,
      state.moveCount,
      elapsedMs,
    );

    if (activeColor === "w") {
      whiteMs = Math.max(0, whiteMs - effectiveElapsedMs);
    } else {
      blackMs = Math.max(0, blackMs - effectiveElapsedMs);
    }

    return {
      whiteMs,
      blackMs,
      white: roundSecondsFromMs(whiteMs),
      black: roundSecondsFromMs(blackMs),
      activeColor,
      moveCount: state.moveCount,
      turnStartedAtMs: state.turnStartedAtMs,
      asOf: Math.floor(nowMs),
      running: true,
      elapsedMs,
      effectiveElapsedMs,
    };
  }

  return {
    whiteMs,
    blackMs,
    white: roundSecondsFromMs(whiteMs),
    black: roundSecondsFromMs(blackMs),
    activeColor,
    moveCount: state.moveCount,
    turnStartedAtMs: state.turnStartedAtMs,
    asOf: Math.floor(nowMs),
    running: false,
    elapsedMs,
    effectiveElapsedMs: 0,
  };
}

export function commitClockSnapshot(game, snapshot, nextActiveColor, nowMs = Date.now(), options = {}) {
  const state = ensureClockState(game, nowMs);
  const whiteMs =
    snapshot && hasOwn(snapshot, "whiteMs")
      ? toNonNegativeInteger(snapshot.whiteMs, state.whiteBankMs)
      : toNonNegativeInteger(Number(snapshot?.white || 0) * 1000, state.whiteBankMs);
  const blackMs =
    snapshot && hasOwn(snapshot, "blackMs")
      ? toNonNegativeInteger(snapshot.blackMs, state.blackBankMs)
      : toNonNegativeInteger(Number(snapshot?.black || 0) * 1000, state.blackBankMs);

  const moveCount =
    options.moveCount !== undefined
      ? Math.max(0, Math.floor(Number(options.moveCount) || 0))
      : Math.max(0, Math.floor(Number(state.moveCount) || 0));

  game.clockState = {
    whiteBankMs: whiteMs,
    blackBankMs: blackMs,
    activeColor: nextActiveColor === "b" ? "b" : "w",
    turnStartedAtMs: Math.floor(nowMs),
    lastUpdatedAtMs: Math.floor(nowMs),
    moveCount,
    running: options.running !== false,
  };

  game.turnStartedAtMs = game.clockState.turnStartedAtMs;
  game.moveCount = moveCount;
  return game.clockState;
}

export function applyMoveClockTransition(game, moverColor, nextTurnColor, nowMs = Date.now()) {
  const normalizedMoverColor = moverColor === "b" ? "b" : "w";
  const normalizedNextTurnColor = nextTurnColor === "b" ? "b" : "w";
  const control = normalizeTimeControl(game?.timeControl);

  const before = materializeClock(game, nowMs);
  const moveCountBefore = Math.max(0, Math.floor(Number(before.moveCount) || 0));
  let whiteMs = Math.max(0, toNonNegativeInteger(before.whiteMs, 0));
  let blackMs = Math.max(0, toNonNegativeInteger(before.blackMs, 0));

  const moverFullMove = resolveFullMoveNumberFromPlies(moveCountBefore);
  const moverStage = getStageForMoveNumber(control, moverFullMove);
  const moverIncrementMs = Math.max(0, toNonNegativeInteger(moverStage.incrementMs, 0));

  if (normalizedMoverColor === "w") {
    whiteMs += moverIncrementMs;
  } else {
    blackMs += moverIncrementMs;
  }

  const moveCountAfter = moveCountBefore + 1;
  const nextTurnMoveBefore = resolveFullMoveNumberFromPlies(moveCountBefore);
  const nextTurnMoveAfter = resolveFullMoveNumberFromPlies(moveCountAfter);
  const stageBonusMs = getStageTransitionBonusMs(
    control,
    nextTurnMoveBefore,
    nextTurnMoveAfter,
  );

  if (stageBonusMs > 0) {
    whiteMs += stageBonusMs;
    blackMs += stageBonusMs;
  }

  commitClockSnapshot(
    game,
    { whiteMs, blackMs },
    normalizedNextTurnColor,
    nowMs,
    { moveCount: moveCountAfter, running: true },
  );

  return materializeClock(game, nowMs);
}

export function freezeGameClock(game, nowMs = Date.now()) {
  const snapshot = materializeClock(game, nowMs);
  commitClockSnapshot(game, snapshot, snapshot.activeColor, nowMs, {
    moveCount: snapshot.moveCount,
    running: false,
  });
  return materializeClock(game, nowMs);
}

export function getTurnTimeoutDelayMs(game, nowMs = Date.now()) {
  const state = ensureClockState(game, nowMs);
  if (state.running === false) return 0;

  const control = normalizeTimeControl(game?.timeControl);
  const stage = getStageForMoveNumber(
    control,
    resolveFullMoveNumberFromPlies(state.moveCount),
  );
  const elapsedMs = Math.max(0, Math.floor(nowMs) - Math.floor(state.turnStartedAtMs || nowMs));
  const effectiveElapsedMs = computeEffectiveElapsedMsWithStage(stage, elapsedMs);
  const delayMs = Math.max(0, toNonNegativeInteger(stage.delayMs, 0));

  const activeBankMs =
    state.activeColor === "w"
      ? Math.max(0, toNonNegativeInteger(state.whiteBankMs, 0))
      : Math.max(0, toNonNegativeInteger(state.blackBankMs, 0));

  const remainingMs = Math.max(0, activeBankMs - effectiveElapsedMs);
  if (remainingMs <= 0) return 0;

  const delayRemainingMs = Math.max(0, delayMs - elapsedMs);
  return remainingMs + delayRemainingMs;
}

export function estimateTimeControlSeconds(controlInput) {
  const control = normalizeTimeControl(controlInput);
  if (control.kind !== "staged") {
    return Math.max(0, Math.round((control.initialMs + control.incrementMs * 40) / 1000));
  }

  let estimatedMs = Math.max(0, toNonNegativeInteger(control.initialMs, 0));
  for (let moveNumber = 1; moveNumber <= 40; moveNumber += 1) {
    const stage = getStageForMoveNumber(control, moveNumber);
    estimatedMs += Math.max(0, toNonNegativeInteger(stage.incrementMs, 0));
    const transitionBonus = getStageTransitionBonusMs(control, moveNumber, moveNumber + 1);
    estimatedMs += transitionBonus;
  }

  return Math.max(0, Math.round(estimatedMs / 1000));
}
