import { useTranslation } from "react-i18next";
import { User, SortField } from "./types";
import { UsersTableHeader, UsersTableEmpty } from "./UsersTableHeader";
import { UserRow } from "./UserRow";

interface UsersTableProps {
  users: User[];
  loadingUsers: boolean;
  searchQuery: string;
  sortBy: SortField;
  sortOrder: "asc" | "desc";
  deleteConfirm: string | null;
  banConfirm: string | null;
  banReason: string;
  deleting: boolean;
  banning: boolean;
  onSearchChange: (query: string) => void;
  onSort: (field: SortField) => void;
  onDeleteConfirm: (userId: string | null) => void;
  onBanConfirm: (userId: string | null) => void;
  onBanReasonChange: (reason: string) => void;
  onDelete: (userId: string) => void;
  onBan: (userId: string, shouldBan: boolean, reason: string) => void;
}

export function UsersTable({
  users,
  loadingUsers,
  searchQuery,
  sortBy,
  sortOrder,
  deleteConfirm,
  banConfirm,
  banReason,
  deleting,
  banning,
  onSearchChange,
  onSort,
  onDeleteConfirm,
  onBanConfirm,
  onBanReasonChange,
  onDelete,
  onBan,
}: UsersTableProps) {
  const { t } = useTranslation();
  return (
    <>
      <UsersTableHeader
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={onSort}
      />

      {loadingUsers || users.length === 0 ? (
        <UsersTableEmpty
          searchQuery={searchQuery}
          onClearSearch={() => onSearchChange("")}
          isLoading={loadingUsers}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-theme-surface">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-theme-muted">
                  {t("admin.users.table.user")}
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-theme-muted">
                  <button
                    onClick={() => onSort("rating")}
                    className="hover:text-brand-500"
                  >
                    {t("admin.users.table.rating")}
                  </button>
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-theme-muted">
                  <button
                    onClick={() => onSort("gamesPlayed")}
                    className="hover:text-brand-500"
                  >
                    {t("admin.users.table.games")}
                  </button>
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-theme-muted">
                  {t("admin.users.table.wld")}
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-theme-muted">
                  {t("admin.users.table.winRate")}
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-theme-muted">
                  {t("admin.users.table.status")}
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-theme-muted">
                  <button
                    onClick={() => onSort("createdAt")}
                    className="hover:text-brand-500"
                  >
                    {t("admin.users.table.joined")}
                  </button>
                </th>
                <th className="text-right px-4 py-3 text-sm font-medium text-theme-muted">
                  {t("admin.users.table.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-glass">
              {users.map((user) => (
                <UserRow
                  key={user._id}
                  user={user}
                  deleteConfirm={deleteConfirm}
                  banConfirm={banConfirm}
                  banReason={banReason}
                  deleting={deleting}
                  banning={banning}
                  onDeleteConfirm={onDeleteConfirm}
                  onBanConfirm={onBanConfirm}
                  onBanReasonChange={onBanReasonChange}
                  onDelete={onDelete}
                  onBan={onBan}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

