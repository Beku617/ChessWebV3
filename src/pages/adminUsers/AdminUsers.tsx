import { Users, Download, Loader2 } from "lucide-react";
import AdminSidebar from "../../components/AdminSidebar";
import { useAdminUsers } from "./useAdminUsers";
import { UserStatsCards } from "./UserStatsCards";
import { UsersTable } from "./UsersTable";
import { UsersPagination } from "./UsersPagination";

export default function AdminUsers() {
  const {
    users,
    totalUsers,
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
      <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white">
      <AdminSidebar />

      <main className="ml-72 p-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Users className="w-7 h-7 text-brand-500" />
              User Management
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Manage all registered users on the platform
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={exportUsers}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        <UserStatsCards users={users} totalUsers={totalUsers} />

        {/* Users Table */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
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

