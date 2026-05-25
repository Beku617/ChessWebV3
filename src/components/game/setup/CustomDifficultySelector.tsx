import { Trans } from "react-i18next";
import { motion } from "framer-motion";

interface CustomDifficultySelectorProps {
  difficulty: number;
  setDifficulty: (level: number) => void;
}

export function CustomDifficultySelector({
  difficulty,
  setDifficulty,
}: CustomDifficultySelectorProps) {
  return (
    <motion.div
      key="custom"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <div className="mb-6">
        <label className="text-sm font-medium text-theme-muted mb-2 block"> <Trans>Difficulty: Level</Trans> {difficulty}
        </label>
        <input
          type="range"
          min="1"
          max="10"
          value={difficulty}
          onChange={(e) => setDifficulty(Number(e.target.value))}
          className="w-full accent-brand-600"
        />
        <div className="flex justify-between text-xs text-theme-muted mt-1">
          <span><Trans>Easy</Trans></span>
          <span><Trans>Hard</Trans></span>
        </div>
      </div>
    </motion.div>
  );
}

