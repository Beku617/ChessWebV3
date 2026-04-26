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
import { useGameReplay960 } from "../../hooks/useGameReplay960";
import { useAuthStore } from "../../store/authStore";
import { AnalysisLoadingOverlay } from "../analyze/AnalysisLoadingOverlay";
import { getAnalyzeActivePlayerSide } from "../analyze/activePlayer";

interface ReplayContent960Props {
  game: GameHistory;
}

export function ReplayContent960({ game }: ReplayContent960Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const replay = useGameReplay960(game);
  const viewerUserId = useAuthStore((state) => state.user?.id ?? null);
  const activePlayerSide = getAnalyzeActivePlayerSide({
    viewerUserId,
    gameUserId: game.userId,
    playAs: game.playAs,
  });

  if (replay.isAnalyzing) {
    return <AnalysisLoadingOverlay progress={replay.analysisProgress} />;
  }

  return (
    <div className="h-[100dvh] bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 mb-2">
        <button
          onClick={() => navigate("/profile")}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          <span>{t("analysis.back")}</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 w-full px-4 sm:px-6 pb-3">
        <div className="flex gap-3 w-full h-full min-h-0">
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
              activePlayerSide={activePlayerSide}
            />
          </div>

          <div
            className="flex flex-col gap-1.5 h-full min-h-0"
            style={{ flexBasis: "40%", maxWidth: "40%" }}
          >
            <div className="flex-shrink-0">
              <CapturedPieces
                capturedByWhite={replay.capturedByWhite}
                capturedByBlack={replay.capturedByBlack}
              />
            </div>

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

          <div
            className="flex-shrink-0 flex flex-col gap-2 h-full min-h-0"
            style={{ flexBasis: "30%", maxWidth: "30%" }}
          >
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

            <div className="flex-1 min-h-0 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <ReplayMoveList
                  moveRows={replay.moveRows}
                  currentPly={replay.ply}
                  onJumpTo={replay.jumpTo}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
