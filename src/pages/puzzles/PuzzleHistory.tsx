import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Chessboard } from "react-chessboard";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fetchPuzzleHistory } from "./api";
import type { PuzzleHistoryItem } from "./types";
import { formatTime } from "../puzzleTrainer/utils";

const PAGE_SIZE = 9;

function difficultyClass(difficulty?: string) {
  if (difficulty === "Easy") {
    return "border-emerald-300/50 bg-emerald-400/15 text-emerald-100";
  }
  if (difficulty === "Hard") {
    return "border-red-300/50 bg-red-400/15 text-red-100";
  }
  return "border-amber-300/50 bg-amber-400/15 text-amber-100";
}

function resultClass(result: PuzzleHistoryItem["result"]) {
  if (result === "SOLVED") {
    return "border-emerald-300/60 bg-emerald-400/15 text-emerald-100";
  }
  if (result === "FAILED") {
    return "border-rose-300/60 bg-rose-400/15 text-rose-100";
  }
  if (result === "SKIPPED") {
    return "border-amber-300/60 bg-amber-400/15 text-amber-100";
  }
  return "border-slate-400/50 bg-slate-400/10 text-slate-200";
}

function difficultyLabel(
  difficulty: string | undefined,
  t: (key: string, defaultValue?: string) => string,
) {
  if (difficulty === "Easy") return t("puzzles.difficulty.easy", "Easy");
  if (difficulty === "Hard") return t("puzzles.difficulty.hard", "Hard");
  return t("puzzles.difficulty.medium", "Medium");
}

function resultTranslationKey(result: PuzzleHistoryItem["result"]) {
  if (result === "SOLVED") return "solved";
  if (result === "FAILED") return "failed";
  if (result === "SKIPPED") return "skipped";
  return "abandoned";
}

function modeLabel(
  mode: string | undefined,
  t: (key: string, defaultValue?: string) => string,
) {
  if (mode === "review") return t("puzzles.modeLabels.review", "Review");
  if (mode === "random") return t("puzzles.modeLabels.random", "Random");
  if (mode === "library") return t("puzzles.modeLabels.library", "Library");
  return t("puzzles.modeLabels.rated", "Rated");
}

function historySummary(
  item: PuzzleHistoryItem,
  t: (key: string, options?: Record<string, unknown> | string) => string,
  locale: string,
) {
  return t("puzzles.history.summary", {
    defaultValue: "{{mode}} • {{result}} • {{date}} • {{time}}",
    mode: modeLabel(item.mode, t as (key: string, defaultValue?: string) => string),
    result: (t as (key: string, defaultValue?: string) => string)(
      `puzzles.results.${resultTranslationKey(item.result)}`,
      item.result,
    ),
    date: new Date(item.date).toLocaleDateString(locale),
    time: formatTime(Math.floor(item.timeSpent / 1000)),
  });
}

function PuzzlePreviewBoard({
  puzzleId,
  fen,
}: {
  puzzleId: string;
  fen: string;
}) {
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
    <div
      ref={containerRef}
      className="aspect-square w-full rounded-lg overflow-hidden border border-[#2d3f63] shadow-sm"
    >
      {boardWidth > 0 ? (
        <Chessboard
          id={`history-puzzle-${puzzleId}`}
          position={fen || "start"}
          boardWidth={boardWidth}
          arePiecesDraggable={false}
          showBoardNotation={false}
          customDarkSquareStyle={{ backgroundColor: "#8ea8bb" }}
          customLightSquareStyle={{ backgroundColor: "#dde7ee" }}
        />
      ) : null}
    </div>
  );
}

function getPageNumbers(current: number, total: number): Array<number | "..."> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages: Array<number | "..."> = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) pages.push("...");
  for (let page = left; page <= right; page += 1) pages.push(page);
  if (right < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}

export default function PuzzleHistory() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const translateDefault = (key: string, defaultValue?: string) =>
    String(defaultValue === undefined ? t(key) : t(key, defaultValue));
  const translateHistory = (
    key: string,
    options?: Record<string, unknown> | string,
  ) => String(typeof options === "string" ? t(key, options) : t(key, options));
  const loadFailedMessage = t(
    "puzzles.history.loadFailed",
    "Failed to load puzzle history",
  );
  const [items, setItems] = useState<PuzzleHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchPuzzleHistory(200);
        if (cancelled) return;
        setItems(response.items || []);
      } catch (historyError) {
        if (cancelled) return;
        setError(
          historyError instanceof Error
            ? historyError.message
            : loadFailedMessage,
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [loadFailedMessage]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) =>
      String(item.puzzleTitle || "")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [items, query]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedItems = useMemo(
    () => filteredItems.slice(pageStart, pageStart + PAGE_SIZE),
    [filteredItems, pageStart],
  );
  const pageNumbers = getPageNumbers(safePage, totalPages);
  const locale = i18n.resolvedLanguage === "mn" ? "mn-MN" : "en-US";

  return (
    <div className="space-y-4 max-w-full">
      <section className="rounded-2xl border border-[#243250] bg-[#0f172a] px-5 py-5 shadow-[0_25px_80px_-55px_rgba(20,184,166,0.45)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300/90">
              {t("puzzles.history.eyebrow", "Puzzle History")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/puzzles/train?mode=rated")}
            className="inline-flex items-center rounded-lg border border-[#304464] bg-[#111b31] px-3 py-2 text-xs font-medium text-slate-100 transition-colors hover:bg-[#162541]"
          >
            {t("analysis.back", "Back")}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-2">
          <label className="rounded-xl border border-[#304464] bg-[#111b31] px-3 py-2 text-xs text-slate-200">
            {t("puzzles.history.searchLabel", "Search")}
            <div className="mt-1 flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t(
                  "puzzles.history.searchPlaceholder",
                  "Search title",
                )}
                className="w-full bg-transparent outline-none text-sm placeholder:text-slate-500"
              />
            </div>
          </label>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-[#243250] bg-[#0f172a] px-4 py-12 flex justify-center">
          <div className="flex flex-col items-center gap-2 text-sm text-slate-300">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-300" />
            <span>{t("puzzles.history.loading", "Loading puzzle history...")}</span>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-400/50 bg-red-500/10 px-4 py-4 text-sm text-red-100">
          {error}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-[#243250] bg-[#0f172a] px-4 py-6 text-sm text-slate-300">
          {t("puzzles.history.empty", "No history items match your search.")}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {pagedItems.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-[#273655] bg-[#101a30] p-3 transition-all hover:border-[#3d547f] hover:shadow-md"
              >
                <PuzzlePreviewBoard
                  puzzleId={item.puzzleId || item.id}
                  fen={item.puzzleFen || "start"}
                />

                <div className="mt-2.5 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white truncate">
                      {item.puzzleTitle}
                    </h3>
                    <p className="text-xs text-slate-400">{item.puzzleRating} Elo</p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-md border text-[11px] font-semibold ${resultClass(
                      item.result,
                    )}`}
                  >
                    {t(
                      `puzzles.results.${resultTranslationKey(item.result)}`,
                      item.result,
                    )}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span
                    className={`px-2 py-1 rounded-md border text-[11px] font-semibold ${difficultyClass(
                      item.puzzleDifficulty,
                    )}`}
                  >
                    {difficultyLabel(item.puzzleDifficulty, translateDefault)}
                  </span>
                  <span className="px-2 py-1 rounded-md border border-[#31446d] bg-[#0d1629] text-[11px] text-slate-200 uppercase">
                    {modeLabel(item.mode, translateDefault)}
                  </span>
                  {item.motifs.slice(0, 2).map((motif) => (
                    <span
                      key={`${item.id}-${motif}`}
                      className="px-2 py-1 rounded-md border border-[#31446d] bg-[#0d1629] text-[11px] text-slate-200"
                    >
                      {motif}
                    </span>
                  ))}
                </div>

                <p className="mt-2 text-xs text-slate-300 line-clamp-2">
                  {historySummary(item, translateHistory, locale)}
                </p>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-400">
                    {new Date(item.date).toLocaleDateString(locale)} -{" "}
                    {formatTime(Math.floor(item.timeSpent / 1000))}
                  </div>
                  {item.puzzleId ? (
                    <Link
                      to={`/puzzles/train/${item.puzzleId}?mode=library`}
                      className="rounded-lg border border-emerald-300/70 bg-emerald-500/20 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/30"
                    >
                      {t("puzzles.library.start", "Start")}
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="rounded-xl border border-[#243250] bg-[#0f172a] p-4 flex items-center justify-between">
              <p className="text-sm text-slate-400">
                {t("puzzles.library.pagination", {
                  defaultValue: "Showing {{start}} - {{end}} of {{total}}",
                  start: pageStart + 1,
                  end: Math.min(pageStart + PAGE_SIZE, filteredItems.length),
                  total: filteredItems.length,
                })}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={safePage <= 1}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#111b31] border border-[#304464] text-slate-300 hover:border-emerald-300/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {pageNumbers.map((value, index) =>
                  value === "..." ? (
                    <span
                      key={`dots-${index}`}
                      className="w-9 h-9 inline-flex items-center justify-center text-slate-500 text-sm select-none"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPage(value)}
                      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border text-sm font-medium transition-colors ${
                        value === safePage
                          ? "border-emerald-300/60 bg-emerald-500/25 text-emerald-100"
                          : "border-[#304464] bg-[#111b31] text-slate-300 hover:border-emerald-300/50"
                      }`}
                    >
                      {value}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={safePage >= totalPages}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#111b31] border border-[#304464] text-slate-300 hover:border-emerald-300/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
