import { useTranslation, Trans } from "react-i18next";
import type { PromotionPiece, PromotionState } from "./types";
import bishopIcon from "../../assets/pieces/cburnett/bishop.svg";
import knightIcon from "../../assets/pieces/cburnett/knight.svg";
import queenIcon from "../../assets/pieces/cburnett/queen.svg";
import rookIcon from "../../assets/pieces/cburnett/rook.svg";

interface PromotionModalProps {
  state: PromotionState;
  onSelect: (piece: PromotionPiece) => void;
}

const PIECE_ORDER: PromotionPiece[] = ["q", "r", "b", "n"];

const PIECE_LABELS: Record<PromotionPiece, string> = {
  q: "game.pieces.queen",
  r: "game.pieces.rook",
  b: "game.pieces.bishop",
  n: "game.pieces.knight",
};

const PIECE_ICONS: Record<PromotionPiece, string> = {
  q: queenIcon,
  r: rookIcon,
  b: bishopIcon,
  n: knightIcon,
};

export function PromotionModal({ state, onSelect }: PromotionModalProps) {
  const { t } = useTranslation();
  if (!state.isOpen || !state.color) return null;

  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("game.aria.choosePromotionPiece")}
        className="relative z-[91] w-[min(92%,420px)] rounded-2xl border border-white/15 bg-slate-950/95 p-5 shadow-2xl"
      >
        <h3 className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-slate-300"> <Trans>Choose Promotion</Trans> </h3>
        <div className="mt-4 grid grid-cols-4 gap-3">
          {PIECE_ORDER.map((piece) => (
            <button
              key={piece}
              type="button"
              onClick={() => onSelect(piece)}
              className="group flex h-20 flex-col items-center justify-center rounded-xl border border-white/15 bg-slate-900/80 transition hover:-translate-y-0.5 hover:border-brand-300/70 hover:bg-slate-800"
              aria-label={t("game.aria.promoteTo", {
                piece: t(PIECE_LABELS[piece]),
              })}
            >
              <img
                src={PIECE_ICONS[piece]}
                alt=""
                className="h-11 w-11 object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.45)]"
                draggable={false}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

