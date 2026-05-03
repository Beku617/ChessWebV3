import kingIcon from "../../assets/pieces/cburnett/king.svg";
import queenIcon from "../../assets/pieces/cburnett/queen.svg";
import rookIcon from "../../assets/pieces/cburnett/rook.svg";
import bishopIcon from "../../assets/pieces/cburnett/bishop.svg";
import knightIcon from "../../assets/pieces/cburnett/knight.svg";

const PIECE_ICON_BY_SAN_PREFIX: Record<string, string> = {
  K: kingIcon,
  Q: queenIcon,
  R: rookIcon,
  B: bishopIcon,
  N: knightIcon,
};

const PIECE_LABEL_BY_SAN_PREFIX: Record<string, string> = {
  K: "King",
  Q: "Queen",
  R: "Rook",
  B: "Bishop",
  N: "Knight",
};

function joinClasses(...classes: Array<string | undefined | null | false>) {
  return classes.filter(Boolean).join(" ");
}

function splitNotationByPiecePrefix(rawNotation: string): {
  prefix: string;
  piece: string;
  suffix: string;
} | null {
  const notation = String(rawNotation || "");
  if (!notation) return null;

  let index = 0;
  while (index < notation.length && /[\d.\s]/.test(notation[index])) {
    index += 1;
  }

  const piece = notation[index]?.toUpperCase() || "";
  if (!(piece in PIECE_ICON_BY_SAN_PREFIX)) {
    return null;
  }

  return {
    prefix: notation.slice(0, index),
    piece,
    suffix: notation.slice(index + 1),
  };
}

interface MoveNotationProps {
  notation: string;
  className?: string;
  textClassName?: string;
  iconClassName?: string;
}

export function MoveNotation({
  notation,
  className,
  textClassName,
  iconClassName,
}: MoveNotationProps) {
  const split = splitNotationByPiecePrefix(notation);

  if (!split) {
    return <span className={joinClasses("truncate", textClassName)}>{notation}</span>;
  }

  const iconSrc = PIECE_ICON_BY_SAN_PREFIX[split.piece];
  const iconLabel = PIECE_LABEL_BY_SAN_PREFIX[split.piece] || "Piece";

  return (
    <span
      className={joinClasses(
        "inline-flex max-w-full items-baseline gap-[0.12em] truncate",
        className,
      )}
    >
      {split.prefix ? <span className={textClassName}>{split.prefix}</span> : null}
      <img
        src={iconSrc}
        alt={iconLabel}
        className={joinClasses(
          "inline-block h-[1.15em] w-[1.15em] shrink-0 align-[-0.1em]",
          iconClassName,
        )}
      />
      <span className={joinClasses("truncate", textClassName)}>{split.suffix}</span>
    </span>
  );
}

