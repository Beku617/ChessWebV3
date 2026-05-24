import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LIMIT } from "./types";

interface UsersPaginationProps {
  page: number;
  totalPages: number;
  totalUsers: number;
  onPageChange: (page: number) => void;
}

export function UsersPagination({
  page,
  totalPages,
  totalUsers,
  onPageChange,
}: UsersPaginationProps) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  return (
    <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
      <span className="text-sm text-gray-500 dark:text-gray-400">
        {t("pagination.showingRange", {
          start: page * LIMIT + 1,
          end: Math.min((page + 1) * LIMIT, totalUsers),
          total: totalUsers,
          itemLabel: t("admin.users.itemLabel"),
        })}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(0)}
          disabled={page === 0}
          className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {t("pagination.first")}
        </button>
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-gray-700 dark:text-gray-300 px-2">
          {t("pagination.pageOf", { page: page + 1, totalPages })}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages - 1)}
          disabled={page >= totalPages - 1}
          className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {t("pagination.last")}
        </button>
      </div>
    </div>
  );
}
