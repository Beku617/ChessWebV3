import { useNavigate } from "react-router-dom";
import {
  BotPersonality,
  botPersonalities,
  getBotsByCategory,
} from "../../data/botPersonalities";
import { CategoryFilter, CATEGORIES } from "./types";
import { getPlayStyleLabel, getCategoryColor } from "./utils";

interface BotSelectionGridProps {
  categoryFilter: CategoryFilter;
  onCategoryChange: (category: CategoryFilter) => void;
  selectedBot: BotPersonality | null;
  onSelectBot: (bot: BotPersonality) => void;
}

export function BotSelectionGrid({
  categoryFilter,
  onCategoryChange,
  selectedBot,
  onSelectBot,
}: BotSelectionGridProps) {
  const navigate = useNavigate();
  const filteredBots =
    categoryFilter === "all"
      ? botPersonalities
      : getBotsByCategory(categoryFilter);

  return (
    <div className="lg:col-span-2">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate("/play")}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-white/80 dark:bg-slate-800/80 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        >
          Back
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Play with Bot
          </h1>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => onCategoryChange(cat.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              categoryFilter === cat.key
                ? "bg-brand-500 text-white"
                : "bg-white/80 dark:bg-slate-800/80 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Bot Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-auto pr-2">
        {filteredBots.map((bot) => (
          <button
            key={bot.id}
            onClick={() => onSelectBot(bot)}
            className={`p-4 rounded-xl border text-left transition-all ${
              selectedBot?.id === bot.id
                ? "border-brand-500 bg-brand-500/10 dark:bg-brand-500/20 ring-2 ring-brand-500/50"
                : "border-gray-200/60 dark:border-white/10 bg-white/80 dark:bg-slate-800/80 hover:border-gray-300 dark:hover:border-white/20"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {bot.name}
                  </span>
                  {bot.title && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded">
                      {bot.title}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {bot.rating}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-medium rounded capitalize ${getCategoryColor(bot.category)}`}
                  >
                    {bot.category}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                    {getPlayStyleLabel(bot.playStyle)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {bot.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

