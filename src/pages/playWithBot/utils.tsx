import { BotPersonality } from "../../data/botPersonalities";

export function getPlayStyleLabel(style: BotPersonality["playStyle"]) {
  return style;
}

export function getCategoryColor(category: BotPersonality["category"]) {
  switch (category) {
    case "beginner":
      return "bg-green-500/20 text-green-600";
    case "casual":
      return "bg-blue-500/20 text-blue-600";
    case "intermediate":
      return "bg-yellow-500/20 text-yellow-600";
    case "advanced":
      return "bg-orange-500/20 text-orange-600";
    case "master":
      return "bg-red-500/20 text-red-600";
    default:
      return "bg-theme-surface/20 text-theme-muted";
  }
}
