import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  List,
  Loader2,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Chessboard } from "react-chessboard";
import type { PuzzleItem } from "./types";
import { fetchPuzzleLibrary, togglePuzzleBookmark } from "./api";

type LibraryViewMode = "grid" | "list";
type StatusFilter =
  | "all"
  | "new"
  | "solved"
  | "failed_before"
  | "review_due"
  | "mastered"
  | "bookmarked";

const VIEW_STORAGE_KEY = "puzzle-library-view-mode";
const GRID_PAGE_SIZE = 9;
const LIST_PAGE_SIZE = 14;

function difficultyClass(difficulty: string) {
  if (difficulty === "Easy") {
    return "border-emerald-300/50 bg-emerald-400/15 text-emerald-100";
  }
  if (difficulty === "Hard") {
    return "border-red-300/50 bg-red-400/15 text-red-100";
  }
  return "border-amber-300/50 bg-amber-400/15 text-amber-100";
}

function badgeClass(badge: string) {
  if (badge === "new") return "border-cyan-300/60 bg-cyan-400/15 text-cyan-100";
  if (badge === "solved")
    return "border-emerald-300/60 bg-emerald-400/15 text-emerald-100";
  if (badge === "failed_before")
    return "border-rose-300/60 bg-rose-400/15 text-rose-100";
  if (badge === "review_due")
    return "border-amber-300/60 bg-amber-400/15 text-amber-100";
  if (badge === "mastered")
    return "border-slate-400/50 bg-slate-400/10 text-slate-200";
  if (badge === "bookmarked")
    return "border-fuchsia-300/60 bg-fuchsia-400/15 text-fuchsia-100";
  return "border-slate-400/40 bg-slate-400/10 text-slate-200";
}

function badgeLabel(badge: string) {
  if (badge === "new") return "New";
  if (badge === "solved") return "Solved";
  if (badge === "failed_before") return "Failed Before";
  if (badge === "review_due") return "Review Due";
  if (badge === "mastered") return "Mastered";
  if (badge === "bookmarked") return "Bookmarked";
  return "Unseen";
}

function mergedMotifs(puzzle: PuzzleItem): string[] {
  const source = [
    ...(Array.isArray(puzzle.motifs) ? puzzle.motifs : []),
    ...(Array.isArray(puzzle.themes) ? puzzle.themes : []),
  ];
  return Array.from(
    new Set(source.map((item) => String(item || "").trim()).filter(Boolean)),
  );
}

function statusLabel(status?: string) {
  if (status === "unseen") return "New";
  if (status === "seen") return "Seen";
  if (status === "solved") return "Solved";
  if (status === "failed") return "Failed";
  if (status === "review_due") return "Review Due";
  if (status === "mastered") return "Mastered";
  if (status === "archived") return "Archived";
  return "Unknown";
}

function statusPillClass(status?: string) {
  if (status === "solved")
    return "border-emerald-300/60 bg-emerald-400/15 text-emerald-100";
  if (status === "failed")
    return "border-rose-300/60 bg-rose-400/15 text-rose-100";
  if (status === "review_due")
    return "border-amber-300/60 bg-amber-400/15 text-amber-100";
  if (status === "mastered")
    return "border-slate-400/50 bg-slate-400/10 text-slate-200";
  if (status === "seen")
    return "border-indigo-300/60 bg-indigo-400/15 text-indigo-100";
  return "border-cyan-300/60 bg-cyan-400/15 text-cyan-100";
}

function PuzzlePreviewBoard({
  puzzleId,
  fen,
}: {
  puzzleId: string;
  fen: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(260);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const nextWidth = Math.floor(container.clientWidth);
      if (nextWidth > 0) {
        setBoardWidth(nextWidth);
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
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden border border-[#2d3f63] shadow-sm"
    >
      <Chessboard
        id={`library-puzzle-${puzzleId}`}
        position={fen || "start"}
        boardWidth={boardWidth}
        arePiecesDraggable={false}
        showBoardNotation={false}
        customDarkSquareStyle={{ backgroundColor: "#8ea8bb" }}
        customLightSquareStyle={{ backgroundColor: "#dde7ee" }}
      />
    </div>
  );
}

export default function Puzzles() {
  const navigate = useNavigate();
  const [items, setItems] = useState<PuzzleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [difficulty, setDifficulty] = useState<"" | "Easy" | "Medium" | "Hard">(
    "",
  );
  const [minRating, setMinRating] = useState<number>(600);
  const [maxRating, setMaxRating] = useState<number>(2600);
  const [includeMastered, setIncludeMastered] = useState(false);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<LibraryViewMode>(() => {
    const cached = localStorage.getItem(VIEW_STORAGE_KEY);
    return cached === "list" ? "list" : "grid";
  });

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    setPage(1);
  }, [query, status, difficulty, includeMastered, minRating, maxRating, viewMode]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      let cancelled = false;

      async function loadLibrary() {
        setLoading(true);
        setError(null);
        try {
          const response = await fetchPuzzleLibrary({
            query,
            status,
            difficulty,
            includeMastered,
            minRating,
            maxRating,
          });
          if (cancelled) return;
          setItems(response.items || []);
        } catch (loadError) {
          if (cancelled) return;
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load puzzle library",
          );
        } finally {
          if (!cancelled) setLoading(false);
        }
      }

      void loadLibrary();
      return () => {
        cancelled = true;
      };
    }, 220);

    return () => clearTimeout(timeout);
  }, [difficulty, includeMastered, maxRating, minRating, query, status]);

  const statusOptions: Array<{ value: StatusFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "new", label: "New" },
    { value: "solved", label: "Solved" },
    { value: "failed_before", label: "Failed Before" },
    { value: "review_due", label: "Review Due" },
    { value: "mastered", label: "Mastered" },
    { value: "bookmarked", label: "Bookmarked" },
  ];

  const onBookmark = async (puzzle: PuzzleItem) => {
    try {
      const result = await togglePuzzleBookmark(
        puzzle._id,
        !puzzle.userState?.isBookmarked,
      );
      setItems((previous) =>
        previous.map((entry) =>
          entry._id === puzzle._id
            ? {
                ...entry,
                userState: {
                  ...entry.userState,
                  status: entry.userState?.status || "seen",
                  seenCount: entry.userState?.seenCount || 0,
                  solveCount: entry.userState?.solveCount || 0,
                  failCount: entry.userState?.failCount || 0,
                  hintCount: entry.userState?.hintCount || 0,
                  nextReviewAt: entry.userState?.nextReviewAt || null,
                  isHidden: entry.userState?.isHidden || false,
                  masteredAt: entry.userState?.masteredAt || null,
                  reviewDue: entry.userState?.reviewDue || false,
                  mastered: entry.userState?.mastered || false,
                  isBookmarked: result.isBookmarked,
                  badge: result.isBookmarked
                    ? "bookmarked"
                    : entry.userState?.badge || "new",
                },
              }
            : entry,
        ),
      );
    } catch (bookmarkError) {
      console.error("Failed to toggle bookmark:", bookmarkError);
    }
  };

  const pageSize = viewMode === "grid" ? GRID_PAGE_SIZE : LIST_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pageStart = (safePage - 1) * pageSize;
  const pagedItems = useMemo(
    () => items.slice(pageStart, pageStart + pageSize),
    [items, pageStart, pageSize],
  );

  return (
    <div className="space-y-5 max-w-full">
      <section className="rounded-2xl border border-[#243250] bg-[#0f172a] px-5 py-5 shadow-[0_25px_80px_-55px_rgba(20,184,166,0.45)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300/90">
              Puzzle Library
            </p>
            <h1 className="text-2xl font-semibold text-white">
              Browse Puzzles
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Search and filter by status and rating.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center rounded-lg border border-[#304464] bg-[#111b31] px-3 py-2 text-xs font-medium text-slate-100 transition-colors hover:bg-[#162541]"
            >
              Back
            </button>
            <Link
              to="/puzzles/history"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#304464] bg-[#111b31] px-3 py-2 text-xs font-semibold text-slate-100 hover:border-cyan-300/60"
            >
              <BookOpen className="h-3.5 w-3.5" />
              History
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2">
          <label className="rounded-xl border border-[#304464] bg-[#111b31] px-3 py-2 text-xs text-slate-200">
            Search
            <div className="mt-1 flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title"
                className="w-full bg-transparent outline-none text-sm placeholder:text-slate-500"
              />
            </div>
          </label>

          <label className="rounded-xl border border-[#304464] bg-[#111b31] px-3 py-2 text-xs text-slate-200">
            Status
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as StatusFilter)
              }
              className="mt-1 w-full bg-transparent text-sm outline-none"
            >
              {statusOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  className="bg-[#0d1322] text-slate-100"
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="rounded-xl border border-[#304464] bg-[#111b31] px-3 py-2 text-xs text-slate-200">
            Difficulty
            <select
              value={difficulty}
              onChange={(event) =>
                setDifficulty(
                  event.target.value as "" | "Easy" | "Medium" | "Hard",
                )
              }
              className="mt-1 w-full bg-transparent text-sm outline-none"
            >
              <option value="" className="bg-[#0d1322] text-slate-100">
                All
              </option>
              {["Easy", "Medium", "Hard"].map((item) => (
                <option
                  key={item}
                  value={item}
                  className="bg-[#0d1322] text-slate-100"
                >
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border border-[#304464] bg-[#111b31] px-2 py-1">
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="number"
              value={minRating}
              onChange={(event) =>
                setMinRating(Number(event.target.value || 0))
              }
              className="w-16 bg-transparent text-xs outline-none"
              min={100}
              max={maxRating}
            />
            <span className="text-xs text-slate-500">to</span>
            <input
              type="number"
              value={maxRating}
              onChange={(event) =>
                setMaxRating(Number(event.target.value || 0))
              }
              className="w-16 bg-transparent text-xs outline-none"
              min={minRating}
              max={3500}
            />
          </div>

          <label className="inline-flex items-center gap-2 rounded-lg border border-[#304464] bg-[#111b31] px-3 py-1.5 text-xs text-slate-100">
            <input
              type="checkbox"
              checked={includeMastered}
              onChange={(event) => setIncludeMastered(event.target.checked)}
            />
            Include mastered
          </label>

          <div className="ml-auto inline-flex rounded-lg border border-[#304464] bg-[#111b31] p-1">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                viewMode === "grid"
                  ? "bg-emerald-400/20 text-emerald-100"
                  : "text-slate-300"
              }`}
            >
              <Grid2X2 className="h-3.5 w-3.5" />
              Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                viewMode === "list"
                  ? "bg-emerald-400/20 text-emerald-100"
                  : "text-slate-300"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-[#243250] bg-[#0f172a] px-4 py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-300" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-400/50 bg-red-500/10 px-4 py-4 text-sm text-red-100">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-[#243250] bg-[#0f172a] px-4 py-6 text-sm text-slate-300">
          {status === "review_due"
            ? "No reviews due. Try a new rated puzzle."
            : "No puzzles match your filters."}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {pagedItems.map((puzzle) => {
            const badge = puzzle.userState?.badge || "new";
            const mastered = puzzle.userState?.mastered === true;
            return (
              <article
                key={puzzle._id}
                className={`rounded-xl border border-[#273655] bg-[#101a30] p-3 transition-all ${
                  mastered ? "opacity-65" : "opacity-100"
                } hover:border-[#3d547f] hover:shadow-md`}
              >
                <PuzzlePreviewBoard puzzleId={puzzle._id} fen={puzzle.fen} />

                <div className="mt-2.5 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white truncate">{puzzle.title}</h3>
                    <p className="text-xs text-slate-400">{puzzle.rating} Elo</p>
                  </div>
                  {puzzle.userState?.isBookmarked ? (
                    <button
                      type="button"
                      onClick={() => onBookmark(puzzle)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-fuchsia-300/60 bg-fuchsia-500/15 text-fuchsia-200 hover:bg-fuchsia-500/25"
                      title="Bookmarked"
                      aria-label="Bookmarked"
                    >
                      <Bookmark className="h-3.5 w-3.5" fill="currentColor" />
                    </button>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span
                    className={`px-2 py-1 rounded-md border text-[11px] font-semibold ${difficultyClass(
                      puzzle.difficulty,
                    )}`}
                  >
                    {puzzle.difficulty}
                  </span>
                  <span
                    className={`px-2 py-1 rounded-md border text-[11px] font-semibold ${statusPillClass(
                      puzzle.userState?.status,
                    )}`}
                  >
                    {statusLabel(puzzle.userState?.status)}
                  </span>
                  {badge === "bookmarked" ? null : (
                    <span
                      className={`px-2 py-1 rounded-md border text-[11px] font-semibold ${badgeClass(
                        badge,
                      )}`}
                    >
                      {badgeLabel(badge)}
                    </span>
                  )}
                  {mergedMotifs(puzzle)
                    .slice(0, 2)
                    .map((motif) => (
                      <span
                        key={`${puzzle._id}-${motif}`}
                        className="px-2 py-1 rounded-md border border-[#31446d] bg-[#0d1629] text-[11px] text-slate-200"
                      >
                        {motif}
                      </span>
                    ))}
                </div>

                <p className="mt-2 text-xs text-slate-300 line-clamp-2">
                  {puzzle.description || "No description"}
                </p>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-400">
                    {puzzle.quality?.attempts || 0} attempts
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/puzzles/train/${puzzle._id}?mode=library`)
                    }
                    className="rounded-lg border border-emerald-300/70 bg-emerald-500/20 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/30"
                  >
                    Start
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#243250] bg-[#0f172a] overflow-hidden">
          {pagedItems.map((puzzle) => {
            const badge = puzzle.userState?.badge || "new";
            const mastered = puzzle.userState?.mastered === true;
            return (
              <div
                key={puzzle._id}
                className={`px-3 py-3 border-b border-[#1e2a44] last:border-b-0 flex items-center gap-3 ${
                  mastered ? "opacity-65" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate inline-flex items-center gap-1.5">
                    {puzzle.userState?.isBookmarked ? (
                      <Bookmark className="h-3.5 w-3.5 text-fuchsia-200 shrink-0" fill="currentColor" />
                    ) : null}
                    {puzzle.title}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {mergedMotifs(puzzle).join(" • ") || "No motifs"}
                  </p>
                </div>
                <span
                  className={`px-2 py-1 rounded-md border text-[11px] font-semibold shrink-0 ${badgeClass(
                    badge,
                  )}`}
                >
                  {badgeLabel(badge)}
                </span>
                <span
                  className={`px-2 py-1 rounded-md border text-[11px] font-semibold shrink-0 ${difficultyClass(
                    puzzle.difficulty,
                  )}`}
                >
                  {puzzle.difficulty}
                </span>
                <span className="text-xs text-slate-300 w-14 text-right shrink-0">
                  {puzzle.rating}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/puzzles/train/${puzzle._id}?mode=library`)
                  }
                  className="rounded-lg border border-emerald-300/70 bg-emerald-500/20 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/30 shrink-0"
                >
                  Start
                </button>
              </div>
            );
          })}
        </div>
      )}

      {items.length > 0 && totalPages > 1 ? (
        <div className="rounded-xl border border-[#243250] bg-[#0f172a] p-4 flex items-center justify-between">
          <p className="text-sm text-slate-400">
            Showing {pageStart + 1} -{" "}
            {Math.min(pageStart + pageSize, items.length)} of {items.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage <= 1}
              className="p-2 bg-slate-100/10 hover:bg-slate-100/20 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-300">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage >= totalPages}
              className="p-2 bg-slate-100/10 hover:bg-slate-100/20 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
