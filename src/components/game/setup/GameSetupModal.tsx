import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play } from "lucide-react";
import { GameSettings } from "../types";
import {
  botPersonalities,
  BotPersonality,
} from "../../../data/botPersonalities";
import { TabType, BotCategory } from "./constants";
import { TabSelector } from "./TabSelector";
import { BotSelector } from "./BotSelector";
import { CustomDifficultySelector } from "./CustomDifficultySelector";
import { TimeControlSelector } from "./TimeControlSelector";
import { PlayAsSelector } from "./PlayAsSelector";

interface GameSetupModalProps {
  isOpen: boolean;
  onStart: (settings: GameSettings) => void;
}

export function GameSetupModal({ isOpen, onStart }: GameSetupModalProps) {
  const [timeControl, setTimeControl] = useState({
    initial: 300,
    increment: 0,
  });
  const [playAs, setPlayAs] = useState<"white" | "black">("white");
  const [difficulty, setDifficulty] = useState(3);
  const [activeTab, setActiveTab] = useState<TabType>("bots");
  const [selectedBot, setSelectedBot] = useState<BotPersonality | null>(
    botPersonalities[0],
  );
  const [selectedCategory, setSelectedCategory] =
    useState<BotCategory>("beginner");

  const handleStart = () => {
    if (activeTab === "bots" && selectedBot) {
      onStart({
        timeControl,
        playAs,
        difficulty: Math.ceil(selectedBot.skillLevel / 2),
        selectedBot,
      });
    } else {
      onStart({ timeControl, playAs, difficulty });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-gray-900 rounded-xl p-6 w-full max-w-lg shadow-2xl border border-gray-200 dark:border-gray-800 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          New Game
        </h2>

        <TabSelector activeTab={activeTab} setActiveTab={setActiveTab} />

        <AnimatePresence mode="wait">
          {activeTab === "bots" ? (
            <BotSelector
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              selectedBot={selectedBot}
              setSelectedBot={setSelectedBot}
            />
          ) : (
            <CustomDifficultySelector
              difficulty={difficulty}
              setDifficulty={setDifficulty}
            />
          )}
        </AnimatePresence>

        <TimeControlSelector
          timeControl={timeControl}
          setTimeControl={setTimeControl}
        />

        <PlayAsSelector playAs={playAs} setPlayAs={setPlayAs} />

        <button
          onClick={handleStart}
          className="w-full py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium flex items-center justify-center gap-2"
        >
          <Play className="w-5 h-5" />
          {activeTab === "bots" && selectedBot
            ? `Play vs ${selectedBot.name}`
            : "Start Game"}
        </button>
      </motion.div>
    </div>
  );
}

