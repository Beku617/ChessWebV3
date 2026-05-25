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
    ? "border-brand-400/50 bg-brand-500/15 text-brand-100 shadow-[0_10px_18px_-16px_rgba(20,184,166,0.9)]"
    : "border-theme-border bg-theme-panel/70 text-theme-muted hover:border-brand-300/40 hover:text-brand-100";
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
    <div className="rounded-2xl border border-theme-border bg-theme-panel/70 p-4 shadow-[0_24px_48px_-46px_rgba(8,145,178,0.45)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-muted" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("Search puzzle title, theme, or motif...")}
            className="h-11 w-full rounded-xl border border-theme-border bg-theme-panel/70 pl-9 pr-3 text-sm text-theme-foreground placeholder:text-theme-disabled outline-none transition-colors focus:border-brand-300/50"
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
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${chipClass(active)}`}
              >
                {t(option.label)}
              </button>
            );
          })}
        </div>
      </div>

      {collection === "mate" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {MATE_BUCKET_OPTIONS.map((option) => {
            const active = mateBucket === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onMateBucketChange(option.id)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${chipClass(active)}`}
              >
                {t(option.label)}
              </button>
            );
          })}
        </div>
      )}

      {motifOptions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {motifOptions.map((item) => {
            const active = motif === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => onMotifChange(item)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${chipClass(active)}`}
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

