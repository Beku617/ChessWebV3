import { Trans, useTranslation } from "react-i18next";
import { BotPersonality } from "../../data/botPersonalities";
import { TIME_OPTIONS } from "./types";

interface GameSettingsPanelProps {
  selectedBot: BotPersonality | null;
  playAs: "white" | "black" | "random";
  onPlayAsChange: (value: "white" | "black" | "random") => void;
  timeControl: { initial: number; increment: number };
  onTimeControlChange: (value: { initial: number; increment: number }) => void;
  onStart: () => void;
}

const PLAY_AS_OPTIONS: Array<"white" | "black" | "random"> = [
  "white",
  "black",
  "random",
];

export function GameSettingsPanel({
  selectedBot,
  playAs,
  onPlayAsChange,
  timeControl,
  onTimeControlChange,
  onStart,
}: GameSettingsPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="lg:col-span-1">
      <div className="rounded-2xl border border-theme-glass/60 bg-theme-panel/80 p-5 sticky top-6">
        {/* Selected Bot Preview */}
        {selectedBot ? (
          <div className="mb-6 pb-4 border-b border-theme-glass/60 ">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-theme-foreground ">
                    {selectedBot.name}
                  </span>
                  {selectedBot.title && (
                    <span className="px-1.5 py-0.5 text-xs font-bold bg-amber-500/20 text-amber-600 rounded">
                      {selectedBot.title}
                    </span>
                  )}
                </div>
                <div className="text-sm text-theme-muted"> <Trans>Rating:</Trans> {selectedBot.rating}
                </div>
              </div>
            </div>
            <p className="text-sm text-theme-muted mt-3 italic">
              "{selectedBot.personality}"
            </p>
          </div>
        ) : (
          <div className="mb-6 pb-4 border-b border-theme-glass/60 text-center text-theme-muted"> <Trans>Select a bot to play against</Trans> </div>
        )}

        {/* Play As */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-theme-muted mb-2"> <Trans>Play as</Trans> </label>
          <div className="grid grid-cols-3 gap-2">
            {PLAY_AS_OPTIONS.map((color) => (
              <button
                key={color}
                onClick={() => onPlayAsChange(color)}
                className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors capitalize ${
                  playAs === color
                    ? "bg-brand-500 text-theme-on-accent"
                    : "bg-theme-surface text-theme-muted hover:bg-theme-surface/80"
                }`}
              >
                {color === "random" ? t("Random") : t(color)}
              </button>
            ))}
          </div>
        </div>

        {/* Time Control */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-theme-muted mb-2"> <Trans>Time Control</Trans> </label>
          <div className="grid grid-cols-3 gap-2">
            {TIME_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() =>
                  onTimeControlChange({
                    initial: opt.initial,
                    increment: opt.increment,
                  })
                }
                className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
                  timeControl.initial === opt.initial &&
                  timeControl.increment === opt.increment
                    ? "bg-brand-500 text-theme-on-accent"
                    : "bg-theme-surface text-theme-muted hover:bg-theme-surface/80"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={onStart}
          disabled={!selectedBot}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-brand-500 to-brand-500 hover:from-brand-600 hover:to-brand-600 text-theme-on-accent font-bold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
        >
          {selectedBot
            ? t("playWithBot.playVs", {
                name: selectedBot.name,
                defaultValue: "Play vs {{name}}",
              })
            : t("playWithBot.selectBot", { defaultValue: "Select a Bot" })}
        </button>
      </div>
    </div>
  );
}

