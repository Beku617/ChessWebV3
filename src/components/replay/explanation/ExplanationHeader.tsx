import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { MoveQualityInfo } from "../../../utils/moveQuality";
import {
  getQualityColor,
  getQualityLabel,
} from "../../../utils/moveExplanations";
import { EvalTrend } from "./types";

interface ExplanationHeaderProps {
  currentMoveSan: string;
  qualityInfo?: MoveQualityInfo;
  evalTrend: EvalTrend;
  evalChange: string;
}

export function ExplanationHeader({
  currentMoveSan,
  qualityInfo,
  evalTrend,
  evalChange,
}: ExplanationHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-lg font-mono font-bold text-gray-900 dark:text-white">
          {currentMoveSan}
        </span>
        {qualityInfo && (
          <span
            className={`text-sm font-semibold ${getQualityColor(qualityInfo.label)}`}
          >
            {getQualityLabel(qualityInfo.label)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {evalTrend === "up" && (
          <TrendingUp className="w-4 h-4 text-green-500" />
        )}
        {evalTrend === "down" && (
          <TrendingDown className="w-4 h-4 text-red-500" />
        )}
        {evalTrend === "neutral" && <Minus className="w-4 h-4 text-gray-400" />}
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
          {evalChange}
        </span>
      </div>
    </div>
  );
}
