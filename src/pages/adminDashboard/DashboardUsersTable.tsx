import { Link } from "react-router-dom";
import {
  Users,
  Search,
  Loader2,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { User, LIMIT } from "./types";

interface DashboardUsersTableProps {
  users: User[];
  totalUsers: number;
  page: number;
  searchQuery: string;
  loadingUsers: boolean;
  deleteConfirm: string | null;
  deleting: boolean;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onDeleteClick: (userId: string) => void;
  onDeleteConfirm: (userId: string) => void;
  onDeleteCancel: () => void;
}

export function DashboardUsersTable({
  users,
  totalUsers,
  page,
  searchQuery,
  loadingUsers,
  deleteConfirm,
  deleting,
  onSearchChange,
  onPageChange,
  onDeleteClick,
  onDeleteConfirm,
  onDeleteCancel,
}: DashboardUsersTableProps) {
  const totalPages = Math.ceil(totalUsers / LIMIT);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="w-5 h-5 text-brand-500" />
          Users
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search users..."
            className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-brand-500 w-full sm:w-64"
          />
        </div>
      </div>

      {loadingUsers ? (
        <div className="p-8 flex justify-center">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="p-8 text-center text-gray-500">No users found</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                  User
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Rating
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Games
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Win Rate
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Joined
                </th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {users.map((user) => (
                <tr
                  key={user._id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/30"
                >
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {user.fullName}
                      </div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-900 dark:text-white">
                    {user.rating}
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    {user.gamesPlayed}
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    {user.gamesPlayed > 0
                      ? `${Math.round((user.gamesWon / user.gamesPlayed) * 100)}%`
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {deleteConfirm === user._id ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onDeleteConfirm(user._id)}
                          disabled={deleting}
                          className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-sm disabled:opacity-50"
                        >
                          {deleting ? "..." : "Confirm"}
                        </button>
                        <button
                          onClick={onDeleteCancel}
                          className="px-3 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/admin/users/${user._id}`}
                          className="p-2 text-gray-400 hover:text-brand-500 hover:bg-brand-100 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
                          title="View profile"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => onDeleteClick(user._id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Showing {page * LIMIT + 1} -{" "}
            {Math.min((page + 1) * LIMIT, totalUsers)} of {totalUsers}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(Math.max(0, page - 1))}
              disabled={page === 0}
              className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
