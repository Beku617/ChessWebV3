export interface LearnLesson {
  slug: string;
  title: string;
  subtitle?: string;
  fen: string;
  content: string;
  order: number;
}

export interface LearnCourse {
  slug: string;
  mockId: string;
  title: string;
  description: string;
  category: string;
  author: string;
  level: string;
  image: string;
  lessons: LearnLesson[];
}

export const learnCourses: LearnCourse[] = [
  {
    slug: "RuyLopezOpening",
    mockId: "1",
    title: "Mastering the Ruy Lopez",
    description:
      "Learn one of the most classical and strategic openings in chess history.",
    category: "Openings",
    author: "GM Martinez",
    level: "Intermediate",
    image: "🏰",
    lessons: [
      {
        slug: "Lesson1",
        title: "Introduction to the Ruy Lopez",
        subtitle: "Understanding the fundamentals",
        fen: "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
        content:
          "The Ruy Lopez begins with 1.e4 e5 2.Nf3 Nc6 3.Bb5. Named after the 16th-century Spanish priest Ruy López de Segura, this is one of the oldest and most deeply analyzed openings in chess. White develops the bishop to b5, indirectly pressuring the e5 pawn through the knight on c6.",
        order: 1,
      },
      {
        slug: "Lesson2",
        title: "The Morphy Defense",
        subtitle: "Black's most popular reply",
        fen: "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
        content:
          "After 3...a6, Black plays the Morphy Defense — challenging White's bishop immediately. White must decide: retreat with 4.Ba4 (most common), exchange on c6 (Exchange Variation), or maintain the tension. The move 4.Ba4 preserves the bishop while keeping pressure on the knight.",
        order: 2,
      },
      {
        slug: "Lesson3",
        title: "The Closed Ruy Lopez",
        subtitle: "Positional maneuvering",
        fen: "r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 4 6",
        content:
          "After 4.Ba4 Nf6 5.O-O Be7, we reach the Closed Ruy Lopez — the main tabiya of the opening. White typically continues with 6.Re1, preparing to support the e4 center. The position is rich in strategic ideas: White aims for a long-term space advantage while Black seeks counterplay.",
        order: 3,
      },
      {
        slug: "Lesson4",
        title: "The Marshall Attack",
        subtitle: "A daring gambit",
        fen: "r1bq1rk1/2p1bppp/p1n2n2/1p1pp3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 w - d6 0 9",
        content:
          "The Marshall Attack arises after 5...Be7 6.Re1 b5 7.Bb3 O-O 8.c3 d5!? — Black sacrifices a pawn for dynamic counterplay against White's king. This legendary gambit has been a weapon of top grandmasters for over a century and remains theoretically critical today.",
        order: 4,
      },
      {
        slug: "Lesson5",
        title: "The Berlin Defense",
        subtitle: "The solid wall",
        fen: "r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
        content:
          "The Berlin Defense (3...Nf6) became world-famous when Kramnik used it to neutralize Kasparov in the 2000 World Championship. After 4.O-O Nxe4 5.d4 Nd6 6.Bxc6 dxc6 7.dxe5 Nf5 8.Qxd8+ Kxd8, the resulting endgame is notoriously hard for White to crack despite the extra pawn.",
        order: 5,
      },
    ],
  },
  {
    slug: "PawnStructures101",
    mockId: "2",
    title: "Pawn Structures 101",
    description:
      "Master the building blocks of chess strategy through pawn structure understanding.",
    category: "Strategy",
    author: "IM Sarah Lee",
    level: "Beginner",
    image: "♟️",
    lessons: [
      {
        slug: "Lesson1",
        title: "The Isolated Queen Pawn",
        subtitle: "Strength or weakness?",
        fen: "r1bqr1k1/pp3ppp/2nb1n2/3p4/3P4/2NB1N2/PP3PPP/R1BQR1K1 w - - 0 10",
        content:
          "An isolated queen pawn (IQP) is a d-pawn with no neighboring friendly pawns on the c or e files. While it can become a weakness in endgames, the IQP provides dynamic middlegame chances: control of key squares like c5 and e5, plus open files for rook activity.",
        order: 1,
      },
      {
        slug: "Lesson2",
        title: "The Pawn Chain",
        subtitle: "Attacking the base",
        fen: "r1bqkb1r/pp1n1ppp/4pn2/2ppP3/3P4/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 6",
        content:
          "A pawn chain is a diagonal line of connected pawns. The golden rule: attack the base of the chain! In the French Defense structure shown here, Black should target d4 (the base of White's chain) while White aims to undermine Black's e6 pawn.",
        order: 2,
      },
      {
        slug: "Lesson3",
        title: "Doubled Pawns",
        subtitle: "When two are weaker than one",
        fen: "r1bqkbnr/pp1p1ppp/2p5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4",
        content:
          "Doubled pawns occur when two pawns of the same color occupy the same file. They reduce pawn mobility and create structural weaknesses, but they may also open adjacent files for rooks. Knowing when doubled pawns are acceptable is a critical strategic skill.",
        order: 3,
      },
    ],
  },
  {
    slug: "RookEndgames",
    mockId: "3",
    title: "Rook Endgames Simplified",
    description:
      "Essential rook endgame techniques every serious player must know.",
    category: "Endgame",
    author: "GM Johnson",
    level: "Advanced",
    image: "♜",
    lessons: [
      {
        slug: "Lesson1",
        title: "The Lucena Position",
        subtitle: "The most important endgame position",
        fen: "1K1k4/1P6/8/8/8/8/1r6/5R2 w - - 0 1",
        content:
          "The Lucena Position is the single most important rook endgame position to master. White has a pawn on the 7th rank with the king sheltering in front of it. The winning technique — known as 'building a bridge' — uses the rook to shield the king from checks so the pawn can promote.",
        order: 1,
      },
      {
        slug: "Lesson2",
        title: "The Philidor Position",
        subtitle: "The ultimate defensive technique",
        fen: "4k3/R7/8/4KP2/8/8/8/3r4 w - - 0 1",
        content:
          "The Philidor Position is the most important defensive technique in rook endgames. The defending side places the rook on the 6th rank to cut off the enemy king, then switches to giving vertical checks from behind once the pawn advances to the 6th rank.",
        order: 2,
      },
      {
        slug: "Lesson3",
        title: "Rook Behind Passed Pawn",
        subtitle: "Tarrasch's golden rule",
        fen: "8/8/4k3/8/R3P3/8/8/4K2r w - - 0 1",
        content:
          "Tarrasch's rule states: always place your rook behind a passed pawn, whether it belongs to you or your opponent. When behind your own pawn, the rook's activity increases as the pawn advances. When behind the enemy's, the rook maximally restricts it.",
        order: 3,
      },
    ],
  },
  {
    slug: "AttackingTheKing",
    mockId: "4",
    title: "Attacking the King",
    description:
      "Learn the art of launching decisive attacks against the enemy king.",
    category: "Middlegame",
    author: "GM Tal Fan",
    level: "Intermediate",
    image: "⚔️",
    lessons: [
      {
        slug: "Lesson1",
        title: "Open File Attacks",
        subtitle: "Using open files to invade",
        fen: "r1b1r1k1/ppq2ppp/2n2n2/2bp4/8/2N1BN2/PPP1QPPP/R4RK1 w - - 0 11",
        content:
          "Open files leading toward the enemy king are highways for your heavy pieces. When the opponent castles kingside, look for ways to open the g or h files. Combine rook lifts with coordinated queen and minor piece play to create devastating attacks.",
        order: 1,
      },
      {
        slug: "Lesson2",
        title: "The Greek Gift Sacrifice",
        subtitle: "The classic Bxh7+ sacrifice",
        fen: "r1bq1rk1/pppn1ppp/4pn2/3p4/1bBP4/2N1PN2/PPQ2PPP/R1B1K2R w KQ - 0 7",
        content:
          "The Greek Gift sacrifice (Bxh7+) is one of the most iconic attacking patterns in chess. After sacrificing the bishop, the queen and knight work together to deliver a decisive king-hunt. Key conditions: a knight on f3, a queen ready for h5, and an open diagonal to h7.",
        order: 2,
      },
      {
        slug: "Lesson3",
        title: "Piece Coordination in Attack",
        subtitle: "Bringing all forces together",
        fen: "r4rk1/pp1bqppp/2n1pn2/2pp4/3P4/2NBPN2/PPQ2PPP/R3K2R w KQ - 0 9",
        content:
          "A successful attack requires multiple pieces working in harmony. A lone attacker rarely succeeds. Learn to aim all your pieces toward the enemy king, create threats that force defensive concessions, and time your breakthrough for maximum impact.",
        order: 3,
      },
    ],
  },
];

/** Map a mockData course ID to the route path for its first lesson. */
export function getCourseEntryPath(mockId: string): string {
  const course = learnCourses.find((c) => c.mockId === mockId);
  if (!course || course.lessons.length === 0) return "/learn";
  return `/learn/${course.slug}/${course.lessons[0].slug}`;
}

/** Find a course by its URL slug. */
export function findCourseBySlug(slug: string): LearnCourse | undefined {
  return learnCourses.find((c) => c.slug === slug);
}

/** Find a lesson within a course by slug. */
export function findLessonBySlug(
  course: LearnCourse,
  lessonSlug: string,
): LearnLesson | undefined {
  return course.lessons.find((l) => l.slug === lessonSlug);
}
