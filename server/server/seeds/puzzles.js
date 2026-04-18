import Puzzle from "../models/Puzzle.js";

const initialPuzzles = [
  {
    title: "Mate in 2",
    difficulty: "Easy",
    category: "mate",
    description: "Find the winning move for White.",
    fen: "6k1/5ppp/8/8/8/8/1Q3PPP/6K1 w - - 0 1",
    solution: ["Qb8+", "Qxf8#"],
    rating: 1100,
    isWhiteToMove: true,
    mateIn: 2,
  },
  {
    title: "Scholar's Mate",
    difficulty: "Easy",
    category: "mate",
    description: "White to move and checkmate.",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    solution: ["Qxf7#"],
    rating: 800,
    isWhiteToMove: true,
    mateIn: 1,
  },
  {
    title: "Endgame Magic",
    difficulty: "Hard",
    category: "endgame",
    description: "White to move and promote.",
    fen: "8/8/8/8/8/4k3/4P3/4K3 w - - 0 1",
    solution: ["Kf1"],
    rating: 1600,
    isWhiteToMove: true,
    mateIn: 2,
  },
  {
    title: "Pin to Win",
    difficulty: "Medium",
    category: "tactics",
    description: "Exploit the pinned piece.",
    fen: "r2qkb1r/ppp2ppp/2n1bn2/4p3/4P3/1PN2N2/PBPP1PPP/R2QKB1R w KQkq - 0 6",
    solution: ["Bb5"],
    rating: 1350,
    isWhiteToMove: true,
    mateIn: 2,
  },
  {
    title: "Greek Gift",
    difficulty: "Hard",
    category: "tactics",
    description: "Classic bishop sacrifice on h7.",
    fen: "r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 w - - 0 6",
    solution: ["Bxh7+"],
    rating: 1550,
    isWhiteToMove: true,
    mateIn: 2,
  },
];

export async function seedPuzzles() {
  const count = await Puzzle.countDocuments();
  if (count > 0) return;

  await Puzzle.insertMany(initialPuzzles);
  console.log("Puzzles seeded successfully");
}
