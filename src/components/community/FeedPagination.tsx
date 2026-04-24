import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "...")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  if (left > 2) pages.push("...");
  for (let i = left; i <= right; i += 1) pages.push(i);
  if (right < total - 1) pages.push("...");
  pages.push(total);

  return pages;
}

type FeedPaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function FeedPagination({
  currentPage,
  totalPages,
  onPageChange,
  className = "justify-center",
}: FeedPaginationProps) {
  const { t } = useTranslation();

  if (totalPages <= 1) return null;

  const pageNums = getPageNumbers(currentPage, totalPages);
  const btnBase =
    "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus:outline-none disabled:pointer-events-none disabled:opacity-40";
  const btnPage = (active: boolean) =>
    active
      ? `${btnBase} w-9 h-9 bg-brand-500 text-white shadow-[0_10px_24px_rgba(13,148,136,0.28)]`
      : `${btnBase} w-9 h-9 bg-white/[0.04] text-gray-300 hover:bg-white/[0.08] hover:text-brand-300`;

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        aria-label={t("pagination.previousPage", "Previous page")}
        disabled={currentPage <= 1}
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        className={`${btnBase} w-9 h-9 bg-white/[0.04] text-gray-400 hover:bg-white/[0.08] hover:text-brand-300`}
      >
        <ChevronLeft size={16} />
      </button>

      {pageNums.map((pageNum, index) =>
        pageNum === "..." ? (
          <span
            key={`dots-${index}`}
            className="w-9 h-9 flex items-center justify-center text-gray-500 text-sm select-none"
          >
            ...
          </span>
        ) : (
          <button
            key={pageNum}
            type="button"
            aria-label={t("pagination.goToPage", {
              page: pageNum,
              defaultValue: `Go to page ${pageNum}`,
            })}
            onClick={() => onPageChange(pageNum)}
            className={btnPage(pageNum === currentPage)}
          >
            {pageNum}
          </button>
        ),
      )}

      <button
        type="button"
        aria-label={t("pagination.nextPage", "Next page")}
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        className={`${btnBase} w-9 h-9 bg-white/[0.04] text-gray-400 hover:bg-white/[0.08] hover:text-brand-300`}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
