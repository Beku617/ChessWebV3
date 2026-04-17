import assert from "node:assert/strict";
import test from "node:test";
import {
  getAbortThresholdMs,
  resolveTerminalReason,
  shouldApplyRatedResult,
  shouldPersistHistoryByPlies,
} from "./gameLifecyclePolicy.js";

test("uses 60s abort threshold for non 1+0 time controls", () => {
  assert.equal(getAbortThresholdMs({ initial: 300, increment: 1 }), 60_000);
  assert.equal(getAbortThresholdMs({ initial: 600, increment: 0 }), 60_000);
});

test("uses 10s abort threshold for 1+0 bullet", () => {
  assert.equal(getAbortThresholdMs({ initial: 60, increment: 0 }), 10_000);
});

test("converts early exit before first move to aborted", () => {
  assert.equal(resolveTerminalReason("opponent_left", 0), "aborted");
  assert.equal(resolveTerminalReason("resign", 0), "aborted");
  assert.equal(resolveTerminalReason("timeout", 0), "aborted");
});

test("does not apply rating changes for aborted games", () => {
  assert.equal(shouldApplyRatedResult("aborted", 0), false);
  assert.equal(shouldApplyRatedResult("opponent_left", 0), false);
});

test("excludes aborted and <=1 ply games from history persistence", () => {
  assert.equal(shouldPersistHistoryByPlies(0), false);
  assert.equal(shouldPersistHistoryByPlies(1), false);
});

test("includes valid games (>1 ply) for history and normal rating flow", () => {
  assert.equal(shouldPersistHistoryByPlies(2), true);
  assert.equal(shouldApplyRatedResult("resign", 2), true);
  assert.equal(shouldApplyRatedResult("checkmate", 7), true);
});

