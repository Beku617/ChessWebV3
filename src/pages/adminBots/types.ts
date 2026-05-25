export interface BotData {
  _id: string;
  name: string;
  avatar: string;
  avatarUrl: string;
  eloRating: number;
  difficulty: "beginner" | "casual" | "intermediate" | "advanced" | "master";
  category: string;
  title: string;
  quote: string;
  description: string;
  personality: string;
  countryCode: string;
  playStyle: "aggressive" | "defensive" | "balanced" | "random";
  skillLevel: number;
  depth: number;
  thinkTimeMs: number;
  blunderChance: number;
  aggressiveness: number;
  openingBook: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BotFormData {
  name: string;
  avatar: string;
  avatarFile: File | null;
  eloRating: number;
  difficulty: BotData["difficulty"];
  category: string;
  title: string;
  quote: string;
  description: string;
  personality: string;
  countryCode: string;
  playStyle: BotData["playStyle"];
  skillLevel: number;
  depth: number;
  thinkTimeMs: number;
  blunderChance: number;
  aggressiveness: number;
  openingBook: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface BotStats {
  total: number;
  active: number;
  inactive: number;
  byDifficulty: Record<string, number>;
}

export interface BotsResponse {
  bots: BotData[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  categories: string[];
}

export const DIFFICULTY_OPTIONS: {
  value: BotData["difficulty"];
  label: string;
  color: string;
}[] = [
  {
    value: "beginner",
    label: "Beginner",
    color: "bg-green-500/20 text-green-600",
  },
  {
    value: "casual",
    label: "Casual",
    color: "bg-blue-500/20 text-blue-600",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    color: "bg-yellow-500/20 text-yellow-600",
  },
  {
    value: "advanced",
    label: "Advanced",
    color: "bg-orange-500/20 text-orange-600",
  },
  {
    value: "master",
    label: "Master",
    color: "bg-red-500/20 text-red-600",
  },
];

export const PLAY_STYLE_OPTIONS: {
  value: BotData["playStyle"];
  label: string;
}[] = [
  { value: "balanced", label: "Balanced" },
  { value: "aggressive", label: "Aggressive" },
  { value: "defensive", label: "Defensive" },
  { value: "random", label: "Random" },
];

export const DEFAULT_BOT_FORM: BotFormData = {
  name: "",
  avatar: "",
  avatarFile: null,
  eloRating: 1200,
  difficulty: "beginner",
  category: "general",
  title: "",
  quote: "",
  description: "",
  personality: "",
  countryCode: "",
  playStyle: "balanced",
  skillLevel: 5,
  depth: 10,
  thinkTimeMs: 2000,
  blunderChance: 0.1,
  aggressiveness: 0,
  openingBook: true,
  isActive: true,
  sortOrder: 0,
};
