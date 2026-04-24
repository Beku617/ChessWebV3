export interface AnalysisEntry {
  ply: number;
  cp?: number; // centipawn evaluation (positive favors White)
  mate?: number; // mate in N; sign indicates side to move wins
}

export interface GameHistory {
  _id: string;
  userId?: string;
  event: string;
  site: string;
  date: string; // "YYYY.MM.DD"
  round: string;
  white: string;
  black: string;
  result: string; // "1-0" | "0-1" | "1/2-1/2"
  variant?: "standard" | "chess960" | "threeCheck" | "kingOfHill" | "atomic";
  currentPosition: string;
  startingFen?: string;
  timeControl: string;
  utcDate: string;
  utcTime: string;
  startTime: string;
  endDate: string;
  endTime: string;
  whiteElo: number;
  blackElo: number;
  rated?: boolean;
  ratingBefore?: number;
  ratingAfter?: number;
  ratingDelta?: number;
  ratingDeviationBefore?: number;
  ratingDeviationAfter?: number;
  ratingDeviationDelta?: number;
  volatilityBefore?: number;
  volatilityAfter?: number;
  volatilityDelta?: number;
  isProvisional?: boolean;
  opponentRatingBefore?: number;
  opponentRatingAfter?: number;
  opponentRatingDelta?: number;
  opponentRatingDeviationBefore?: number;
  opponentRatingDeviationAfter?: number;
  opponentRatingDeviationDelta?: number;
  opponentVolatilityBefore?: number;
  opponentVolatilityAfter?: number;
  opponentVolatilityDelta?: number;
  opponentIsProvisional?: boolean;
  ratingPool?:
    | "bullet"
    | "blitz"
    | "rapid"
    | "classical"
    | "chess960Bullet"
    | "chess960Blitz"
    | "chess960Rapid"
    | "chess960Classical";
  eco: string;
  ecoUrl?: string;
  timezone?: string;
  link?: string;
  whiteUrl?: string;
  whiteCountry?: string;
  whiteTitle?: string;
  blackUrl?: string;
  blackCountry?: string;
  blackTitle?: string;
  moveText?: string;
  termination: string;
  moves: string[];
  pgn: string;
  playAs: "white" | "black";
  opponent: string;
  opponentLevel?: number;
  durationMs?: number;
  whiteCheckCount?: number;
  blackCheckCount?: number;
  createdAt: string;
  analysis?: AnalysisEntry[];
  moveTimes?: number[]; // milliseconds per move or elapsed; interpretation handled in UI
}
