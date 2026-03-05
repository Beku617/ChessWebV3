import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { BarChart2 } from "lucide-react";

interface GameOverModalProps {
  isOpen: boolean;
  result: string | null;
  onTryAgain: () => void;
  onNewGame: () => void;
  savedGameId: string | null;
  analyzeBasePath?: string;
  tournamentMode?: boolean;
  onBackToTournament?: () => void;
}

export function GameOverModal({
  isOpen,
  result,
  onTryAgain,
  onNewGame,
  savedGameId,
  analyzeBasePath = "/analyze",
  tournamentMode = false,
  onBackToTournament,
}: GameOverModalProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleAnalyze = () => {
    if (savedGameId) {
      navigate(`${analyzeBasePath}/${savedGameId}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 text-center"
      >
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          {result}
        </h2>
        <div className="space-y-3">
          <button
            onClick={handleAnalyze}
            disabled={!savedGameId}
            className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${
              savedGameId
                ? "bg-purple-600 hover:bg-purple-500 text-white"
                : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
            }`}
          >
            <BarChart2 size={18} />
            {savedGameId ? "Analyze Game" : "Saving..."}
          </button>
          {tournamentMode ? (
            <button
              type="button"
              onClick={() => onBackToTournament?.()}
              className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium"
            >
              Back to Tournament
            </button>
          ) : (
            <>
              <button
                onClick={onTryAgain}
                className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-medium"
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  onNewGame();
                }}
                className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium"
              >
                New Game
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
