import { motion } from "framer-motion";
import { useTranslation, Trans } from "react-i18next";
import {
  BotPersonality,
  getBotsByCategory,
} from "../../../data/botPersonalities";
import {
  BotCategory,
  categories,
  categoryLabels,
  categoryColors,
} from "./constants";
import { resolveLocalizedBotDescription } from "../../../utils/botDescriptionLocalization";

interface BotSelectorProps {
  selectedCategory: BotCategory;
  setSelectedCategory: (cat: BotCategory) => void;
  selectedBot: BotPersonality | null;
  setSelectedBot: (bot: BotPersonality) => void;
}

export function BotSelector({
  selectedCategory,
  setSelectedCategory,
  selectedBot,
  setSelectedBot,
}: BotSelectorProps) {
  const { i18n } = useTranslation();
  const botsInCategory = getBotsByCategory(selectedCategory);

  return (
    <motion.div
      key="bots"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
    >
      {/* Category Selector */}
      <div className="mb-4">
        <label className="text-sm font-medium text-theme-muted mb-2 block"> <Trans>Difficulty Category</Trans> </label>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setSelectedCategory(cat);
                setSelectedBot(getBotsByCategory(cat)[0]);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? `${categoryColors[cat]} text-theme-on-accent`
                  : "bg-theme-surface text-theme-muted hover:bg-theme-surface/80"
              }`}
            >
              {categoryLabels[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Bot Selection Grid */}
      <div className="mb-4">
        <label className="text-sm font-medium text-theme-muted mb-2 block"> <Trans>Choose Your Opponent</Trans> </label>
        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
          {botsInCategory.map((bot) => (
            <button
              key={bot.id}
              onClick={() => setSelectedBot(bot)}
              className={`p-3 rounded-lg text-left transition-all ${
                selectedBot?.id === bot.id
                  ? "bg-brand-600 text-theme-on-accent ring-2 ring-brand-400"
                  : "bg-theme-surface text-theme-muted hover:bg-theme-surface/80"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {bot.title && (
                      <span className="text-xs opacity-75 mr-1">
                        {bot.title}
                      </span>
                    )}
                    {bot.name}
                  </div>
                  <div
                    className={`text-xs ${
                      selectedBot?.id === bot.id
                        ? "text-brand-100"
                        : "text-theme-muted"
                    }`}
                  > <Trans>Rating:</Trans> {bot.rating}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Selected Bot Info */}
      {selectedBot && <BotInfoCard bot={selectedBot} language={i18n.language} />}
    </motion.div>
  );
}

function BotInfoCard({
  bot,
  language,
}: {
  bot: BotPersonality;
  language: string;
}) {
  return (
    <div className="mb-4 p-4 bg-theme-surface rounded-lg">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h3 className="font-bold text-theme-foreground ">
            {bot.title && (
              <span className="text-brand-600 mr-1">
                {bot.title}
              </span>
            )}
            {bot.name}
          </h3>
          <p className="text-sm text-theme-muted italic mb-1">
            "{bot.personality}"
          </p>
          <p className="text-xs text-theme-muted">
            {resolveLocalizedBotDescription(bot.description, language)}
          </p>
          <div className="flex gap-2 mt-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[bot.category]} text-theme-on-accent`}
            >
              {bot.rating} ELO
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-theme-surface text-theme-muted capitalize">
              {bot.playStyle}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

