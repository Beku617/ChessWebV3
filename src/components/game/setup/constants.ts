import { BotPersonality } from "../../../data/botPersonalities";
import { INFINITY_SYMBOL } from "../../../constants";

export type TabType = "bots" | "custom";
export type BotCategory = BotPersonality["category"];

export const categoryLabels: Record<BotCategory, string> = {
  beginner: "Beginner",
  casual: "Casual",
  intermediate: "Intermediate",
  advanced: "Advanced",
  master: "Master",
};

export const categoryColors: Record<BotCategory, string> = {
  beginner: "bg-green-500",
  casual: "bg-blue-500",
  intermediate: "bg-yellow-500",
  advanced: "bg-orange-500",
  master: "bg-red-500",
};

export const categories: BotCategory[] = [
  "beginner",
  "casual",
  "intermediate",
  "advanced",
  "master",
];

export const timeOptions = [
  { label: "1 min", initial: 60, increment: 0 },
  { label: "3 min", initial: 180, increment: 0 },
  { label: "5 min", initial: 300, increment: 0 },
  { label: "10 min", initial: 600, increment: 0 },
  { label: "3+2", initial: 180, increment: 2 },
  { label: "5+3", initial: 300, increment: 3 },
  { label: "15+10", initial: 900, increment: 10 },
  { label: INFINITY_SYMBOL, initial: 0, increment: 0 },
];
