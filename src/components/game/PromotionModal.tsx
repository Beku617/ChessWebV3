import type { PromotionPiece, PromotionState } from "./types";

interface PromotionModalProps {
  state: PromotionState;
  onSelect: (piece: PromotionPiece) => void;
}

const PIECE_ORDER: PromotionPiece[] = ["q", "r", "b", "n"];

const PIECE_LABELS: Record<PromotionPiece, string> = {
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight",
};

const PIECE_SYMBOLS = {
  w: {
    q: "♕",
    r: "♖",
    b: "♗",
    n: "♘",
  },
  b: {
    q: "♛",
    r: "♜",
    b: "♝",
    n: "♞",
  },
} as const;

export function PromotionModal({ state, onSelect }: PromotionModalProps) {
  if (!state.isOpen || !state.color) return null;

  const symbols = PIECE_SYMBOLS[state.color];

  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose promotion piece"
        className="relative z-[91] w-[min(92%,420px)] rounded-2xl border border-white/15 bg-slate-950/95 p-5 shadow-2xl"
      >
        <h3 className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
          Choose Promotion
        </h3>
        <div className="mt-4 grid grid-cols-4 gap-3">
          {PIECE_ORDER.map((piece) => (
            <button
              key={piece}
              type="button"
              onClick={() => onSelect(piece)}
              className="group flex h-20 flex-col items-center justify-center rounded-xl border border-white/15 bg-slate-900/80 transition hover:-translate-y-0.5 hover:border-brand-300/70 hover:bg-slate-800"
              aria-label={`Promote to ${PIECE_LABELS[piece]}`}
            >
              <span className="text-4xl leading-none text-slate-100">
                {symbols[piece]}
              </span>
              <span className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400 group-hover:text-brand-200">
                {PIECE_LABELS[piece]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

