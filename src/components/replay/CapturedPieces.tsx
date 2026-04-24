import { useTranslation } from "react-i18next";

interface CapturedPiecesProps {
  capturedByWhite: string[];
  capturedByBlack: string[];
}

const pieceGlyph: Record<string, string> = {
  p: "P",
  n: "N",
  b: "B",
  r: "R",
  q: "Q",
  k: "K",
  P: "P",
  N: "N",
  B: "B",
  R: "R",
  Q: "Q",
  K: "K",
};

function PieceList({ pieces, label }: { pieces: string[]; label: string }) {
  const { t } = useTranslation();
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2">
      <div className="text-xs font-semibold text-gray-500 flex items-center gap-2 mb-1">
        {label}
      </div>
      <div className="flex flex-wrap gap-1 text-xl min-h-[28px]">
        {pieces.length === 0 ? (
          <span className="text-gray-400 text-sm">
            {t("analysis.none", "None")}
          </span>
        ) : (
          pieces.map((p, i) => (
            <span key={i} className="text-gray-700 dark:text-gray-300">
              {pieceGlyph[p] || pieceGlyph[p.toLowerCase()] || p}
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
