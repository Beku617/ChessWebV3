import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Chessboard } from "react-chessboard";

interface Puzzle {
  _id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  themes: string[];
  description: string;
  icon: string;
  fen: string;
  solution: string[];
  rating: number;
  isWhiteToMove: boolean;
  featured: boolean;
}

const API_URL = import.meta.env.VITE_API_URL;
const FEATURED_PUZZLE_COUNT = 3;

interface PuzzlesSectionProps {
  showTopDivider?: boolean;
}

interface PuzzlePreviewBoardProps {
  puzzleId: string;
  fen: string;
  onClick?: () => void;
}

function PuzzlePreviewBoard({ puzzleId, fen, onClick }: PuzzlePreviewBoardProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const nextWidth = Math.floor(container.clientWidth);
      if (nextWidth > 0) {
        setBoardWidth((currentWidth) =>
          currentWidth === nextWidth ? currentWidth : nextWidth,
        );
      }
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/70"
      aria-label={t("Open puzzle training")}
    >
      <div
        ref={containerRef}
        className="aspect-square w-full rounded-lg overflow-hidden border border-theme-glass shadow-sm cursor-pointer"
      >
        {boardWidth > 0 ? (
          <Chessboard
            id={`dashboard-puzzle-${puzzleId}`}
            position={fen || "start"}
            boardWidth={boardWidth}
            arePiecesDraggable={false}
            showBoardNotation={false}
            customDarkSquareStyle={{ backgroundColor: "#8ea8bb" }}
            customLightSquareStyle={{ backgroundColor: "#dde7ee" }}
          />
        ) : null}
      </div>
    </button>
  );
}

export function PuzzlesSection({ showTopDivider = true }: PuzzlesSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [loading, setLoading] = useState(true);
  const wrapperClass = showTopDivider
    ? "mt-6 pt-4 border-t border-theme-glass "
    : "";

  useEffect(() => {
    const fetchPuzzles = async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/puzzles/featured?limit=${FEATURED_PUZZLE_COUNT}`,
          {
            credentials: "include",
          },
        );
        if (res.ok) {
          const data = await res.json();
          setPuzzles(
            Array.isArray(data) ? data.slice(0, FEATURED_PUZZLE_COUNT) : [],
          );
        }
      } catch (err) {
        console.error("Failed to fetch puzzles:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchPuzzles();
  }, []);

  const handleSolve = (puzzle: Puzzle) => {
    navigate(`/puzzles/train/${puzzle._id}`);
  };

  if (loading) {
    return (
      <div className={wrapperClass}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
        </div>
      </div>
    );
  }

  if (puzzles.length === 0) {
    return (
      <div className={wrapperClass}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xl font-semibold text-theme-foreground ">
              {t("Puzzles")}
            </h3>
          </div>
        </div>
        <p className="text-theme-muted text-sm">
          {t("No puzzles available yet.")}
        </p>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xl font-semibold text-theme-foreground ">
            {t("Puzzles")}
          </h3>
        </div>
        <button
          onClick={() => navigate("/puzzles")}
          className="text-sm text-brand-600 hover:text-brand-500 transition-colors"
        >
          {t("Browse All")}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {puzzles.map((pz, idx) => (
          <motion.div
            key={pz._id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: idx * 0.06 }}
            className="rounded-xl border border-theme-glass bg-theme-panel p-3 hover:border-theme-glass transition-all shadow-sm hover:shadow-md"
          >
            <PuzzlePreviewBoard
              puzzleId={pz._id}
              fen={pz.fen}
              onClick={() => handleSolve(pz)}
            />

            <div className="pt-3">
              <button
                type="button"
                onClick={() => handleSolve(pz)}
                className="w-full px-4 py-2.5 bg-theme-panel hover:bg-theme-panel/90 text-theme-foreground text-sm rounded-lg transition-colors"
              >
                {t("Solve Puzzle")}
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
