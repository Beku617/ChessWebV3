import { Trans } from "react-i18next";
interface PlayAsSelectorProps {
  playAs: "white" | "black";
  setPlayAs: (color: "white" | "black") => void;
}

export function PlayAsSelector({ playAs, setPlayAs }: PlayAsSelectorProps) {
  return (
    <div className="mb-6">
      <label className="text-sm font-medium text-theme-muted mb-2 block"> <Trans>Play As</Trans> </label>
      <div className="flex gap-2">
        {(["white", "black"] as const).map((color) => (
          <button
            key={color}
            onClick={() => setPlayAs(color)}
            className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
              playAs === color
                ? "bg-brand-600 text-theme-on-accent"
                : "bg-theme-surface text-theme-muted hover:bg-theme-surface/80"
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full ${
                color === "white"
                  ? "bg-theme-panel border-2 border-theme-glass"
                  : "bg-theme-panel"
              }`}
            />
            {color.charAt(0).toUpperCase() + color.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

