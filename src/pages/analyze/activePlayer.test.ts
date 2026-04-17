import assert from "node:assert/strict";
import test from "node:test";
import { getAnalyzeActivePlayerSide } from "./activePlayer.ts";

test("marks white active when viewer owns game and played as white", () => {
  const side = getAnalyzeActivePlayerSide({
    viewerUserId: "u1",
    gameUserId: "u1",
    playAs: "white",
  });
  assert.equal(side, "white");
});

test("marks black active when viewer owns game and played as black", () => {
  const side = getAnalyzeActivePlayerSide({
    viewerUserId: "u2",
    gameUserId: "u2",
    playAs: "black",
  });
  assert.equal(side, "black");
});

test("keeps default behavior for spectators", () => {
  const side = getAnalyzeActivePlayerSide({
    viewerUserId: "spectator",
    gameUserId: "owner",
    playAs: "white",
  });
  assert.equal(side, null);
});

test("handles ObjectId-like game user values", () => {
  const side = getAnalyzeActivePlayerSide({
    viewerUserId: "u3",
    gameUserId: { _id: "u3" },
    playAs: "black",
  });
  assert.equal(side, "black");
});
