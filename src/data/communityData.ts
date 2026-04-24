/* ═══════════════════════════════════════════════════════
   Community Mock Data — NeonGambit
   ═══════════════════════════════════════════════════════ */

export interface CommunityPost {
  id: number;
  user: {
    name: string;
    handle: string;
    avatar: string; // initials or url
    rating: number;
    title?: "GM" | "IM" | "FM" | "WGM" | "CM"; // FIDE title
    verified?: boolean;
    online?: boolean;
  };
  content: string;
  pgn?: string; // optional PGN for mini board
  fen?: string; // optional FEN for position preview
  image?: string; // placeholder flag
  poll?: { question: string; options: { label: string; votes: number }[] };
  tags?: string[];
  likes: number;
  comments: number;
  shares: number;
  bookmarked?: boolean;
  liked?: boolean;
  time: string;
  gameResult?: { white: string; black: string; result: string; format: string };
}

export const COMMUNITY_POSTS: CommunityPost[] = [
  {
    id: 1,
    user: {
      name: "Magnus Carlsen",
      handle: "@magnuscarlsen",
      avatar: "MC",
      rating: 2830,
      title: "GM",
      verified: true,
      online: true,
    },
    content:
      "Just had an intense game against Hikaru! The endgame was tricky but managed to find the winning line. That Nd5 sacrifice was the key moment.",
    pgn: "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7",
    tags: ["#Endgame", "#Classical", "#WorldChess"],
    likes: 12500,
    comments: 842,
    shares: 1200,
    time: "2h ago",
    gameResult: {
      white: "Magnus Carlsen",
      black: "Hikaru Nakamura",
      result: "1-0",
      format: "Classical",
    },
  },
  {
    id: 2,
    user: {
      name: "Chess.com Official",
      handle: "@chesscom",
      avatar: "CC",
      rating: 0,
      verified: true,
      online: true,
    },
    content:
      "Tournament Update: The Candidates 2024 is heating up! Who is your pick to challenge the World Champion?\n\nVote below and share your predictions!",
    poll: {
      question: "Who will win the Candidates?",
      options: [
        { label: "Ian Nepomniachtchi", votes: 3420 },
        { label: "Fabiano Caruana", votes: 4100 },
        { label: "Alireza Firouzja", votes: 2890 },
        { label: "Hikaru Nakamura", votes: 5210 },
      ],
    },
    tags: ["#Candidates2024", "#WorldChess", "#Tournament"],
    likes: 8200,
    comments: 1200,
    shares: 890,
    time: "4h ago",
    image: "tournament",
  },
  {
    id: 3,
    user: {
      name: "Hikaru Nakamura",
      handle: "@gmhikaru",
      avatar: "HN",
      rating: 2788,
      title: "GM",
      verified: true,
      online: true,
    },
    content:
      "This puzzle absolutely destroyed me in Titled Tuesday. Can you find the winning move? White to play.",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    tags: ["#Puzzle", "#TitledTuesday", "#Tactics"],
    likes: 5100,
    comments: 320,
    shares: 450,
    time: "5h ago",
  },
  {
    id: 4,
    user: {
      name: "Levy Rozman",
      handle: "@gothamchess",
      avatar: "LR",
      rating: 2350,
      title: "IM",
      verified: true,
    },
    content:
      "New video dropping tomorrow: \"The Most Insane Sacrifice in Chess History\" — trust me, you've never seen this one before. The engine evaluation goes from +0.3 to +12.7 in one move.",
    tags: ["#Content", "#Sacrifice", "#ChessHistory"],
    likes: 15700,
    comments: 2100,
    shares: 3400,
    time: "6h ago",
  },
  {
    id: 5,
    user: {
      name: "Anna Cramling",
      handle: "@annacramling",
      avatar: "AC",
      rating: 2100,
      title: "WGM",
      verified: true,
      online: true,
    },
    content:
      "Beautiful checkmate pattern from my game today. The double bishop sacrifice followed by Qh7# was clean.\n\nAlways look for those diagonal batteries!",
    pgn: "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O",
    tags: ["#Checkmate", "#Tactics", "#Blitz"],
    likes: 4300,
    comments: 280,
    shares: 190,
    time: "8h ago",
    gameResult: {
      white: "Anna Cramling",
      black: "Opponent",
      result: "1-0",
      format: "Blitz 3+0",
    },
  },
  {
    id: 6,
    user: {
      name: "Eric Rosen",
      handle: "@ericrosen",
      avatar: "ER",
      rating: 2420,
      title: "IM",
      verified: true,
    },
    content:
      "Oh no, my queen was bait.\n\nStafford Gambit strikes again. My opponent resigned on move 14 after falling into the trap. Never gets old!",
    tags: ["#Gambit", "#Trap", "#Stafford"],
    likes: 9800,
    comments: 670,
    shares: 1500,
    time: "10h ago",
  },
];

/* ─── Trending Topics ─── */
export interface TrendingTopic {
  tag: string;
  posts: string;
  category: string;
}

export const TRENDING_TOPICS: TrendingTopic[] = [
  { tag: "#ChessOlympiad", posts: "24.5k", category: "Tournament" },
  { tag: "#Candidates2024", posts: "18.2k", category: "World Chess" },
  { tag: "Magnus vs Hikaru", posts: "12.8k", category: "Rivalry" },
  { tag: "#StaffordGambit", posts: "8.4k", category: "Opening" },
  { tag: "#TitledTuesday", posts: "6.1k", category: "Event" },
];

/* ─── Live Games ─── */
export interface LiveGame {
  white: { name: string; rating: number; title?: string };
  black: { name: string; rating: number; title?: string };
  format: string;
  viewers: number;
}

export const LIVE_GAMES: LiveGame[] = [
  {
    white: { name: "DrNykterstein", rating: 3280, title: "GM" },
    black: { name: "Firouzja2003", rating: 3150, title: "GM" },
    format: "Bullet 1+0",
    viewers: 12400,
  },
  {
    white: { name: "penguingm1", rating: 3100, title: "GM" },
    black: { name: "LachesisQ", rating: 2950, title: "GM" },
    format: "Blitz 3+0",
    viewers: 8200,
  },
  {
    white: { name: "DanielNaroditsky", rating: 3050, title: "GM" },
    black: { name: "nihalsarin", rating: 2980, title: "GM" },
    format: "Rapid 10+0",
    viewers: 4500,
  },
];

/* ─── Top Players Online ─── */
export interface OnlinePlayer {
  name: string;
  rating: number;
  title?: string;
  avatar: string;
  status: "playing" | "idle" | "streaming";
}

export const TOP_PLAYERS_ONLINE: OnlinePlayer[] = [
  {
    name: "Magnus Carlsen",
    rating: 2830,
    title: "GM",
    avatar: "MC",
    status: "playing",
  },
  {
    name: "Hikaru",
    rating: 2788,
    title: "GM",
    avatar: "HN",
    status: "streaming",
  },
  {
    name: "Alireza Firouzja",
    rating: 2777,
    title: "GM",
    avatar: "AF",
    status: "idle",
  },
  {
    name: "Fabiano Caruana",
    rating: 2786,
    title: "GM",
    avatar: "FC",
    status: "playing",
  },
  {
    name: "Daniel Naroditsky",
    rating: 2619,
    title: "GM",
    avatar: "DN",
    status: "streaming",
  },
];

/* ─── Puzzle Leaderboard ─── */
export interface PuzzleLeader {
  rank: number;
  name: string;
  rating: number;
  solved: number;
  avatar: string;
}

export const PUZZLE_LEADERBOARD: PuzzleLeader[] = [
  { rank: 1, name: "TacticsKing99", rating: 3150, solved: 14520, avatar: "TK" },
  { rank: 2, name: "PuzzleMaster", rating: 3080, solved: 12800, avatar: "PM" },
  { rank: 3, name: "ChessNinja", rating: 2990, solved: 11200, avatar: "CN" },
  { rank: 4, name: "EndgameWiz", rating: 2870, solved: 9800, avatar: "EW" },
  { rank: 5, name: "BlitzDemon", rating: 2810, solved: 8400, avatar: "BD" },
];

/* ─── Who to Follow ─── */
export interface SuggestedUser {
  name: string;
  handle: string;
  avatar: string;
  rating: number;
  title?: string;
  followers: string;
  bio: string;
}

export const SUGGESTED_USERS: SuggestedUser[] = [
  {
    name: "Daniil Dubov",
    handle: "@dubovcheats",
    avatar: "DD",
    rating: 2714,
    title: "GM",
    followers: "120k",
    bio: "Creative chess enjoyer",
  },
  {
    name: "Ding Liren",
    handle: "@dingliren",
    avatar: "DL",
    rating: 2780,
    title: "GM",
    followers: "250k",
    bio: "World Chess Champion",
  },
  {
    name: "Praggnanandhaa",
    handle: "@rpragchess",
    avatar: "RP",
    rating: 2747,
    title: "GM",
    followers: "180k",
    bio: "Indian chess prodigy",
  },
];

/* ─── Upcoming Events ─── */
export interface ChessEvent {
  name: string;
  date: string;
  type: "tournament" | "stream" | "puzzle" | "match";
  participants?: string;
}

export const UPCOMING_EVENTS: ChessEvent[] = [
  {
    name: "Titled Tuesday",
    date: "Today, 8PM",
    type: "tournament",
    participants: "1,200+",
  },
  {
    name: "Puzzle Storm Challenge",
    date: "Tomorrow",
    type: "puzzle",
    participants: "5,000+",
  },
  {
    name: "NeonGambit Arena",
    date: "Sat, Mar 1",
    type: "tournament",
    participants: "800+",
  },
  {
    name: "GM Showdown",
    date: "Sun, Mar 2",
    type: "match",
    participants: "Invite only",
  },
];

/* ─── Filter Tabs ─── */
export const COMMUNITY_TABS = [
  "For You",
  "Following",
  "Tournaments",
  "Games",
  "Puzzles",
  "Videos",
] as const;

export type CommunityTab = (typeof COMMUNITY_TABS)[number];
