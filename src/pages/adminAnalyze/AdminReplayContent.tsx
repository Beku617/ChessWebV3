import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { GameHistory } from "../../historyTypes";
import AdminSidebar from "../../components/AdminSidebar";
import {
  ReplayBoard,
  ReplayMoveList,
  ReplayEvalBar,
  CapturedPieces,
  GameSummary,
  MoveExplanationPanel,
} from "../../components/replay";
import { useGameReplay } from "../../hooks/useGameReplay";
import { AdminAnalysisLoadingOverlay } from "./AdminAnalysisLoadingOverlay";
import { useAiExplanations } from "../../components/replay/explanation/useAiExplanations";

interface AdminReplayContentProps {
  game: GameHistory;
}

export function AdminReplayContent({ game }: AdminReplayContentProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const replay = useGameReplay(game);
  const ai = useAiExplanations({
    moveQualities: replay.moveQualities,
    analysisByPly: replay.analysisByPly,
    positions: replay.positions,
    sanMoves: replay.sanMoves,
    gameId: game._id,
    analysisReady: !replay.isAnalyzing,
  });
  const aiExplainedPlies = useMemo(
    () => new Set(ai.explanationsByPly.keys()),
    [ai.explanationsByPly],
  );

  // Show loading overlay while analysis is in progress
  if (replay.isAnalyzing) {
    return <AdminAnalysisLoadingOverlay progress={replay.analysisProgress} />;
  }

  return (
    <div className="h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white flex">
      <AdminSidebar />

      <div className="flex-1 ml-72 flex flex-col overflow-hidden pt-4">
        {/* Back Button */}
        <div className="flex-shrink-0 px-4 sm:px-6 mb-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft size={16} />
              <span>{t("analysis.back")}</span>
            </button>
            <h1 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {t("analysis.title", "Analysis")}
            </h1>
          </div>
        </div>

        {/* Main Content - 3 columns */}
        <div className="flex-1 min-h-0 w-full px-4 sm:px-6 py-2">
          <div className="flex gap-3 w-full h-full min-h-0">
            {/* Left - Game Summary */}
            <div
              className="flex-shrink-0 flex flex-col gap-2 h-full overflow-auto pr-1"
              style={{ flexBasis: "28%", maxWidth: "28%" }}
            >
              <GameSummary
                game={game}
                accuracy={replay.accuracy}
                qualityCounts={replay.qualityCounts}
                moveQualities={replay.moveQualities}
                cpSeries={replay.analysisSeries}
                opening={replay.opening}
              />
            </div>

            {/* Center - Board section */}
            <div
              className="flex flex-col gap-1.5 h-full min-h-0"
              style={{ flexBasis: "44%", maxWidth: "44%" }}
            >
              {/* Captured pieces */}
              <div className="flex-shrink-0">
                <CapturedPieces
                  capturedByWhite={replay.capturedByWhite}
                  capturedByBlack={replay.capturedByBlack}
                />
              </div>

              {/* Board */}
              <div className="flex-1 min-h-0 flex items-center gap-2 overflow-hidden">
                <div className="flex-1 flex items-center justify-center min-h-0">
                  <ReplayBoard
                    position={replay.currentFen}
                    orientation={replay.orientation}
                    lastMove={replay.lastMove}
                    isCheck={replay.isCheck}
                    isCheckmate={replay.isCheckmate}
                    isStalemate={replay.isStalemate}
                  />
                </div>
                <div className="w-8 md:w-10 h-full flex items-stretch">
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
              style={{ flexBasis: "28%", maxWidth: "28%" }}
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
                aiExplanationsByPly={ai.explanationsByPly}
                aiLoading={ai.aiLoading}
                aiError={ai.aiError}
                aiModel={ai.modelUsed}
                aiEnabled={ai.enableAiExplanations}
                isAiConfigured={ai.isAiConfigured}
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
                    aiExplainedPlies={aiExplainedPlies}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
