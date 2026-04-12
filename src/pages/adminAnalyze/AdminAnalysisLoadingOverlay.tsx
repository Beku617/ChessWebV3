import { Brain, Zap, BarChart3, Loader2 } from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";

interface AdminAnalysisLoadingOverlayProps {
  progress: number;
}

export function AdminAnalysisLoadingOverlay({
  progress,
}: AdminAnalysisLoadingOverlayProps) {
  return (
    <div className="h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white flex">
      <AdminSidebar />
      <div className="flex-1 ml-72 flex items-center justify-center">
        <div className="text-center">
          {/* Animated chess analysis icon */}
          <div className="relative mb-8">
            <div className="w-24 h-24 mx-auto rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-2xl shadow-brand-500/30">
              <Brain className="w-12 h-12 text-white animate-pulse" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center animate-bounce">
              <Zap className="w-4 h-4 text-white" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Analyzing Game
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto">
            Stockfish is evaluating each position to calculate accuracy and move
            quality
          </p>

          {/* Progress bar */}
          <div className="w-80 mx-auto mb-4">
            <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-2">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-500 to-brand-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Analysis steps */}
          <div className="flex items-center justify-center gap-6 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <BarChart3
                className={`w-4 h-4 ${progress > 0 ? "text-brand-500" : ""}`}
              />
              <span>Evaluating positions</span>
            </div>
            <div className="flex items-center gap-2">
              <Loader2
                className={`w-4 h-4 ${progress > 50 ? "text-brand-500 animate-spin" : "animate-spin"}`}
              />
              <span>Calculating accuracy</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

