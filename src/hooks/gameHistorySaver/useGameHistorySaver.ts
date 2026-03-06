import { useEffect } from "react";
import { Chess } from "chess.js";
import { GameSettings } from "../../components/game";
import { GameHistoryPayload } from "../useStockfishGameTypes";
import { detectOpeningFromSan } from "../../utils/openingExplorer";
import {
  formatDate,
  formatTime,
  formatTimeControl,
  getTerminationInfo,
  getPlayerInfo,
} from "./utils";
import { buildFullPgn } from "./buildPgn";

export function useGameHistorySaver(
  gameOver: boolean,
  gameResult: string | null,
  gameSettings: GameSettings,
  gameRef: React.MutableRefObject<Chess>,
  game: Chess,
  startTimeRef: React.MutableRefObject<number | null>,
  historySavedRef: React.MutableRefObject<boolean>,
  saveGameHistory: (payload: GameHistoryPayload) => Promise<string | null>,
  setSavedGameId: (id: string | null) => void,
  fetchLatestSavedGameId?: () => Promise<string | null>,
) {
  useEffect(() => {
    if (!gameOver || !gameResult || historySavedRef.current) return;
    historySavedRef.current = true;

    const currentGame = gameRef.current;
    const now = new Date();
    const startDate = startTimeRef.current
      ? new Date(startTimeRef.current)
      : now;
    const durationMs = startTimeRef.current
      ? Date.now() - startTimeRef.current
      : undefined;

    // Detect opening
    const opening = detectOpeningFromSan(currentGame.history());
    const ecoCode = opening?.eco || "";
    const openingName = opening
      ? opening.variation
        ? `${opening.name}: ${opening.variation}`
        : opening.name
      : "";
    const openingSlug = openingName
      ? openingName.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "")
      : ecoCode
        ? `eco_${ecoCode}`
        : "";
    const ecoUrl =
      openingSlug.length > 0
        ? `https://lichess.org/opening/${openingSlug}`
        : "";

    // Get termination and player info
    const termination = getTerminationInfo(
      currentGame,
      gameResult,
      gameSettings,
    );
    const playerInfo = getPlayerInfo(gameSettings);
    const timeControlStr = formatTimeControl(gameSettings.timeControl);

    // Build full PGN
    const fullPgn = buildFullPgn(currentGame, {
      startDate,
      endDate: now,
      whiteName: playerInfo.whiteName,
      blackName: playerInfo.blackName,
      whiteElo: playerInfo.whiteElo,
      blackElo: playerInfo.blackElo,
      pgnResult: termination.pgnResult,
      terminationText: termination.text,
      timeControlStr,
      ecoCode,
      ecoUrl,
      currentFen: currentGame.fen(),
    });

    // Save to backend
    saveGameHistory({
      event: "Live Chess",
      variant: "standard",
      site: "NeonGambit",
      date: formatDate(startDate),
      round: "-",
      white: playerInfo.whiteName,
      black: playerInfo.blackName,
      result: termination.pgnResult,
      currentPosition: currentGame.fen(),
      timeControl: timeControlStr,
      utcDate: formatDate(startDate),
      utcTime: formatTime(startDate),
      startTime: formatTime(startDate),
      endDate: formatDate(now),
      endTime: formatTime(now),
      whiteElo: playerInfo.whiteElo,
      blackElo: playerInfo.blackElo,
      timezone: "UTC",
      eco: ecoCode,
      ecoUrl,
      link: "",
      whiteUrl: "",
      whiteCountry: "",
      whiteTitle: "",
      blackUrl: "",
      blackCountry: "",
      blackTitle: "",
      termination: termination.text,
      moves: currentGame.history(),
      moveText: currentGame.pgn(),
      pgn: fullPgn,
      playAs: gameSettings.playAs,
      opponent: playerInfo.botName,
      opponentLevel:
        gameSettings.selectedBot?.skillLevel || gameSettings.difficulty,
      durationMs,
    }).then((id) => {
      if (id) {
        setSavedGameId(id);
        return;
      }

      // Fallback: if backend saved but did not return an id, fetch the latest game id
      if (!fetchLatestSavedGameId) return;
      fetchLatestSavedGameId()
        .then((latestId) => {
          if (latestId) setSavedGameId(latestId);
        })
        .catch(() => {
          // swallow; UI will remain without analyze link but game is already saved
        });
    });
  }, [
    gameOver,
    gameResult,
    gameSettings,
    gameRef,
    game,
    startTimeRef,
    historySavedRef,
    saveGameHistory,
    setSavedGameId,
    fetchLatestSavedGameId,
  ]);
}
