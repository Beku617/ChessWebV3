import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Chessboard } from "react-chessboard";
import { useTranslation } from "react-i18next";
import { useReplayMoveSounds } from "../../hooks/useReplayMoveSounds";
import { usePositionParser } from "../../hooks/usePositionParser";
import { useElementSize } from "../../hooks/useElementSize";
import type { GameHistory } from "../../historyTypes";
import { CommunitySharedGame } from "./types";

interface CommunityGameViewerProps {
  game: CommunitySharedGame | null;
  analyzeHref?: string;
}

type ViewerRegistration = {
  id: string;
  element: HTMLDivElement;
  stepBy: (delta: number) => void;
  visibility: number;
  centerDistance: number;
  lastInteractionAt: number;
  lastControlledAt: number;
};

const EMPTY_REPLAY_GAME: GameHistory = {
  _id: "empty",
  event: "NeonGambit Game",
  site: "NeonGambit",
  date: "",
  round: "-",
  white: "White",
  black: "Black",
  result: "*",
  variant: "standard",
  currentPosition: "",
  startingFen: "",
  timeControl: "",
  utcDate: "",
  utcTime: "",
  startTime: "",
  endDate: "",
  endTime: "",
  whiteElo: 1200,
  blackElo: 1200,
  rated: false,
  eco: "",
  termination: "",
  moves: [],
  pgn: "",
  playAs: "white",
  opponent: "Opponent",
  createdAt: new Date(0).toISOString(),
};

const COMMUNITY_VIEWER_MAX_WIDTH = 616;
const COMMUNITY_BOARD_MAX_WIDTH = 560;

const viewerRegistry = new Map<string, ViewerRegistration>();
let registryListenersAttached = false;
let metricsFrame = 0;

function getViewportMetrics(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth || 1;
  const viewportHeight = window.innerHeight || 1;
  const visibleWidth =
    Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
  const visibleHeight =
    Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
  const visibleArea = visibleWidth * visibleHeight;
  const totalArea = Math.max(1, rect.width * rect.height);
  const centerDistance = Math.abs(rect.top + rect.height / 2 - viewportHeight / 2);

  return {
    visibility: Math.min(1, visibleArea / totalArea),
    centerDistance,
  };
}

function updateViewerMetrics() {
  metricsFrame = 0;
  if (typeof window === "undefined") return;
  for (const registration of viewerRegistry.values()) {
    const { visibility, centerDistance } = getViewportMetrics(registration.element);
    registration.visibility = visibility;
    registration.centerDistance = centerDistance;
  }
}

function scheduleViewerMetricsUpdate() {
  if (typeof window === "undefined") return;
  if (metricsFrame) return;
  metricsFrame = window.requestAnimationFrame(updateViewerMetrics);
}

function viewerPriority(registration: ViewerRegistration) {
  if (registration.visibility <= 0.05) return Number.NEGATIVE_INFINITY;
  const now = Date.now();
  const visibilityScore = registration.visibility * 1200;
  const centerScore = Math.max(0, 420 - registration.centerDistance);
  const interactionBonus = now - registration.lastInteractionAt < 20_000 ? 520 : 0;
  const controlledBonus = now - registration.lastControlledAt < 2_500 ? 260 : 0;
  return visibilityScore + centerScore + interactionBonus + controlledBonus;
}

function getActiveViewer() {
  updateViewerMetrics();

  let best: ViewerRegistration | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const registration of viewerRegistry.values()) {
    const score = viewerPriority(registration);
    if (score > bestScore) {
      bestScore = score;
      best = registration;
    }
  }

  return best;
}

function shouldIgnoreGlobalKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  if (shouldIgnoreGlobalKeydown(event)) return;

  const activeViewer = getActiveViewer();
  if (!activeViewer) return;

  event.preventDefault();
  activeViewer.lastControlledAt = Date.now();
  activeViewer.stepBy(event.key === "ArrowLeft" ? -1 : 1);
}

function attachRegistryListeners() {
  if (registryListenersAttached || typeof window === "undefined") return;
  registryListenersAttached = true;
  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("scroll", scheduleViewerMetricsUpdate, { passive: true });
  window.addEventListener("resize", scheduleViewerMetricsUpdate);
}

function detachRegistryListeners() {
  if (!registryListenersAttached || typeof window === "undefined") return;
  registryListenersAttached = false;
  window.removeEventListener("keydown", handleGlobalKeydown);
  window.removeEventListener("scroll", scheduleViewerMetricsUpdate);
  window.removeEventListener("resize", scheduleViewerMetricsUpdate);
  if (metricsFrame) {
    window.cancelAnimationFrame(metricsFrame);
    metricsFrame = 0;
  }
}

function registerViewer(
  id: string,
  element: HTMLDivElement,
  stepBy: (delta: number) => void,
) {
  viewerRegistry.set(id, {
    id,
    element,
    stepBy,
    visibility: 0,
    centerDistance: Number.POSITIVE_INFINITY,
    lastInteractionAt: 0,
    lastControlledAt: 0,
  });
  attachRegistryListeners();
  scheduleViewerMetricsUpdate();
}

function unregisterViewer(id: string) {
  viewerRegistry.delete(id);
  if (viewerRegistry.size === 0) {
    detachRegistryListeners();
  }
}

function markViewerInteracted(id: string) {
  const registration = viewerRegistry.get(id);
  if (!registration) return;
  registration.lastInteractionAt = Date.now();
  scheduleViewerMetricsUpdate();
}

function buildReplayGame(game: CommunitySharedGame): GameHistory {
  return {
    _id: game.sourceGameId,
    event: game.event || "NeonGambit Game",
    site: "NeonGambit",
    date: "",
    round: "-",
    white: game.white,
    black: game.black,
    result: game.result,
    variant: game.variant,
    currentPosition: game.currentPosition || "",
    startingFen: game.startingFen || "",
    timeControl: game.timeControl || "",
    utcDate: "",
    utcTime: "",
    startTime: "",
    endDate: "",
    endTime: "",
    whiteElo: Number(game.whiteElo || 1200),
    blackElo: Number(game.blackElo || 1200),
    rated: Boolean(game.rated),
    eco: game.eco || "",
    termination: "",
    moves: Array.isArray(game.moves) ? game.moves : [],
    pgn: "",
    playAs: game.playAs === "black" ? "black" : "white",
    opponent: game.opponent || "",
    createdAt: game.playedAt || new Date(0).toISOString(),
  };
}

function getOutcomeLabel(result?: string | null) {
  const normalized = String(result || "").trim();
  if (normalized === "1-0") return "communityGameViewer.whiteWon";
  if (normalized === "0-1") return "communityGameViewer.blackWon";
  if (normalized === "1/2-1/2") return "communityGameViewer.draw";
  return "communityGameViewer.resultUnavailable";
}

function CommunityGameViewerComponent({
  game,
  analyzeHref,
}: CommunityGameViewerProps) {
  const { t } = useTranslation();
  const viewerId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const board = useElementSize<HTMLDivElement>();
  const interactiveRef = useRef<HTMLDivElement | null>(null);
  const replayGame = useMemo(() => (game ? buildReplayGame(game) : null), [game]);
  const { positions, plies, totalPlies } = usePositionParser(
    replayGame || EMPTY_REPLAY_GAME,
  );
  const [ply, setPly] = useState(0);
  const totalPliesRef = useRef(totalPlies);

  useEffect(() => {
    totalPliesRef.current = totalPlies;
  }, [totalPlies]);

  useEffect(() => {
    setPly(0);
  }, [game?.sourceGameId]);

  useEffect(() => {
    const element = interactiveRef.current;
    if (!game || !element) return;

    const stepBy = (delta: number) => {
      setPly((value) =>
        Math.max(0, Math.min(totalPliesRef.current, value + delta)),
      );
    };

    registerViewer(viewerId, element, stepBy);
    return () => unregisterViewer(viewerId);
  }, [game, viewerId]);

  const safePly = Math.max(0, Math.min(ply, totalPlies));
  const currentMove = safePly > 0 ? plies[safePly - 1] : null;
  const currentFen =
    (totalPlies <= 0 ? game?.currentPosition : "") ||
    positions[safePly] ||
    positions[0] ||
    "start";
  const boardWidth = board.hasSize
    ? Math.min(board.width, COMMUNITY_BOARD_MAX_WIDTH)
    : 0;
  const squareStyles =
    currentMove?.from && currentMove?.to
      ? {
          [currentMove.from]: {
            boxShadow:
              "inset 0 0 0 3px rgba(250, 204, 21, 0.95), inset 0 0 0 1px rgba(120, 53, 15, 0.45)",
          },
          [currentMove.to]: {
            boxShadow:
              "inset 0 0 0 3px rgba(250, 204, 21, 0.95), inset 0 0 0 1px rgba(120, 53, 15, 0.45)",
          },
        }
      : {};

  const outcomeLabel = t(getOutcomeLabel(game?.result));

  useReplayMoveSounds(safePly, plies, game?.playAs === "black" ? "black" : "white");

  if (!game) {
    return (
      <div className="mt-2 rounded-[18px] bg-white/[0.03] px-4 py-4 text-sm text-gray-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        {t("communityGameViewer.previewUnavailable")}
      </div>
    );
  }

  return (
    <div
      className="mx-auto mt-0 w-full overflow-hidden rounded-[20px] bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.04),transparent_30%),linear-gradient(180deg,rgba(10,18,30,0.96),rgba(8,14,24,0.98))] px-2.5 py-2.5 shadow-[0_18px_46px_rgba(0,0,0,0.22)] sm:px-3 sm:py-3"
      style={{ maxWidth: `${COMMUNITY_VIEWER_MAX_WIDTH}px` }}
    >
      <div
        ref={interactiveRef}
        onMouseDown={() => markViewerInteracted(viewerId)}
        className="rounded-[16px] bg-[#07111d]/90 px-1.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.015),0_14px_32px_rgba(0,0,0,0.2)] sm:px-2 sm:py-2"
      >
        <div className="mx-auto w-full max-w-[560px]">
          <div className="flex justify-center">
            <div ref={board.ref} className="w-full max-w-[560px]">
              {board.hasSize ? (
                <Chessboard
                  id={`community-game-${viewerId}`}
                  position={currentFen}
                  boardOrientation={game.playAs === "black" ? "black" : "white"}
                  boardWidth={boardWidth}
                  arePiecesDraggable={false}
                  animationDuration={140}
                  customSquareStyles={squareStyles}
                  customDarkSquareStyle={{ backgroundColor: "#90a4b5" }}
                  customLightSquareStyle={{ backgroundColor: "#c6d0d8" }}
                  customBoardStyle={{
                    borderRadius: "15px",
                    boxShadow: "0 18px 38px rgba(0,0,0,0.24)",
                  }}
                />
              ) : (
                <div className="aspect-square w-full animate-pulse rounded-[15px] bg-white/[0.05]" />
              )}
            </div>
          </div>

          <div className="mt-2.5 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-gray-100 sm:text-sm">
                {game.white} ({game.whiteElo}) vs {game.black} ({game.blackElo})
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] leading-none text-gray-500">
                <span className="font-medium text-gray-300">{outcomeLabel}</span>
                {analyzeHref && (
                  <Link
                    to={analyzeHref}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-200/90 transition-colors hover:text-brand-100"
                  >
                    {t("communityGameViewer.analyzeGame")}
                  </Link>
                )}
              </div>
            </div>

            {totalPlies > 0 && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] leading-none text-gray-500 sm:shrink-0 sm:justify-end">
                <span className="text-gray-600">
                  {t("communityGameViewer.useArrowKeys")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const CommunityGameViewer = memo(CommunityGameViewerComponent);

