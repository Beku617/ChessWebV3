export interface TimeFormat {
  id: string;
  name: string;
  time: string;
  displayTime: string;
  description: string;
  rating: number;
  icon: string;
}

export interface LiveGame {
  id: string;
  players: { white: string; black: string };
  timeControl: string;
  viewers: number;
  status: "playing" | "starting";
}

export interface RecentMatch {
  id: string;
  opponent: string;
  result: "win" | "loss" | "draw";
  timeControl: string;
  date: string;
  ratingChange: number;
}

export interface PuzzleItem {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  themes: string[];
  description: string;
  icon: string;
  fen: string;
  solution: string[];
  rating: number;
  isWhiteToMove: boolean;
}

export interface Course {
  id: string;
  title: string;
  category: "Openings" | "Middlegame" | "Endgame" | "Strategy";
  lessons: number;
  progress: number;
  author: string;
  image: string; // image path or placeholder
  level: "Beginner" | "Intermediate" | "Advanced";
}

export const timeFormats: TimeFormat[] = [
  {
    id: "bullet",
    name: "Bullet",
    time: "1+0",
    displayTime: "1 minute",
    description: "60 seconds, no increment",
    rating: 1756,
    icon: "",
  },
  {
    id: "blitz",
    name: "Blitz",
    time: "3+0",
    displayTime: "3 minutes",
    description: "3 minutes, no increment",
    rating: 1823,
    icon: "",
  },
  {
    id: "rapid",
    name: "Rapid",
    time: "10+5",
    displayTime: "10 minutes",
    description: "10 minutes, 5 second increment",
    rating: 1891,
    icon: "",
  },
];

export const liveGames: LiveGame[] = [
  {
    id: "1",
    players: { white: "Magnus_C", black: "HikaruN" },
    timeControl: "3+0",
    viewers: 15234,
    status: "playing",
  },
  {
    id: "2",
    players: { white: "LevonA", black: "FabianoC" },
    timeControl: "5+3",
    viewers: 8921,
    status: "playing",
  },
  {
    id: "3",
    players: { white: "WesleyS", black: "IanN" },
    timeControl: "1+0",
    viewers: 6543,
    status: "starting",
  },
];

export const recentMatches: RecentMatch[] = [
  {
    id: "1",
    opponent: "ChessMaster99",
    result: "win",
    timeControl: "10+5",
    date: "2 hours ago",
    ratingChange: +12,
  },
  {
    id: "2",
    opponent: "QueenGambit",
    result: "loss",
    timeControl: "3+0",
    date: "5 hours ago",
    ratingChange: -8,
  },
  {
    id: "3",
    opponent: "RookTakesPawn",
    result: "draw",
    timeControl: "10+5",
    date: "1 day ago",
    ratingChange: +1,
  },
  {
    id: "4",
    opponent: "KnightRider",
    result: "win",
    timeControl: "1+0",
    date: "2 days ago",
    ratingChange: +15,
  },
];

export const puzzles: PuzzleItem[] = [
  {
    id: "1",
    title: "Mate in 2",
    difficulty: "Easy",
    themes: ["Back Rank", "Queen Sac"],
    description: "Find the winning move for White.",
    icon: "",
    fen: "6k1/5ppp/8/8/8/8/1Q3PPP/6K1 w - - 0 1",
    solution: ["Qb8+", "Qxf8#"],
    rating: 1100,
    isWhiteToMove: true,
  },
  {
    id: "2",
    title: "Fork Tactic",
    difficulty: "Medium",
    themes: ["Knight Fork", "Double Attack"],
    description: "Black to move and win material.",
    icon: "",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    solution: ["Qxf7#"],
    rating: 1200,
    isWhiteToMove: true,
  },
  {
    id: "3",
    title: "Endgame Magic",
    difficulty: "Hard",
    themes: ["Promotion", "Opposition"],
    description: "White to move and promote.",
    icon: "",
    fen: "8/8/8/8/8/4k3/4P3/4K3 w - - 0 1",
    solution: ["Kf1"],
    rating: 1600,
    isWhiteToMove: true,
  },
  {
    id: "4",
    title: "Pin to Win",
    difficulty: "Medium",
    themes: ["Pin", "Skewer"],
    description: "Exploit the pinned piece.",
    icon: "",
    fen: "r2qkb1r/ppp2ppp/2n1bn2/4p3/4P3/1PN2N2/PBPP1PPP/R2QKB1R w KQkq - 0 6",
    solution: ["Bb5"],
    rating: 1350,
    isWhiteToMove: true,
  },
  {
    id: "5",
    title: "Greek Gift",
    difficulty: "Hard",
    themes: ["Sacrifice", "King Hunt"],
    description: "Classic bishop sacrifice on h7.",
    icon: "",
    fen: "r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 w - - 0 6",
    solution: ["Bxh7+"],
    rating: 1550,
    isWhiteToMove: true,
  },
  {
    id: "6",
    title: "Smothered Mate",
    difficulty: "Hard",
    themes: ["Checkmate", "Knight"],
    description: "Beautiful mate with the knight.",
    icon: "",
    fen: "r1b1kb1r/pppp1Npp/5n2/8/3nq3/8/PPPPBPPP/RNBQK2R b KQkq - 0 1",
    solution: ["Qxe2#"],
    rating: 1500,
    isWhiteToMove: false,
  },
];

export const courses: Course[] = [
  {
    id: "1",
    title: "Mastering the Ruy Lopez",
    category: "Openings",
    lessons: 12,
    progress: 45,
    author: "GM Martinez",
    image: "",
    level: "Intermediate",
  },
  {
    id: "2",
    title: "Pawn Structures 101",
    category: "Strategy",
    lessons: 8,
    progress: 10,
    author: "IM Sarah Lee",
    image: "",
    level: "Beginner",
  },
  {
    id: "3",
    title: "Rook Endgames Simplified",
    category: "Endgame",
    lessons: 15,
    progress: 0,
    author: "GM Johnson",
    image: "",
    level: "Advanced",
  },
  {
    id: "4",
    title: "Attacking the King",
    category: "Middlegame",
    lessons: 10,
    progress: 80,
    author: "GM Tal Fan",
    image: "",
    level: "Intermediate",
  },
];
