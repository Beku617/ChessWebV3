import { Search, Filter, Users, Loader2 } from "lucide-react";
import { SortField, SortOrder } from "./types";

interface UsersTableHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
}

function sortMarker(field: SortField, sortBy: SortField, sortOrder: SortOrder) {
  if (field !== sortBy) return "";
  return sortOrder === "desc" ? " v" : " ^";
}

export function UsersTableHeader({
  searchQuery,
  onSearchChange,
  sortBy,
  sortOrder,
  onSort,
}: UsersTableHeaderProps) {
  return (
    <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name or email..."
            className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-brand-500 w-full sm:w-80"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Filter className="w-4 h-4" />
        <span>Sort by:</span>
        <button
          onClick={() => onSort("createdAt")}
          className={`px-2 py-1 rounded ${sortBy === "createdAt" ? "bg-brand-500/20 text-brand-600" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
        >
          Date{sortMarker("createdAt", sortBy, sortOrder)}
        </button>
        <button
          onClick={() => onSort("rating")}
          className={`px-2 py-1 rounded ${sortBy === "rating" ? "bg-brand-500/20 text-brand-600" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
        >
          Rating{sortMarker("rating", sortBy, sortOrder)}
        </button>
        <button
          onClick={() => onSort("gamesPlayed")}
          className={`px-2 py-1 rounded ${sortBy === "gamesPlayed" ? "bg-brand-500/20 text-brand-600" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
        >
          Games{sortMarker("gamesPlayed", sortBy, sortOrder)}
        </button>
      </div>
    </div>
  );
}

interface UsersTableEmptyProps {
  searchQuery: string;
  onClearSearch: () => void;
  isLoading: boolean;
}

export function UsersTableEmpty({
  searchQuery,
  onClearSearch,
  isLoading,
}: UsersTableEmptyProps) {
  if (isLoading) {
    return (
      <div className="p-12 flex justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-12 text-center">
      <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
      <p className="text-gray-500 dark:text-gray-400">No users found</p>
      {searchQuery && (
        <button
          onClick={onClearSearch}
          className="mt-2 text-brand-500 hover:underline text-sm"
        >
          Clear search
        </button>
      )}
    </div>
  );
}
