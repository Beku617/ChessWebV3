import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

type AdminPaginationProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
};

export function AdminPagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  itemLabel,
  onPageChange,
}: AdminPaginationProps) {
  const { t } = useTranslation();

  if (totalItems <= 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-4 text-sm dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-gray-500 dark:text-gray-400">
        {t("pagination.showingRange", {
          start,
          end,
          total: totalItems,
          itemLabel,
          defaultValue: `Showing ${start} - ${end} of ${totalItems} ${itemLabel}`,
        })}
      </span>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {t("pagination.first", "First")}
          </button>
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-lg bg-gray-100 p-2 text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            aria-label={t("pagination.previousPage", "Previous page")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 text-gray-700 dark:text-gray-300">
            {t("pagination.pageOf", {
              page,
              totalPages,
              defaultValue: `Page ${page} of ${totalPages}`,
            })}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded-lg bg-gray-100 p-2 text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            aria-label={t("pagination.nextPage", "Next page")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {t("pagination.last", "Last")}
          </button>
        </div>
      )}
    </div>
  );
}
