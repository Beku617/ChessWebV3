import {
  LearnCourse,
  LearnLesson,
  LearnLessonStep,
} from "../models/index.js";

const learnSeedCourses = [
  {
    slug: "RuyLopezOpening",
    title: "Mastering the Ruy Lopez",
    subtitle: "Build a principled opening repertoire with clear plans",
    description:
      "Learn the core Ruy Lopez structures through guided positions, move selection, and strategic feedback.",
    category: "Openings",
    difficulty: "Intermediate",
    coverImage: "",
    icon: "♞",
    instructorName: "GM Elena Martinez",
    tags: ["ruy lopez", "opening", "classical chess"],
    isPublished: true,
    lessons: [
      {
        slug: "Lesson1",
        title: "The Core Setup",
        subtitle: "Understand why Bb5 creates long-term pressure",
        description:
          "You will play the first critical moves and learn how White starts to challenge Black's center.",
        orderIndex: 0,
        estimatedMinutes: 8,
        isPublished: true,
        steps: [
          {
            orderIndex: 0,
            title: "Develop with Purpose",
            instructionText: "White to move: play the classical Ruy Lopez bishop move.",
            explanationBeforeMove:
              "This bishop move targets the c6-knight, which defends e5. It builds immediate strategic pressure.",
            fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
            sideToMove: "white",
            acceptedMoves: ["Bb5", "f1b5"],
            feedbackCorrect:
              "Correct. Bb5 is the signature move of the Ruy Lopez and begins positional pressure on e5.",
            feedbackWrong:
              "Not quite. The lesson idea is to challenge Black's e5 setup by pinning pressure through Bb5.",
            hintText: "Look for a bishop move that attacks the knight on c6.",
            autoAdvance: false,
            keepPositionOnWrong: false,
          },
          {
            orderIndex: 1,
            title: "Challenge the Bishop",
            instructionText:
              "Now play as Black: choose the standard move that questions White's bishop.",
            explanationBeforeMove:
              "The most thematic response is to ask White's bishop where it belongs before building further.",
            fen: "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
            sideToMove: "black",
            acceptedMoves: ["a6", "a7a6"],
            feedbackCorrect:
              "Exactly. ...a6 is the Morphy Defense and a key move in most Ruy Lopez lines.",
            feedbackWrong:
              "This lesson focuses on the Morphy Defense idea. Try ...a6 to challenge the bishop.",
            hintText: "Push the a-pawn one square.",
            autoAdvance: false,
            keepPositionOnWrong: false,
          },
          {
            orderIndex: 2,
            title: "Maintain Pressure",
            instructionText:
              "White to move: retreat the bishop to preserve pressure and flexibility.",
            explanationBeforeMove:
              "White usually keeps the bishop pair and long diagonal influence rather than trading immediately.",
            fen: "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
            sideToMove: "white",
            acceptedMoves: ["Ba4", "b5a4"],
            feedbackCorrect:
              "Great. Ba4 keeps the bishop active and preserves long-term strategic pressure.",
            feedbackWrong:
              "Try preserving the bishop while keeping pressure on Black's queenside structure.",
            hintText: "Retreat the bishop along the diagonal to a4.",
            autoAdvance: false,
            keepPositionOnWrong: false,
          },
        ],
      },
      {
        slug: "Lesson2",
        title: "Entering the Closed Structure",
        subtitle: "Coordinate development before tactical operations",
        description:
          "Build the standard closed Ruy Lopez structure with Be7, Re1, and ...b5.",
        orderIndex: 1,
        estimatedMinutes: 10,
        isPublished: true,
        steps: [
          {
            orderIndex: 0,
            title: "Solid Development",
            instructionText:
              "Black to move: choose the classical developing move in the Closed Ruy.",
            explanationBeforeMove:
              "Black keeps flexibility and prepares castling while reinforcing central control.",
            fen: "r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 3 5",
            sideToMove: "black",
            acceptedMoves: ["Be7", "f8e7"],
            feedbackCorrect:
              "Correct. ...Be7 is the foundational setup move for the Closed Ruy Lopez.",
            feedbackWrong:
              "The lesson line uses the standard closed setup. Develop the dark-squared bishop to e7.",
            hintText: "Move the f8 bishop to a safe developing square.",
            autoAdvance: false,
            keepPositionOnWrong: false,
          },
          {
            orderIndex: 1,
            title: "Prepare Central Tension",
            instructionText:
              "White to move: play the move that reinforces e4 and supports central plans.",
            explanationBeforeMove:
              "This move supports e4, gives the king rook activity, and prepares for c3/d4 structures.",
            fen: "r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 4 6",
            sideToMove: "white",
            acceptedMoves: ["Re1", "f1e1"],
            feedbackCorrect:
              "Exactly. Re1 is one of the most instructive and common moves in this structure.",
            feedbackWrong:
              "Think about a rook move that supports e4 and future central expansion.",
            hintText: "The kingside rook belongs behind the e-pawn.",
            autoAdvance: false,
            keepPositionOnWrong: false,
          },
          {
            orderIndex: 2,
            title: "Gain Queenside Space",
            instructionText:
              "Black to move: continue the standard queenside expansion.",
            explanationBeforeMove:
              "This move supports ...Bb7 ideas and gains space while driving White's bishop decisions.",
            fen: "r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQR1K1 b kq - 5 6",
            sideToMove: "black",
            acceptedMoves: ["b5", "b7b5"],
            feedbackCorrect:
              "Correct. ...b5 is a key spatial move and part of many major Ruy Lopez plans.",
            feedbackWrong:
              "The closed structure plan usually includes a queenside pawn push here.",
            hintText: "Push the b-pawn two squares.",
            autoAdvance: false,
            keepPositionOnWrong: false,
          },
        ],
      },
      {
        slug: "Lesson3",
        title: "Typical Continuation",
        subtitle: "Complete the main strategic skeleton",
        description:
          "Practice the natural continuation with Bb3, castling, and c3 to stabilize central plans.",
        orderIndex: 2,
        estimatedMinutes: 9,
        isPublished: true,
        steps: [
          {
            orderIndex: 0,
            title: "Safe Retreat",
            instructionText:
              "White to move: place the bishop on the standard square after ...b5.",
            explanationBeforeMove:
              "White keeps the bishop on the a2-g8 diagonal and stays ready for c3 and d4 ideas.",
            fen: "r1bqk2r/2ppbppp/p1n2n2/1p2p3/B3P3/5N2/PPPP1PPP/RNBQR1K1 w kq b6 0 7",
            sideToMove: "white",
            acceptedMoves: ["Bb3", "a4b3"],
            feedbackCorrect:
              "Great. Bb3 preserves long-range pressure and keeps White's structure coherent.",
            feedbackWrong:
              "The standard retreat after ...b5 keeps the bishop active on the long diagonal.",
            hintText: "Move the bishop one step back to b3.",
            autoAdvance: false,
            keepPositionOnWrong: false,
          },
          {
            orderIndex: 1,
            title: "King Safety",
            instructionText: "Black to move: complete king safety with castling.",
            explanationBeforeMove:
              "Castling finalizes development and prepares central or queenside operations safely.",
            fen: "r1bqk2r/2ppbppp/p1n2n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 b kq - 1 7",
            sideToMove: "black",
            acceptedMoves: ["O-O", "e8g8"],
            feedbackCorrect:
              "Correct. Castling is essential before opening central lines.",
            feedbackWrong:
              "Prioritize king safety now. Black should castle kingside in this structure.",
            hintText: "Complete kingside castling.",
            autoAdvance: false,
            keepPositionOnWrong: false,
          },
          {
            orderIndex: 2,
            title: "Central Foundation",
            instructionText:
              "White to move: play the move that prepares d4 and supports long-term center control.",
            explanationBeforeMove:
              "The c-pawn supports central expansion and reduces tactical exposure on d4.",
            fen: "r1bq1rk1/2ppbppp/p1n2n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 w - - 2 8",
            sideToMove: "white",
            acceptedMoves: ["c3", "c2c3"],
            feedbackCorrect:
              "Excellent. c3 is one of the core strategic moves in the mainline Ruy Lopez.",
            feedbackWrong:
              "This position calls for the classic support move that prepares d4 safely.",
            hintText: "Strengthen your center from the c-file.",
            autoAdvance: false,
            keepPositionOnWrong: false,
          },
        ],
      },
    ],
  },
  {
    slug: "DynamicKingsidePlay",
    title: "Dynamic Kingside Play",
    subtitle: "Typical middlegame plans and piece coordination",
    description:
      "Train pattern recognition for coordinated middlegame decisions with concise interactive steps.",
    category: "Middlegame",
    difficulty: "Intermediate",
    coverImage: "",
    icon: "⚔️",
    instructorName: "IM Viktor Asanov",
    tags: ["middlegame", "piece activity", "king safety"],
    isPublished: true,
    lessons: [
      {
        slug: "Lesson1",
        title: "Responding to a Wing Probe",
        subtitle: "Keep your bishop active under pawn pressure",
        description:
          "Practice a common defensive-into-active transition when your bishop is questioned by ...h6.",
        orderIndex: 0,
        estimatedMinutes: 7,
        isPublished: true,
        steps: [
          {
            orderIndex: 0,
            title: "Preserve the Pin",
            instructionText:
              "White to move: choose the principled bishop retreat after ...h6.",
            explanationBeforeMove:
              "Retreating to h4 keeps pressure and avoids unnecessary structural concessions.",
            fen: "rnbq1rk1/ppp1bpp1/4pn1p/3p2B1/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 7",
            sideToMove: "white",
            acceptedMoves: ["Bh4", "g5h4"],
            feedbackCorrect:
              "Correct. Bh4 keeps the bishop active while maintaining strategic tension.",
            feedbackWrong:
              "Try preserving bishop activity without giving up control too early.",
            hintText: "Retreat your bishop one square while maintaining influence.",
            autoAdvance: false,
            keepPositionOnWrong: false,
          },
          {
            orderIndex: 1,
            title: "Strike in the Center",
            instructionText:
              "Black to move: challenge White's center with a thematic pawn capture.",
            explanationBeforeMove:
              "When development is stable, central pawn exchanges can open useful lines for your pieces.",
            fen: "rnbq1rk1/ppp1bpp1/4pn1p/3p4/2PP3B/2N1PN2/PP3PPP/R2QKB1R b KQ - 1 7",
            sideToMove: "black",
            acceptedMoves: ["dxc4", "d5c4"],
            feedbackCorrect:
              "Exactly. ...dxc4 is a thematic break that challenges White's center structure.",
            feedbackWrong:
              "Look for the central pawn capture that reduces White's space.",
            hintText: "Capture the c4 pawn with your d-pawn.",
            autoAdvance: false,
            keepPositionOnWrong: false,
          },
        ],
      },
    ],
  },
  {
    slug: "BerlinEndgameBlueprints",
    title: "Berlin Endgame Blueprints",
    subtitle: "Practical endgame setup decisions",
    description:
      "Learn stable endgame improvements from famous Berlin structures with guided move selection.",
    category: "Endgame",
    difficulty: "Advanced",
    coverImage: "",
    icon: "♜",
    instructorName: "GM Pavel Richter",
    tags: ["endgame", "berlin", "technique"],
    isPublished: true,
    lessons: [
      {
        slug: "Lesson1",
        title: "Activate Minor Pieces",
        subtitle: "Improve pieces before creating pawn tension",
        description:
          "Practice disciplined development in a reduced-material endgame setup.",
        orderIndex: 0,
        estimatedMinutes: 8,
        isPublished: true,
        steps: [
          {
            orderIndex: 0,
            title: "Natural Development",
            instructionText:
              "White to move: improve your queenside knight to increase control.",
            explanationBeforeMove:
              "Piece activity is a priority in simplified positions. Bring idle pieces into the game quickly.",
            fen: "r1bk1b1r/ppp2ppp/2p5/4Pn2/8/5N2/PPP2PPP/RNB2RK1 w - - 0 9",
            sideToMove: "white",
            acceptedMoves: ["Nc3", "b1c3"],
            feedbackCorrect:
              "Correct. Nc3 improves coordination and supports central squares.",
            feedbackWrong:
              "Choose the move that activates your undeveloped queenside knight.",
            hintText: "Develop the b1 knight to its most natural square.",
            autoAdvance: false,
            keepPositionOnWrong: false,
          },
          {
            orderIndex: 1,
            title: "Complete Development",
            instructionText:
              "Black to move: place your bishop to finish a stable setup.",
            explanationBeforeMove:
              "Endgames reward coordination. Completing development keeps your structure flexible.",
            fen: "r1bk1b1r/ppp2ppp/2p5/4Pn2/8/2N2N2/PPP2PPP/R1B2RK1 b - - 1 9",
            sideToMove: "black",
            acceptedMoves: ["Be7", "f8e7"],
            feedbackCorrect:
              "Good. ...Be7 completes development and keeps the position harmonized.",
            feedbackWrong:
              "This lesson focuses on a simple completion move for piece harmony.",
            hintText: "Develop the bishop from f8.",
            autoAdvance: false,
            keepPositionOnWrong: false,
          },
        ],
      },
    ],
  },
  {
    slug: "PawnStructurePrinciples",
    title: "Pawn Structure Principles",
    subtitle: "Strategic fundamentals through practical positions",
    description:
      "Build reliable strategic habits by choosing moves that support healthy pawn structures.",
    category: "Strategy",
    difficulty: "Beginner",
    coverImage: "",
    icon: "♟️",
    instructorName: "IM Sarah Lee",
    tags: ["strategy", "pawn structure", "fundamentals"],
    isPublished: true,
    lessons: [
      {
        slug: "Lesson1",
        title: "Support the Center",
        subtitle: "Coordinate pieces before pawn breaks",
        description:
          "Recognize when simple development best supports your long-term center strategy.",
        orderIndex: 0,
        estimatedMinutes: 6,
        isPublished: true,
        steps: [
          {
            orderIndex: 0,
            title: "Reinforce Control",
            instructionText:
              "White to move: play the move that strengthens central support and king safety plans.",
            explanationBeforeMove:
              "Piece development that supports d4 and e5 control is usually more valuable than early pawn contact.",
            fen: "rnbq1rk1/ppp1bppp/4pn2/3p2B1/2PP4/2N1P3/PP3PPP/R2QKBNR w KQ - 1 6",
            sideToMove: "white",
            acceptedMoves: ["Nf3", "g1f3"],
            feedbackCorrect:
              "Correct. Nf3 improves control over key central squares and supports coordinated development.",
            feedbackWrong:
              "Look for a natural developing move that directly supports your center.",
            hintText: "Develop your kingside knight toward the center.",
            autoAdvance: false,
            keepPositionOnWrong: false,
          },
          {
            orderIndex: 1,
            title: "Ask the Bishop",
            instructionText:
              "Black to move: challenge the pinned bishop before deciding central pawn breaks.",
            explanationBeforeMove:
              "A small pawn move can force a decision from White's active bishop and reduce pressure.",
            fen: "rnbq1rk1/ppp1bppp/4pn2/3p2B1/2PP4/2N1PN2/PP3PPP/R2QKB1R b KQ - 2 6",
            sideToMove: "black",
            acceptedMoves: ["h6", "h7h6"],
            feedbackCorrect:
              "Good. ...h6 asks White's bishop to clarify its placement and reduces immediate pin pressure.",
            feedbackWrong:
              "This step uses a practical move that questions White's bishop on g5.",
            hintText: "Push the h-pawn one square.",
            autoAdvance: false,
            keepPositionOnWrong: false,
          },
        ],
      },
    ],
  },
];

export async function seedLearn() {
  const courseCount = await LearnCourse.countDocuments();
  if (courseCount > 0) return;

  for (const courseSeed of learnSeedCourses) {
    const course = await LearnCourse.create({
      slug: courseSeed.slug,
      title: courseSeed.title,
      subtitle: courseSeed.subtitle,
      description: courseSeed.description,
      category: courseSeed.category,
      difficulty: courseSeed.difficulty,
      coverImage: courseSeed.coverImage,
      icon: courseSeed.icon,
      instructorName: courseSeed.instructorName,
      tags: courseSeed.tags,
      totalLessons: courseSeed.lessons.length,
      isPublished: courseSeed.isPublished,
    });

    for (const lessonSeed of courseSeed.lessons) {
      const lesson = await LearnLesson.create({
        courseId: course._id,
        slug: lessonSeed.slug,
        title: lessonSeed.title,
        subtitle: lessonSeed.subtitle,
        description: lessonSeed.description,
        orderIndex: lessonSeed.orderIndex,
        estimatedMinutes: lessonSeed.estimatedMinutes,
        isPublished: lessonSeed.isPublished,
      });

      const stepDocs = lessonSeed.steps.map((stepSeed) => ({
        lessonId: lesson._id,
        orderIndex: stepSeed.orderIndex,
        title: stepSeed.title,
        instructionText: stepSeed.instructionText,
        explanationBeforeMove: stepSeed.explanationBeforeMove,
        fen: stepSeed.fen,
        sideToMove: stepSeed.sideToMove,
        acceptedMoves: stepSeed.acceptedMoves,
        feedbackCorrect: stepSeed.feedbackCorrect,
        feedbackWrong: stepSeed.feedbackWrong,
        nextFen: stepSeed.nextFen || "",
        hintText: stepSeed.hintText || "",
        autoAdvance: !!stepSeed.autoAdvance,
        keepPositionOnWrong: !!stepSeed.keepPositionOnWrong,
      }));

      if (stepDocs.length > 0) {
        await LearnLessonStep.insertMany(stepDocs);
      }
    }
  }

  console.log("✅ Learn courses seeded successfully");
}
