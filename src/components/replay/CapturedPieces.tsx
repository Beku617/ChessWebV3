import { useTranslation } from "react-i18next";
import { ChessPieceIcon } from "./chessPieceIcons";

interface CapturedPiecesProps {
  capturedByWhite: string[];
  capturedByBlack: string[];
}

function PieceList({ pieces, label }: { pieces: string[]; label: string }) {
  const { t } = useTranslation();
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2">
      <div className="text-xs font-semibold text-gray-500 flex items-center gap-2 mb-1">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
        {pieces.length === 0 ? (
          <span className="text-gray-400 text-sm">
            {t("analysis.none", "None")}
          </span>
        ) : (
          pieces.map((p, i) => (
            <span
              key={`${p}-${i}`}
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-white/80 dark:bg-gray-800/80"
            >
              <ChessPieceIcon piece={p} className="h-5 w-5" />
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export function CapturedPieces({
  capturedByWhite,
  capturedByBlack,
}: CapturedPiecesProps) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-3">
      <PieceList
        pieces={capturedByWhite}
        label={t("analysis.capturedByWhite", "Captured by White")}
      />
      <PieceList
        pieces={capturedByBlack}
        label={t("analysis.capturedByBlack", "Captured by Black")}
      />
    </div>
  );
}
