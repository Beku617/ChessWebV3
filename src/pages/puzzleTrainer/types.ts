import type {
  PuzzleItem,
  PuzzleMode,
  PuzzleUserStats,
} from "../puzzles/types";

export type { PuzzleItem, PuzzleMode, PuzzleUserStats };

export type PuzzleStatus =
  | "solving"
  | "correct"
  | "wrong"
  | "showingSolution"
  | "loading";

export interface TrainerAttemptFeedback {
  xpAwarded: number;
  ratingChange: number;
  messages: string[];
  statusAfter:
    | "unseen"
    | "seen"
    | "solved"
    | "failed"
    | "review_due"
    | "mastered"
    | "archived";
  hintsUsed: number;
  repeatDecayMultiplier: number;
  isRepeat: boolean;
  isRated: boolean;
}

export const TRAINER_MODES: Array<{
  mode: PuzzleMode;
  label: string;
  route?: string;
}> = [
  { mode: "rated", label: "Rated", route: "/puzzles/train?mode=rated" },
  { mode: "review", label: "Review", route: "/puzzles/train?mode=review" },
  { mode: "random", label: "Random", route: "/puzzles/train?mode=random" },
  { mode: "library", label: "Library", route: "/puzzles/library" },
];

