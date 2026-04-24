import { BotPersonality } from "../../data/botPersonalities";

export type CategoryFilter = "all" | BotPersonality["category"];

export interface TimeOption {
  label: string;
  initial: number;
  increment: number;
}

export const TIME_OPTIONS: TimeOption[] = [
  { label: "1+0", initial: 60, increment: 0 },
  { label: "3+0", initial: 180, increment: 0 },
  { label: "5+0", initial: 300, increment: 0 },
  { label: "10+0", initial: 600, increment: 0 },
  { label: "10+5", initial: 600, increment: 5 },
  { label: "15+10", initial: 900, increment: 10 },
];

export const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "All Bots" },
  { key: "beginner", label: "Beginner" },
  { key: "casual", label: "Casual" },
  { key: "intermediate", label: "Intermediate" },
  { key: "advanced", label: "Advanced" },
  { key: "master", label: "Master" },
];

export const BOARD_FRAME = 16;
