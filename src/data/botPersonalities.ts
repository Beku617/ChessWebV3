import { PlayStyle } from "../chess/StockfishEngine";

export interface BotPersonality {
  id: string;
  name: string;
  avatar: string; // initials or image path
  avatarUrl?: string; // actual image URL
  rating: number;
  title?: string; // GM, IM, etc.
  description: string;
  personality: string; // short tagline
  playStyle: PlayStyle;
  skillLevel: number; // Stockfish skill level 0-20
  depth: number; // search depth
  thinkTimeMs: number; // min think time
  blunderChance: number; // 0-1, chance to make a random move instead
  aggressiveness: number; // -100 to 100 (contempt)
  openingBook: boolean; // whether to use opening book
  category: "beginner" | "casual" | "intermediate" | "advanced" | "master";
}

export const botPersonalities: BotPersonality[] = [
  // ===== BEGINNER BOTS (Rating 250-600) =====
  {
    id: "nelson",
    name: "Nelson",
    avatar: "",
    rating: 250,
    description:
      "Just learning the rules! Makes lots of mistakes and hangs pieces frequently.",
    personality: "Oops, I hung my queen again!",
    playStyle: "random",
    skillLevel: 0,
    depth: 1,
    thinkTimeMs: 500,
    blunderChance: 0.4,
    aggressiveness: 0,
    openingBook: false,
    category: "beginner",
  },
  {
    id: "martin",
    name: "Martin",
    avatar: "",
    rating: 350,
    description:
      "A friendly grandpa who plays chess casually. Very forgiving opponent.",
    personality: "Let's have a nice game!",
    playStyle: "defensive",
    skillLevel: 0,
    depth: 2,
    thinkTimeMs: 800,
    blunderChance: 0.35,
    aggressiveness: -30,
    openingBook: false,
    category: "beginner",
  },
  {
    id: "wendy",
    name: "Wendy",
    avatar: "",
    rating: 450,
    description: "A young player learning the basics. Sometimes sees tactics!",
    personality: "I'm getting better every day!",
    playStyle: "balanced",
    skillLevel: 1,
    depth: 2,
    thinkTimeMs: 1000,
    blunderChance: 0.3,
    aggressiveness: 10,
    openingBook: false,
    category: "beginner",
  },
  {
    id: "tommy",
    name: "Tommy",
    avatar: "",
    rating: 550,
    description: "Likes to attack but often leaves pieces undefended.",
    personality: "Attack! Attack! Attack!",
    playStyle: "aggressive",
    skillLevel: 1,
    depth: 3,
    thinkTimeMs: 1000,
    blunderChance: 0.25,
    aggressiveness: 50,
    openingBook: false,
    category: "beginner",
  },

  // ===== CASUAL BOTS (Rating 600-1000) =====
  {
    id: "elena",
    name: "Elena",
    avatar: "",
    rating: 650,
    description: "A club player who enjoys positional chess.",
    personality: "Slow and steady wins the race.",
    playStyle: "defensive",
    skillLevel: 2,
    depth: 4,
    thinkTimeMs: 1500,
    blunderChance: 0.2,
    aggressiveness: -20,
    openingBook: true,
    category: "casual",
  },
  {
    id: "pablo",
    name: "Pablo",
    avatar: "",
    rating: 750,
    description: "Loves gambits and sacrifices. Sometimes they work!",
    personality: "Fortune favors the bold!",
    playStyle: "aggressive",
    skillLevel: 3,
    depth: 4,
    thinkTimeMs: 1500,
    blunderChance: 0.18,
    aggressiveness: 60,
    openingBook: true,
    category: "casual",
  },
  {
    id: "grace",
    name: "Grace",
    avatar: "",
    rating: 850,
    description: "A patient player who waits for your mistakes.",
    personality: "I'll wait for my chance.",
    playStyle: "defensive",
    skillLevel: 4,
    depth: 5,
    thinkTimeMs: 2000,
    blunderChance: 0.15,
    aggressiveness: -40,
    openingBook: true,
    category: "casual",
  },
  {
    id: "sven",
    name: "Sven",
    avatar: "",
    rating: 950,
    description: "Solid player with good tactical awareness.",
    personality: "Let's see what you've got!",
    playStyle: "balanced",
    skillLevel: 5,
    depth: 6,
    thinkTimeMs: 2000,
    blunderChance: 0.12,
    aggressiveness: 0,
    openingBook: true,
    category: "casual",
  },

  // ===== INTERMEDIATE BOTS (Rating 1000-1400) =====
  {
    id: "lin",
    name: "Lin",
    avatar: "",
    rating: 1050,
    description: "Studies openings and knows basic endgames.",
    personality: "Theory is important!",
    playStyle: "balanced",
    skillLevel: 6,
    depth: 7,
    thinkTimeMs: 2500,
    blunderChance: 0.1,
    aggressiveness: 10,
    openingBook: true,
    category: "intermediate",
  },
  {
    id: "fatima",
    name: "Fatima",
    avatar: "",
    rating: 1150,
    description: "Strong positional understanding. Controls the center well.",
    personality: "The center is key!",
    playStyle: "defensive",
    skillLevel: 7,
    depth: 8,
    thinkTimeMs: 2500,
    blunderChance: 0.08,
    aggressiveness: -15,
    openingBook: true,
    category: "intermediate",
  },
  {
    id: "boris",
    name: "Boris",
    avatar: "",
    rating: 1250,
    description: "Aggressive Russian style. Will sacrifice for the attack!",
    personality: "Tal is my hero!",
    playStyle: "aggressive",
    skillLevel: 8,
    depth: 9,
    thinkTimeMs: 3000,
    blunderChance: 0.06,
    aggressiveness: 70,
    openingBook: true,
    category: "intermediate",
  },
  {
    id: "maria",
    name: "Maria",
    avatar: "",
    rating: 1350,
    description: "Chess teacher. Plays instructive, educational chess.",
    personality: "Every move teaches something.",
    playStyle: "balanced",
    skillLevel: 9,
    depth: 10,
    thinkTimeMs: 3000,
    blunderChance: 0.05,
    aggressiveness: 5,
    openingBook: true,
    category: "intermediate",
  },

  // ===== ADVANCED BOTS (Rating 1400-1800) =====
  {
    id: "chen",
    name: "Chen",
    avatar: "",
    rating: 1450,
    description: "Computer scientist who calculates deep variations.",
    personality: "I see 10 moves ahead!",
    playStyle: "balanced",
    skillLevel: 10,
    depth: 12,
    thinkTimeMs: 3000,
    blunderChance: 0.04,
    aggressiveness: 0,
    openingBook: true,
    category: "advanced",
  },
  {
    id: "anna",
    name: "Anna",
    avatar: "",
    rating: 1550,
    title: "WCM",
    description: "Woman Candidate Master. Excellent endgame technique.",
    personality: "The endgame is where games are won.",
    playStyle: "defensive",
    skillLevel: 11,
    depth: 13,
    thinkTimeMs: 3000,
    blunderChance: 0.03,
    aggressiveness: -25,
    openingBook: true,
    category: "advanced",
  },
  {
    id: "viktor",
    name: "Viktor",
    avatar: "",
    rating: 1650,
    title: "CM",
    description: "Candidate Master. Plays principled, classical chess.",
    personality: "Classics never go out of style.",
    playStyle: "balanced",
    skillLevel: 13,
    depth: 14,
    thinkTimeMs: 3000,
    blunderChance: 0.02,
    aggressiveness: 15,
    openingBook: true,
    category: "advanced",
  },
  {
    id: "yuki",
    name: "Yuki",
    avatar: "",
    rating: 1750,
    title: "FM",
    description: "FIDE Master. Unpredictable and creative.",
    personality: "Expect the unexpected!",
    playStyle: "random",
    skillLevel: 14,
    depth: 15,
    thinkTimeMs: 3000,
    blunderChance: 0.015,
    aggressiveness: 30,
    openingBook: true,
    category: "advanced",
  },

  // ===== MASTER BOTS (Rating 1800-2500+) =====
  {
    id: "igor",
    name: "Igor",
    avatar: "",
    rating: 1900,
    title: "FM",
    description: "FIDE Master with aggressive attacking style.",
    personality: "The attack is the best defense!",
    playStyle: "aggressive",
    skillLevel: 15,
    depth: 16,
    thinkTimeMs: 3000,
    blunderChance: 0.01,
    aggressiveness: 50,
    openingBook: true,
    category: "master",
  },
  {
    id: "sophia",
    name: "Sophia",
    avatar: "",
    rating: 2000,
    title: "IM",
    description: "International Master. Rock solid defense.",
    personality: "You cannot break through!",
    playStyle: "defensive",
    skillLevel: 16,
    depth: 18,
    thinkTimeMs: 3000,
    blunderChance: 0.008,
    aggressiveness: -50,
    openingBook: true,
    category: "master",
  },
  {
    id: "magnus",
    name: "Maximus",
    avatar: "",
    rating: 2200,
    title: "IM",
    description: "International Master. Plays like a machine.",
    personality: "Precision is everything.",
    playStyle: "balanced",
    skillLevel: 18,
    depth: 20,
    thinkTimeMs: 3000,
    blunderChance: 0.005,
    aggressiveness: 10,
    openingBook: true,
    category: "master",
  },
  {
    id: "kasparov",
    name: "Alexandr",
    avatar: "",
    rating: 2500,
    title: "GM",
    description: "Grandmaster level. Nearly impossible to beat!",
    personality: "Chess is life.",
    playStyle: "aggressive",
    skillLevel: 20,
    depth: 22,
    thinkTimeMs: 3000,
    blunderChance: 0,
    aggressiveness: 40,
    openingBook: true,
    category: "master",
  },
];

const CATEGORY_BOT_PROFILE_PICS: Record<BotPersonality["category"], string> = {
  beginner: "/BotProPic/beginner-bot.svg",
  casual: "/BotProPic/casual-bot.svg",
  intermediate: "/BotProPic/intermediate-bot.svg",
  advanced: "/BotProPic/advanced-bot.svg",
  master: "/BotProPic/master-bot.svg",
};

for (const bot of botPersonalities) {
  bot.avatarUrl = CATEGORY_BOT_PROFILE_PICS[bot.category];
}

// Get bots by category
export function getBotsByCategory(category: BotPersonality["category"]) {
  return botPersonalities.filter((bot) => bot.category === category);
}

// Get bot by ID
export function getBotById(id: string) {
  return botPersonalities.find((bot) => bot.id === id);
}

// Get bots within rating range
export function getBotsByRating(minRating: number, maxRating: number) {
  return botPersonalities.filter(
    (bot) => bot.rating >= minRating && bot.rating <= maxRating,
  );
}

// Get a random bot from a category
export function getRandomBot(category?: BotPersonality["category"]) {
  const bots = category ? getBotsByCategory(category) : botPersonalities;
  return bots[Math.floor(Math.random() * bots.length)];
}
