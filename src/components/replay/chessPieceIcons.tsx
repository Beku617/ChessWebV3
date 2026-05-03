import type { CSSProperties } from "react";

export type CburnettPieceCode =
  | "wK"
  | "wQ"
  | "wR"
  | "wB"
  | "wN"
  | "wP"
  | "bK"
  | "bQ"
  | "bR"
  | "bB"
  | "bN"
  | "bP";

const CBURNETT_BASE_URL = "https://lichess1.org/assets/piece/cburnett";

const PIECE_URLS: Record<CburnettPieceCode, string> = {
  wK: `${CBURNETT_BASE_URL}/wK.svg`,
  wQ: `${CBURNETT_BASE_URL}/wQ.svg`,
  wR: `${CBURNETT_BASE_URL}/wR.svg`,
  wB: `${CBURNETT_BASE_URL}/wB.svg`,
  wN: `${CBURNETT_BASE_URL}/wN.svg`,
  wP: `${CBURNETT_BASE_URL}/wP.svg`,
  bK: `${CBURNETT_BASE_URL}/bK.svg`,
  bQ: `${CBURNETT_BASE_URL}/bQ.svg`,
  bR: `${CBURNETT_BASE_URL}/bR.svg`,
  bB: `${CBURNETT_BASE_URL}/bB.svg`,
  bN: `${CBURNETT_BASE_URL}/bN.svg`,
  bP: `${CBURNETT_BASE_URL}/bP.svg`,
};

const PIECE_NAME: Record<Lowercase<string>, string> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

type ChessboardPieceRendererProps = {
  squareWidth: number;
  isDragging?: boolean;
};

export function toCburnettPieceCode(piece: string): CburnettPieceCode | null {
  if (!piece) return null;
  const trimmed = String(piece).trim();
  if (!trimmed) return null;

  if (trimmed.length === 2 && (trimmed[0] === "w" || trimmed[0] === "b")) {
    const maybeCode = `${trimmed[0]}${trimmed[1].toUpperCase()}` as CburnettPieceCode;
    return PIECE_URLS[maybeCode] ? maybeCode : null;
  }

  const symbol = trimmed[0];
  const isWhite = symbol === symbol.toUpperCase();
  const normalized = symbol.toLowerCase();
  if (!PIECE_NAME[normalized]) return null;

  return `${isWhite ? "w" : "b"}${normalized.toUpperCase()}` as CburnettPieceCode;
}

export function getCburnettPieceUrl(pieceCode: CburnettPieceCode): string {
  return PIECE_URLS[pieceCode];
}

function buildPieceLabel(pieceCode: CburnettPieceCode): string {
  const color = pieceCode[0] === "w" ? "white" : "black";
  const name = PIECE_NAME[pieceCode[1].toLowerCase()];
  return `${color} ${name}`;
}

export function createCburnettCustomPieces() {
  const pieces: Record<string, (props: ChessboardPieceRendererProps) => JSX.Element> = {};

  (Object.keys(PIECE_URLS) as CburnettPieceCode[]).forEach((pieceCode) => {
    const src = PIECE_URLS[pieceCode];
    const label = buildPieceLabel(pieceCode);
    pieces[pieceCode] = ({ squareWidth, isDragging }) => (
      <img
        src={src}
        alt={label}
        draggable={false}
        loading="lazy"
        decoding="async"
        style={{
          width: squareWidth,
          height: squareWidth,
          opacity: isDragging ? 0.82 : 1,
          pointerEvents: "none",
        }}
      />
    );
  });

  return pieces;
}

interface ChessPieceIconProps {
  piece: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function ChessPieceIcon({
  piece,
  className,
  style,
  title,
}: ChessPieceIconProps) {
  const pieceCode = toCburnettPieceCode(piece);

  if (!pieceCode) {
    return (
      <span className={className} style={style}>
        {piece}
      </span>
    );
  }

  const label = buildPieceLabel(pieceCode);
  return (
    <img
      src={PIECE_URLS[pieceCode]}
      alt={label}
      title={title || label}
      className={className}
      style={style}
      draggable={false}
      loading="lazy"
      decoding="async"
    />
  );
}
