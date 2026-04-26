import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeTimeControl,
  createInitialClockState,
  materializeClock,
  applyMoveClockTransition,
  getTurnTimeoutDelayMs,
  ensureClockState,
  freezeGameClock,
} from "./gameClock.js";

function createGame({
  timeControl,
  clockState,
  moveCount = 0,
  activeColor = "w",
} = {}) {
  return {
    timeControl,
    moveCount,
    clockState:
      clockState ||
      createInitialClockState(timeControl, 1_000, {
        activeColor,
        moveCount,
      }),
    chess: {
      turn() {
        return activeColor;
      },
      history() {
        return Array.from({ length: moveCount }, () => "e4");
      },
    },
  };
}

test("normalizes plus notation to fischer format", () => {
  const control = normalizeTimeControl("3+2");
  assert.equal(control.kind, "fischer");
  assert.equal(control.initialMs, 180_000);
  assert.equal(control.incrementMs, 2_000);
  assert.equal(control.initial, 180);
  assert.equal(control.increment, 2);
});

test("materializes sudden death clocks using turn start timestamp", () => {
  const game = createGame({
    timeControl: { kind: "sudden_death", initial: 60 },
    clockState: {
      whiteBankMs: 60_000,
      blackBankMs: 60_000,
      activeColor: "w",
      turnStartedAtMs: 5_000,
      moveCount: 0,
      running: true,
    },
  });

  const clock = materializeClock(game, 8_000);
  assert.equal(clock.whiteMs, 57_000);
  assert.equal(clock.blackMs, 60_000);
  assert.equal(clock.white, 57);
  assert.equal(clock.black, 60);
});

test("applies Fischer increment after legal move", () => {
  const game = createGame({
    timeControl: { kind: "fischer", initial: 180, increment: 2 },
    clockState: {
      whiteBankMs: 180_000,
      blackBankMs: 180_000,
      activeColor: "w",
      turnStartedAtMs: 10_000,
      moveCount: 0,
      running: true,
    },
    moveCount: 0,
  });

  const afterMove = applyMoveClockTransition(game, "w", "b", 15_000);
  assert.equal(afterMove.whiteMs, 177_000); // 180 - 5 + 2
  assert.equal(afterMove.blackMs, 180_000);
  assert.equal(afterMove.moveCount, 1);
  assert.equal(afterMove.activeColor, "b");
});

test("simple delay does not deduct bank during free window", () => {
  const game = createGame({
    timeControl: { kind: "delay", initial: 60, delay: 5 },
    clockState: {
      whiteBankMs: 60_000,
      blackBankMs: 60_000,
      activeColor: "w",
      turnStartedAtMs: 2_000,
      moveCount: 0,
      running: true,
    },
  });

  const withinDelay = materializeClock(game, 6_000);
  assert.equal(withinDelay.whiteMs, 60_000);

  const beyondDelay = materializeClock(game, 9_000);
  assert.equal(beyondDelay.whiteMs, 58_000);
});

test("bronstein delay returns used time up to cap", () => {
  const game = createGame({
    timeControl: { kind: "bronstein", initial: 60, delay: 5 },
    clockState: {
      whiteBankMs: 60_000,
      blackBankMs: 60_000,
      activeColor: "w",
      turnStartedAtMs: 1_000,
      moveCount: 0,
      running: true,
    },
  });

  const atThreeSeconds = materializeClock(game, 4_000);
  assert.equal(atThreeSeconds.whiteMs, 60_000);

  const atTenSeconds = materializeClock(game, 11_000);
  assert.equal(atTenSeconds.whiteMs, 55_000);
});

test("staged controls add bonus at stage boundary and stage increment afterwards", () => {
  const game = createGame({
    timeControl: {
      kind: "staged",
      initial: 5_400,
      stages: [
        { startsOnMoveNumber: 1, increment: 0 },
        { startsOnMoveNumber: 41, extraBank: 1_800, increment: 30 },
      ],
    },
    clockState: {
      whiteBankMs: 5_400_000,
      blackBankMs: 5_400_000,
      activeColor: "b",
      turnStartedAtMs: 20_000,
      moveCount: 79,
      running: true,
    },
    moveCount: 79,
    activeColor: "b",
  });

  const afterBlack40 = applyMoveClockTransition(game, "b", "w", 20_000);
  assert.equal(afterBlack40.whiteMs, 7_200_000);
  assert.equal(afterBlack40.blackMs, 7_200_000);
  assert.equal(afterBlack40.moveCount, 80);

  const afterWhite41 = applyMoveClockTransition(game, "w", "b", 20_000);
  assert.equal(afterWhite41.whiteMs, 7_230_000);
  assert.equal(afterWhite41.blackMs, 7_200_000);
  assert.equal(afterWhite41.moveCount, 81);
});

test("timeout delay accounts for free delay window", () => {
  const game = createGame({
    timeControl: { kind: "delay", initial: 60, delay: 5 },
    clockState: {
      whiteBankMs: 60_000,
      blackBankMs: 60_000,
      activeColor: "w",
      turnStartedAtMs: 1_000,
      moveCount: 0,
      running: true,
    },
  });

  assert.equal(getTurnTimeoutDelayMs(game, 1_000), 65_000);
  assert.equal(getTurnTimeoutDelayMs(game, 3_000), 63_000);
  assert.equal(getTurnTimeoutDelayMs(game, 8_000), 58_000);
});

test("migrates legacy second-based clocks into bank/start schema", () => {
  const game = createGame({
    timeControl: { initial: 100, increment: 0 },
    clockState: {
      white: 100,
      black: 90,
      activeColor: "b",
      asOf: 1_000,
    },
    activeColor: "b",
  });

  const state = ensureClockState(game, 4_000);
  assert.equal(state.activeColor, "b");
  assert.equal(state.whiteBankMs, 100_000);
  assert.equal(state.blackBankMs, 90_000);

  const clock = materializeClock(game, 4_000);
  assert.equal(clock.blackMs, 87_000);
  assert.equal(clock.whiteMs, 100_000);
});

test("frozen clock no longer decreases over time", () => {
  const game = createGame({
    timeControl: { initial: 60, increment: 0 },
    clockState: {
      whiteBankMs: 60_000,
      blackBankMs: 60_000,
      activeColor: "w",
      turnStartedAtMs: 10_000,
      moveCount: 0,
      running: true,
    },
  });

  const frozen = freezeGameClock(game, 15_000);
  assert.equal(frozen.whiteMs, 55_000);

  const later = materializeClock(game, 40_000);
  assert.equal(later.whiteMs, 55_000);
  assert.equal(later.running, false);
});
