import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GameHistory } from "../../historyTypes";
import { GameCard } from "../profile";
import { ShareGameModal } from "../ShareGameModal";
import { TabType } from "./types";

interface RecentGamesProps {
  games: GameHistory[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  setActiveTab: (tab: TabType) => void;
  analyzeBaseUrl?: string;
}

export function RecentGames({
  games,
  expandedId,
  setExpandedId,
  setActiveTab,
  analyzeBaseUrl,
}: RecentGamesProps) {
  const { t } = useTranslation();
  const [shareGame, setShareGame] = useState<GameHistory | null>(null);

  // Build index numbers (1-based) that match the profile history order
  const gameIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    games.forEach((g, i) => map.set(g._id, i + 1));
    return map;
  }, [games]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="mt-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <History size={20} className="text-brand-500" />
          {t("profileGames.recentGames", "Recent Games")}
        </h3>
        <button
          onClick={() => setActiveTab("games")}
          className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline font-medium"
        >
          <span>{t("profileGames.viewAll", "View All")}</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-3">
        {games.slice(0, 3).map((game) => (
          <GameCard
            key={game._id}
            game={game}
            isExpanded={expandedId === game._id}
            onToggle={() =>
              setExpandedId(expandedId === game._id ? null : game._id)
            }
            analyzeBaseUrl={analyzeBaseUrl}
            gameIndex={gameIndexMap.get(game._id)}
            onShare={(g) => setShareGame(g)}
          />
        ))}
      </div>

      {shareGame && (
        <ShareGameModal game={shareGame} onClose={() => setShareGame(null)} />
      )}
    </motion.div>
  );
}


