import { MessageSquare, Plus, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FilterOption } from "../types";
import { FilterDropdown } from "./FilterDropdown";

type StatPill = {
  label: string;
  value: number;
  filterValue: string;
  tone: string;
};

type AdminCommunityToolbarProps = {
  createRejectionReason: string;
  createStatus: string;
  createText: string;
  error: string;
  isCreateOpen: boolean;
  isCreating: boolean;
  mediaFilter: string;
  mediaOptions: FilterOption[];
  postStatusOptions: FilterOption[];
  search: string;
  statusFilter: string;
  statusOptions: FilterOption[];
  statPills: StatPill[];
  onCreateMediaFileChange: (file: File | null) => void;
  onCreatePost: () => void;
  onCreateRejectionReasonChange: (value: string) => void;
  onCreateStatusChange: (value: string) => void;
  onCreateTextChange: (value: string) => void;
  onMediaFilterChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onToggleCreate: () => void;
};

export function AdminCommunityToolbar({
  createRejectionReason,
  createStatus,
  createText,
  error,
  isCreateOpen,
  isCreating,
  mediaFilter,
  mediaOptions,
  postStatusOptions,
  search,
  statusFilter,
  statusOptions,
  statPills,
  onCreateMediaFileChange,
  onCreatePost,
  onCreateRejectionReasonChange,
  onCreateStatusChange,
  onCreateTextChange,
  onMediaFilterChange,
  onSearchChange,
  onStatusFilterChange,
  onToggleCreate,
}: AdminCommunityToolbarProps) {
  const { t } = useTranslation();

  return (
    <>
      <section className="relative z-30 rounded-2xl bg-[#0c1728]/82 backdrop-blur p-5 mb-6 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {statPills.map((pill) => (
              <button
                key={pill.label}
                type="button"
                onClick={() => onStatusFilterChange(pill.filterValue)}
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm transition-colors ${
                  pill.tone
                } ${
                  statusFilter === pill.filterValue
                    ? "ring-1 ring-white/25"
                    : "opacity-85 hover:opacity-100"
                }`}
              >
                <span className="text-gray-400">{pill.label}</span>
                <span className="font-semibold text-white">{pill.value}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onToggleCreate}
            className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-3.5 py-2 text-sm text-gray-200 hover:bg-white/[0.14] transition-colors shrink-0"
          >
            {isCreateOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {isCreateOpen
              ? t("admin.community.actions.close", "Close")
              : t("admin.community.actions.newPost", "New Post")}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <div className="flex-1 min-w-[260px]">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={t("admin.search.communityPosts")}
                className="w-full rounded-lg bg-white/[0.06] pl-11 pr-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>

          <FilterDropdown
            ariaLabel={t("admin.community.aria.statusFilter", "Status filter")}
            value={statusFilter}
            options={statusOptions}
            onChange={onStatusFilterChange}
          />

          <FilterDropdown
            ariaLabel={t("admin.community.aria.mediaFilter", "Media filter")}
            value={mediaFilter}
            options={mediaOptions}
            onChange={onMediaFilterChange}
          />
        </div>

        {isCreateOpen && (
          <div className="mt-4 space-y-3">
            <textarea
              value={createText}
              onChange={(event) => onCreateTextChange(event.target.value)}
              placeholder={t("admin.community.placeholders.postText", "Post text...")}
              className="w-full min-h-[120px] rounded-xl bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <div className="max-w-[220px]">
              <FilterDropdown
                ariaLabel={t("admin.community.aria.createPostStatus", "Create post status")}
                value={createStatus}
                options={postStatusOptions}
                onChange={onCreateStatusChange}
              />
            </div>
            {createStatus === "rejected" && (
              <input
                value={createRejectionReason}
                onChange={(event) =>
                  onCreateRejectionReasonChange(event.target.value)
                }
                placeholder={t("admin.community.placeholders.rejectionReason", "Rejection reason")}
                className="w-full rounded-lg bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              onChange={(event) =>
                onCreateMediaFileChange(event.target.files?.[0] || null)
              }
              className="block w-full text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/[0.1] file:px-3 file:py-2 file:text-sm file:text-gray-100 hover:file:bg-white/[0.16]"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onCreatePost}
                disabled={isCreating}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {isCreating
                  ? t("admin.community.actions.creating", "Creating...")
                  : t("admin.community.actions.createPost", "Create Post")}
              </button>
            </div>
          </div>
        )}
      </section>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
    </>
  );
}

