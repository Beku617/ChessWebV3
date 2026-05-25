import { Users, Download, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import AdminSidebar from "../../components/AdminSidebar";
import { useAdminUsers } from "./useAdminUsers";
import { UserStatsCards } from "./UserStatsCards";
import { UsersTable } from "./UsersTable";
import { UsersPagination } from "./UsersPagination";

export default function AdminUsers() {
  const { t } = useTranslation();
  const {
    users,
    totalUsers,
    stats,
    searchQuery,
    page,
    loadingUsers,
    deleteConfirm,
    deleting,
    banConfirm,
    banReason,
    banning,
    sortBy,
    sortOrder,
    isLoading,
    totalPages,
    setSearchQuery,
    setPage,
    setDeleteConfirm,
    setBanConfirm,
    setBanReason,
    handleDeleteUser,
    handleBanUser,
    handleSort,
    exportUsers,
  } = useAdminUsers();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-theme-panel flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-panel text-theme-foreground ">
      <AdminSidebar />

      <main className="ml-72 p-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Users className="w-7 h-7 text-brand-500" />
              {t("admin.users.pageTitle")}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={exportUsers}
              className="flex items-center gap-2 px-4 py-2 bg-theme-surface hover:bg-theme-surface/80 rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              {t("admin.users.exportCsv")}
            </button>
          </div>
        </div>

        <UserStatsCards stats={stats} />

        {/* Users Table */}
        <div className="bg-theme-panel border border-theme-glass rounded-xl overflow-hidden">
          <UsersTable
            users={users}
            loadingUsers={loadingUsers}
            searchQuery={searchQuery}
            sortBy={sortBy}
            sortOrder={sortOrder}
            deleteConfirm={deleteConfirm}
            banConfirm={banConfirm}
            banReason={banReason}
            deleting={deleting}
            banning={banning}
            onSearchChange={(q) => {
              setSearchQuery(q);
              setPage(0);
            }}
            onSort={handleSort}
            onDeleteConfirm={setDeleteConfirm}
            onBanConfirm={setBanConfirm}
            onBanReasonChange={setBanReason}
            onDelete={handleDeleteUser}
            onBan={handleBanUser}
          />
          <UsersPagination
            page={page}
            totalPages={totalPages}
            totalUsers={totalUsers}
            onPageChange={setPage}
          />
        </div>
      </main>
    </div>
  );
}

