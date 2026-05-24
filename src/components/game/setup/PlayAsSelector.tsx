import { Trans } from "react-i18next";
interface PlayAsSelectorProps {
  playAs: "white" | "black";
  setPlayAs: (color: "white" | "black") => void;
}

export function PlayAsSelector({ playAs, setPlayAs }: PlayAsSelectorProps) {
  return (
    <div className="mb-6">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block"> <Trans>Play As</Trans> </label>
      <div className="flex gap-2">
        {(["white", "black"] as const).map((color) => (
          <button
            key={color}
            onClick={() => setPlayAs(color)}
            className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
              playAs === color
                ? "bg-brand-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full ${
                color === "white"
                  ? "bg-white border-2 border-gray-300"
                  : "bg-gray-900"
              }`}
            />
            {color.charAt(0).toUpperCase() + color.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

