import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GameHistory } from "../../historyTypes";
import {
  ReplayBoard,
  ReplayMoveList,
  ReplayEvalBar,
  CapturedPieces,
  GameSummary,
  MoveExplanationPanel,
} from "../../components/replay";
import { useGameReplay } from "../../hooks/useGameReplay";
import { useAuthStore } from "../../store/authStore";
import { AnalysisLoadingOverlay } from "./AnalysisLoadingOverlay";
import { getAnalyzeActivePlayerSide } from "./activePlayer";

interface ReplayContentProps {
  game: GameHistory;
}

export function ReplayContent({ game }: ReplayContentProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const replay = useGameReplay(game);
  const viewerUserId = useAuthStore((state) => state.user?.id ?? null);
  const activePlayerSide = getAnalyzeActivePlayerSide({
    viewerUserId,
    gameUserId: game.userId,
    playAs: game.playAs,
  });

  // Show loading overlay while analysis is in progress
  if (replay.isAnalyzing) {
    return <AnalysisLoadingOverlay progress={replay.analysisProgress} />;
  }

  return (
    <div className="h-[100dvh] bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col overflow-hidden">
      {/* Back Button */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 mb-2">
        <button
          onClick={() => navigate("/profile")}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          <span>{t("analysis.back", "Back")}</span>
        </button>
      </div>

      {/* Main Content - 3 columns in one row */}
      <div className="flex-1 min-h-0 w-full px-4 sm:px-6 pb-3">
        {replay.analysisDisabledReason && (
          <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            {replay.analysisDisabledReason}
          </div>
        )}
        <div className="flex gap-3 w-full h-full min-h-0">
          {/* Left - Game Summary */}
          <div
            className="flex-shrink-0 flex flex-col gap-2 h-full overflow-hidden pr-1"
            style={{ flexBasis: "30%", maxWidth: "30%" }}
          >
            <GameSummary
              game={game}
              accuracy={replay.accuracy}
              qualityCounts={replay.qualityCounts}
              moveQualities={replay.moveQualities}
              cpSeries={replay.analysisSeries}
              opening={replay.opening}
              activePlayerSide={activePlayerSide}
            />
          </div>

          {/* Center - Board section (sized by height) */}
          <div
            className="flex flex-col gap-1.5 h-full min-h-0"
            style={{ flexBasis: "40%", maxWidth: "40%" }}
          >
            {/* Captured pieces */}
            <div className="flex-shrink-0">
              <CapturedPieces
                capturedByWhite={replay.capturedByWhite}
                capturedByBlack={replay.capturedByBlack}
              />
            </div>

            {/* Board - fill remaining height */}
            <div className="flex-1 min-h-0 min-w-0 flex items-center gap-2 overflow-hidden">
              <div className="flex-1 min-w-0 flex items-center justify-center min-h-0">
                <ReplayBoard
                  position={replay.currentFen}
                  orientation={replay.orientation}
                  lastMove={replay.lastMove}
                  isCheck={replay.isCheck}
                  isCheckmate={replay.isCheckmate}
                  isStalemate={replay.isStalemate}
                />
              </div>
              <div className="w-8 md:w-10 h-full flex items-stretch flex-shrink-0">
                <ReplayEvalBar
                  orientation="vertical"
                  evalPercent={replay.evalPercent}
                  evalLabel={replay.evalLabel}
                />
              </div>
            </div>
          </div>

          {/* Right - Move Explanation + Move List */}
          <div
            className="flex-shrink-0 flex flex-col gap-2 h-full min-h-0"
            style={{ flexBasis: "30%", maxWidth: "30%" }}
          >
            {/* Move Explanation */}
            <div className="flex-shrink-0">
              <MoveExplanationPanel
                currentPly={replay.ply}
                currentMoveSan={replay.currentMoveSan}
                moveQualities={replay.moveQualities}
                analysisByPly={replay.analysisByPly}
                positions={replay.positions}
                sanMoves={replay.sanMoves}
                gameId={game._id}
              />
            </div>

            {/* Move list */}
            <div className="flex-1 min-h-0 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <ReplayMoveList
                  moveRows={replay.moveRows}
                  currentPly={replay.ply}
                  onJumpTo={replay.jumpTo}
                  opening={replay.opening?.name}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
