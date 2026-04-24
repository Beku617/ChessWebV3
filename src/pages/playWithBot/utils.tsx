import { BotPersonality } from "../../data/botPersonalities";

export function getPlayStyleLabel(style: BotPersonality["playStyle"]) {
  return style;
}

export function getCategoryColor(category: BotPersonality["category"]) {
  switch (category) {
    case "beginner":
      return "bg-green-500/20 text-green-600 dark:text-green-400";
    case "casual":
      return "bg-blue-500/20 text-blue-600 dark:text-blue-400";
    case "intermediate":
      return "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400";
    case "advanced":
      return "bg-orange-500/20 text-orange-600 dark:text-orange-400";
    case "master":
      return "bg-red-500/20 text-red-600 dark:text-red-400";
    default:
      return "bg-gray-500/20 text-gray-600 dark:text-gray-400";
  }
}
