import { useState, useEffect } from "react";
import { Brain, Loader2 } from "lucide-react";
import { Chessboard } from "react-chessboard";
import Sidebar from "../../components/Sidebar";
import { usePuzzleTrainer } from "./usePuzzleTrainer";
import { PuzzlePanelHeader } from "./PuzzlePanelHeader";
import { PuzzleInfoCard } from "./PuzzleInfoCard";
import { PuzzleProgressBar } from "./PuzzleProgressBar";
import { PuzzleStatusArea } from "./PuzzleStatusArea";
import { PuzzleActions } from "./PuzzleActions";
import { SIDEBAR_WIDTH, PANEL_MIN_WIDTH, BOARD_GUTTER } from "./types";

export default function PuzzleTrainer() {
  const {
    loading,
    status,
    streak,
    showHint,
    elapsedTime,
    game,
    fenError,
    currentPuzzle,
    solutionMoves,
    puzzleElo,
    customSquareStyles,
    puzzleStartsWithWhite,
    onDrop,
    handleSquareClick,
    handleSquareRightClick,
    nextPuzzle,
    prevPuzzle,
    useHint,
    navigate,
  } = usePuzzleTrainer();

  // Responsive board size
  const [boardSize, setBoardSize] = useState(560);

  useEffect(() => {
    const updateSize = () => {
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const maxBoardW = Math.max(
        360,
        viewportW - SIDEBAR_WIDTH - PANEL_MIN_WIDTH - BOARD_GUTTER,
      );
      const maxBoardH = Math.max(360, viewportH - 48);
      const size = Math.min(800, maxBoardW, maxBoardH);
      setBoardSize(size);
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  if (loading) {
    return (
      <div className="h-screen bg-[#0b0f19] text-white flex overflow-hidden">
        <Sidebar />
      <main className="flex-1 ml-[60px] md:ml-72 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-brand-500 animate-spin" />
        </main>
      </div>
    );
  }

  if (!currentPuzzle) {
    return (
      <div className="h-screen bg-[#0b0f19] text-white flex overflow-hidden">
        <Sidebar />
      <main className="flex-1 ml-[60px] md:ml-72 flex flex-col items-center justify-center gap-4">
          <Brain className="w-16 h-16 text-gray-400" />
          <h2 className="text-xl font-bold text-gray-300">Puzzle not found</h2>
          <button
            onClick={() => navigate("/puzzles")}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg"
          >
            Back to Puzzles
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0b0f19] text-white flex overflow-hidden">
      <Sidebar />

      <main className="flex-1 ml-[60px] md:ml-72 min-h-0 overflow-hidden flex gap-3 pt-3 pb-3 pr-4">
        {/* Board Area */}
        <div className="min-h-0 flex items-center justify-start bg-[#0b0f19] pl-6 pr-3 py-4">
          <div style={{ width: boardSize, height: boardSize }}>
            {fenError && (
              <div className="mb-2 text-xs text-red-400">{fenError}</div>
            )}
            <Chessboard
              position={game.fen()}
              onPieceDrop={onDrop}
              onSquareClick={handleSquareClick}
              onSquareRightClick={handleSquareRightClick}
              boardOrientation={puzzleStartsWithWhite ? "white" : "black"}
              customSquareStyles={customSquareStyles}
              arePiecesDraggable={status === "solving"}
              customDarkSquareStyle={{ backgroundColor: "#779952" }}
              customLightSquareStyle={{ backgroundColor: "#edeed1" }}
              animationDuration={200}
              boardWidth={boardSize}
            />
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex-1 min-w-[360px] bg-[#111521] flex flex-col h-full">
          <PuzzlePanelHeader onBack={() => navigate("/puzzles")} />
          <PuzzleInfoCard
            puzzle={currentPuzzle}
            isWhiteToMove={puzzleStartsWithWhite}
          />
          <PuzzleProgressBar streak={streak} puzzleElo={puzzleElo} />

          {/* Status Area */}
          <div className="flex-1 px-3 py-2 flex flex-col justify-center min-h-0">
            <PuzzleStatusArea
              status={status}
              elapsedTime={elapsedTime}
              showHint={showHint}
              solutionMoves={solutionMoves}
            />
          </div>

          <PuzzleActions
            status={status}
            showHint={showHint}
            elapsedTime={elapsedTime}
            onNextPuzzle={nextPuzzle}
            onPrevPuzzle={prevPuzzle}
            onUseHint={useHint}
          />
        </div>
      </main>
    </div>
  );
}

