import { useEffect } from "react";
import { Chess } from "chess.js";
import { GameSettings } from "../../components/game";
import { GameHistoryPayload } from "../useStockfishGameTypes";
import { detectOpeningFromSan } from "../../utils/openingExplorer";
import {
  canPersistHistoryByMoveCount,
  HistoryPersistenceStatus,
} from "./historyPersistence";
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
  setHistoryPersistenceStatus: (status: HistoryPersistenceStatus) => void,
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
    const persistedMoves = currentGame.history();
    const shouldPersistHistory = canPersistHistoryByMoveCount(
      persistedMoves.length,
    );

    if (!shouldPersistHistory) {
      setHistoryPersistenceStatus("skipped_short_game");
      return;
    }

    setHistoryPersistenceStatus("saving");

    // Detect opening
    const opening = detectOpeningFromSan(persistedMoves);
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
      rated: false,
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
      moves: persistedMoves,
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
        setHistoryPersistenceStatus("saved");
        return;
      }

      // Fallback: if backend saved but did not return an id, fetch the latest game id
      if (!fetchLatestSavedGameId) {
        setHistoryPersistenceStatus("failed");
        return;
      }
      fetchLatestSavedGameId()
        .then((latestId) => {
          if (latestId) {
            setSavedGameId(latestId);
            setHistoryPersistenceStatus("saved");
            return;
          }
          setHistoryPersistenceStatus("failed");
        })
        .catch(() => {
          setHistoryPersistenceStatus("failed");
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
    setHistoryPersistenceStatus,
    fetchLatestSavedGameId,
  ]);
}
