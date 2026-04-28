import { Link } from "react-router-dom";
import {
  Mail,
  Calendar,
  Ban,
  ShieldOff,
  Eye,
  Trash2,
  Loader2,
} from "lucide-react";
import { User } from "./types";

interface UserRowProps {
  user: User;
  deleteConfirm: string | null;
  banConfirm: string | null;
  banReason: string;
  deleting: boolean;
  banning: boolean;
  onDeleteConfirm: (userId: string | null) => void;
  onBanConfirm: (userId: string | null) => void;
  onBanReasonChange: (reason: string) => void;
  onDelete: (userId: string) => void;
  onBan: (userId: string, shouldBan: boolean, reason: string) => void;
}

export function UserRow({
  user,
  deleteConfirm,
  banConfirm,
  banReason,
  deleting,
  banning,
  onDeleteConfirm,
  onBanConfirm,
  onBanReasonChange,
  onDelete,
  onBan,
}: UserRowProps) {
  const winRate =
    user.gamesPlayed > 0
      ? Math.round((user.gamesWon / user.gamesPlayed) * 100)
      : 0;

  const accountStatus: "offline" | "active" | "playing" =
    user.accountStatus === "offline" ||
    user.accountStatus === "active" ||
    user.accountStatus === "playing"
      ? user.accountStatus
      : user.presenceStatus === "in_game"
        ? "playing"
        : user.presenceStatus === "offline"
          ? "offline"
          : "active";

  const statusBadgeClass =
    accountStatus === "playing"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      : accountStatus === "active"
        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  const statusLabel =
    accountStatus === "playing"
      ? "Playing"
      : accountStatus === "active"
        ? "Active"
        : "Offline";

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white font-bold">
            {user.fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-medium text-gray-900 dark:text-white">
              {user.fullName}
            </div>
            <div className="text-sm text-gray-500 flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {user.email}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <span className="font-mono font-semibold text-gray-900 dark:text-white">
          {user.rating}
        </span>
      </td>
      <td className="px-4 py-4 text-gray-900 dark:text-white">
        {user.gamesPlayed}
      </td>
      <td className="px-4 py-4">
        <span className="text-sm">
          <span className="text-green-500">{user.gamesWon || 0}</span>
          {" / "}
          <span className="text-red-500">{user.gamesLost || 0}</span>
          {" / "}
          <span className="text-gray-500">{user.gamesDraw || 0}</span>
        </span>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full"
              style={{ width: `${winRate}%` }}
            />
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {winRate}%
          </span>
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass}`}
          >
            {statusLabel}
          </span>
          {user.pendingDeletion ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
              Pending deletion
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
          <Calendar className="w-3 h-3" />
          {new Date(user.createdAt).toLocaleDateString()}
        </div>
      </td>
      <td className="px-4 py-4 text-right">
        <UserRowActions
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
      </td>
    </tr>
  );
}

function UserRowActions({
  user,
  deleteConfirm,
  banConfirm,
  banReason,
  deleting,
  banning,
  onDeleteConfirm,
  onBanConfirm,
  onBanReasonChange,
  onDelete,
  onBan,
}: UserRowProps) {
  if (deleteConfirm === user._id) {
    return (
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => onDelete(user._id)}
          disabled={deleting}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm disabled:opacity-50 transition-colors"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
        </button>
        <button
          onClick={() => onDeleteConfirm(null)}
          className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (banConfirm === user._id) {
    return (
      <div className="flex flex-col items-end gap-2">
        {!user.banned && (
          <input
            type="text"
            value={banReason}
            onChange={(e) => onBanReasonChange(e.target.value)}
            placeholder="Ban reason (optional)"
            className="w-48 px-2 py-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-brand-500"
          />
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onBan(user._id, !user.banned, banReason)}
            disabled={banning}
            className={`px-3 py-1.5 ${user.banned ? "bg-green-600 hover:bg-green-500" : "bg-orange-600 hover:bg-orange-500"} text-white rounded-lg text-sm disabled:opacity-50 transition-colors`}
          >
            {banning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : user.banned ? (
              "Unban"
            ) : (
              "Ban"
            )}
          </button>
          <button
            onClick={() => {
              onBanConfirm(null);
              onBanReasonChange("");
            }}
            className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Link
        to={`/admin/users/${user._id}`}
        className="p-2 text-gray-400 hover:text-brand-500 hover:bg-brand-100 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
        title="View profile"
      >
        <Eye className="w-4 h-4" />
      </Link>
      <button
        onClick={() => onBanConfirm(user._id)}
        className={`p-2 rounded-lg transition-colors ${user.banned ? "text-green-500 hover:text-green-600 hover:bg-green-100 dark:hover:bg-green-900/20" : "text-orange-400 hover:text-orange-500 hover:bg-orange-100 dark:hover:bg-orange-900/20"}`}
        title={user.banned ? "Unban user" : "Ban user"}
      >
        {user.banned ? (
          <ShieldOff className="w-4 h-4" />
        ) : (
          <Ban className="w-4 h-4" />
        )}
      </button>
      <button
        onClick={() => onDeleteConfirm(user._id)}
        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        title="Delete user"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

