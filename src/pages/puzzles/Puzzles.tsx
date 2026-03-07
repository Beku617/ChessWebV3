import { useEffect, useMemo, useState } from "react";
import { Puzzle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/authStore";
import {
  API_URL,
  detectPuzzleCollection,
  getMateBucket,
  MateBucket,
  puzzleMatchesMotif,
  puzzleMatchesQuery,
  PuzzleCollection,
  PuzzleItem,
  PuzzleUserStats,
} from "./types";
import { PuzzleStatsCards } from "./PuzzleStatsCards";
import { PuzzlesGrid } from "./PuzzlesGrid";
import { PuzzleBrowseFilters } from "./PuzzleBrowseFilters";

export default function Puzzles() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [puzzles, setPuzzles] = useState<PuzzleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<PuzzleUserStats | null>(null);
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState<PuzzleCollection>("all");
  const [mateBucket, setMateBucket] = useState<MateBucket>("all");
  const [motif, setMotif] = useState("All");

  useEffect(() => {
    fetch(`${API_URL}/api/puzzles`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        setPuzzles(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch puzzles:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/puzzles/me/stats`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch puzzle stats");
        return res.json();
      })
      .then((data) => {
        setStats(data);
        setStatsLoading(false);
      })
      .catch((error) => {
        console.error("Failed to fetch puzzle stats:", error);
        setStats({
          rating: user?.puzzleElo ?? 1200,
          bestRating: user?.puzzleBestElo ?? user?.puzzleElo ?? 1200,
          attempts: user?.puzzleAttempts ?? 0,
          solved: user?.puzzleSolved ?? 0,
          failed: user?.puzzleFailed ?? 0,
          skipped: user?.puzzleSkipped ?? 0,
          solvedToday: 0,
          streak: 0,
          provisional: (user?.puzzleAttempts ?? 0) < 20,
        });
        setStatsLoading(false);
      });
  }, [
    user?.puzzleAttempts,
    user?.puzzleBestElo,
    user?.puzzleElo,
    user?.puzzleFailed,
    user?.puzzleSkipped,
    user?.puzzleSolved,
  ]);

  const filteredPuzzles = useMemo(() => {
    let result = [...puzzles];

    if (collection !== "all") {
      result = result.filter((puzzle) => {
        const detected = detectPuzzleCollection(puzzle);
        return detected === collection;
      });
    }

    if (collection === "mate" && mateBucket !== "all") {
      result = result.filter((puzzle) => getMateBucket(puzzle) === mateBucket);
    }

    if ((collection === "tactics" || collection === "endgame") && motif !== "All") {
      result = result.filter((puzzle) => puzzleMatchesMotif(puzzle, motif));
    }

    result = result.filter((puzzle) => puzzleMatchesQuery(puzzle, query));
    result.sort((a, b) => Number(a.rating || 0) - Number(b.rating || 0));
    return result;
  }, [collection, mateBucket, motif, puzzles, query]);

  const activeLabel = useMemo(() => {
    if (collection === "all") return t("All Puzzles");
    if (collection === "mate") {
      return mateBucket === "all"
        ? t("Mate")
        : t("Mate in {{count}}", { count: mateBucket });
    }
    if ((collection === "tactics" || collection === "endgame") && motif !== "All") {
      return `${t(collection === "tactics" ? "Tactics" : "Endgame")} • ${t(motif)}`;
    }
    if (collection === "openings") return t("Openings");
    return t("Filtered");
  }, [collection, mateBucket, motif, t]);

  return (
    <div className="space-y-6 lg:space-y-7">
      <section className="rounded-2xl border border-gray-800 bg-gray-900/70 px-5 py-6 shadow-[0_20px_60px_-48px_rgba(20,184,166,0.4)] sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-teal-500/30 bg-teal-500/10">
              <Puzzle className="h-5 w-5 text-teal-300" />
            </div>
            <div>
              <h1 className="text-3xl font-bold leading-tight text-white">{t("Puzzles")}</h1>
              <p className="mt-1 text-sm text-gray-400">
                {t("Train by motif and track your puzzle strength.")}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <PuzzleStatsCards stats={stats} loading={statsLoading} />
        </div>
      </section>

      <PuzzleBrowseFilters
        query={query}
        onQueryChange={setQuery}
        collection={collection}
        onCollectionChange={(nextCollection) => {
          setCollection(nextCollection);
          setMateBucket("all");
          setMotif("All");
        }}
        mateBucket={mateBucket}
        onMateBucketChange={setMateBucket}
        motif={motif}
        onMotifChange={setMotif}
      />

      <PuzzlesGrid
        puzzles={filteredPuzzles}
        loading={loading}
        totalCount={puzzles.length}
        activeLabel={activeLabel}
      />
    </div>
  );
}
