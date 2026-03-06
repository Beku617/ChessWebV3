import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  COLLECTION_OPTIONS,
  ENDGAME_MOTIFS,
  MateBucket,
  MATE_BUCKET_OPTIONS,
  PuzzleCollection,
  TACTIC_MOTIFS,
} from "./types";

interface PuzzleBrowseFiltersProps {
  query: string;
  onQueryChange: (value: string) => void;
  collection: PuzzleCollection;
  onCollectionChange: (value: PuzzleCollection) => void;
  mateBucket: MateBucket;
  onMateBucketChange: (value: MateBucket) => void;
  motif: string;
  onMotifChange: (value: string) => void;
}

function chipClass(active: boolean) {
  return active
    ? "bg-teal-500/15 border-teal-400/50 text-teal-500 dark:text-teal-300"
    : "bg-white dark:bg-gray-900/40 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:border-teal-300 dark:hover:border-teal-700";
}

export function PuzzleBrowseFilters({
  query,
  onQueryChange,
  collection,
  onCollectionChange,
  mateBucket,
  onMateBucketChange,
  motif,
  onMotifChange,
}: PuzzleBrowseFiltersProps) {
  const { t } = useTranslation();
  const motifOptions =
    collection === "tactics"
      ? ["All", ...TACTIC_MOTIFS]
      : collection === "endgame"
        ? ["All", ...ENDGAME_MOTIFS]
        : [];

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-5 space-y-4 shadow-sm">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("Search puzzle title, theme, or motif...")}
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/30 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-teal-400 dark:focus:border-teal-500"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {COLLECTION_OPTIONS.map((option) => {
          const active = collection === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onCollectionChange(option.id)}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${chipClass(active)}`}
            >
              {t(option.label)}
            </button>
          );
        })}
      </div>

      {collection === "mate" && (
        <div className="flex flex-wrap gap-2">
          {MATE_BUCKET_OPTIONS.map((option) => {
            const active = mateBucket === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onMateBucketChange(option.id)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${chipClass(active)}`}
              >
                {t(option.label)}
              </button>
            );
          })}
        </div>
      )}

      {motifOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {motifOptions.map((item) => {
            const active = motif === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => onMotifChange(item)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${chipClass(active)}`}
              >
                {t(item)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
