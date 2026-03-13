import { Check, Pencil, Trash2, X } from "lucide-react";
import {
  formatCommunityResult,
  formatCommunityTimeControl,
} from "../../../components/community/types";
import { FilterDropdown } from "./FilterDropdown";
import type {
  AdminCommunityPost,
  FilterOption,
  RestrictionDraft,
  RestrictionDuration,
} from "../types";
import {
  formatRestrictionLabel,
  statusClass,
} from "../utils";

interface AdminCommunityReviewSidebarProps {
  post: AdminCommunityPost;
  authorName: string;
  authorId: string;
  contentTypeLabel: string;
  reviewStatusLabel: string;
  reviewStateLabel: string;
  gameOpening: string;
  restrictionDraft: RestrictionDraft | null;
  restrictionDurationOptions: FilterOption[];
  isRestrictionBusy: boolean;
  isRateLimitBypassBusy: boolean;
  postingQuotaLabel: string;
  isBusy: boolean;
  showRejectBox: boolean;
  rejectionDraft: string;
  isEditing: boolean;
  showApproveAction: boolean;
  showRejectAction: boolean;
  showSecondaryActionRow: boolean;
  secondaryActionGridClass: string;
  onRejectionDraftChange: (value: string) => void;
  onApprove: () => void;
  onStartEdit: () => void;
  onOpenReject: () => void;
  onCloseReject: () => void;
  onReject: () => void;
  onDelete: () => void;
  onRestrictionDraftChange: (patch: Partial<RestrictionDraft>) => void;
  onApplyRestriction: (duration: RestrictionDuration, reason: string) => void;
  onClearRestriction: () => void;
  onToggleUnlimitedPosting: (enabled: boolean) => void;
}

export function AdminCommunityReviewSidebar({
  post,
  authorName,
  authorId,
  contentTypeLabel,
  reviewStatusLabel,
  reviewStateLabel,
  gameOpening,
  restrictionDraft,
  restrictionDurationOptions,
  isRestrictionBusy,
  isRateLimitBypassBusy,
  postingQuotaLabel,
  isBusy,
  showRejectBox,
  rejectionDraft,
  isEditing,
  showApproveAction,
  showRejectAction,
  showSecondaryActionRow,
  secondaryActionGridClass,
  onRejectionDraftChange,
  onApprove,
  onStartEdit,
  onOpenReject,
  onCloseReject,
  onReject,
  onDelete,
  onRestrictionDraftChange,
  onApplyRestriction,
  onClearRestriction,
  onToggleUnlimitedPosting,
}: AdminCommunityReviewSidebarProps) {
  const restriction = post.authorPostingRestriction || null;

  return (
    <aside className="border-t border-white/[0.05] bg-[linear-gradient(180deg,rgba(255,255,255,0.015),rgba(255,255,255,0.01))] px-5 py-5 xl:border-l xl:border-t-0 sm:px-6 sm:py-6">
      <div className="flex h-full flex-col">
        <div className="rounded-[20px] border border-white/[0.04] bg-white/[0.025] p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500">Review</div>
          <div className="mt-3 flex items-start justify-between gap-3">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${statusClass(
                post.status,
              )}`}
            >
              {reviewStatusLabel}
            </span>
            <span className="text-right text-xs text-gray-500">{reviewStateLabel}</span>
          </div>

          <div className="mt-4 space-y-3 border-t border-white/[0.05] pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Content type</span>
              <span className="text-gray-100">{contentTypeLabel}</span>
            </div>
            {post.group && (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-500">Group</span>
                <span className="text-right text-gray-200">{post.group.name}</span>
              </div>
            )}
            {post.postType === "game" && post.game && (
              <>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-500">Result</span>
                  <span className="text-right text-gray-200">
                    {formatCommunityResult(post.game.result)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-500">Time control</span>
                  <span className="text-right text-gray-200">
                    {formatCommunityTimeControl(post.game.timeControl)}
                  </span>
                </div>
                {gameOpening && (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-gray-500">Opening</span>
                    <span className="truncate text-right text-gray-200">{gameOpening}</span>
                  </div>
                )}
              </>
            )}
            {post.reviewedBy && (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-500">Reviewed by</span>
                <span className="text-right text-gray-200">{post.reviewedBy.username}</span>
              </div>
            )}
          </div>
        </div>

        {authorId && restrictionDraft && (
          <div className="mt-4 rounded-[20px] border border-white/[0.04] bg-white/[0.025] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500">
                  Posting access
                </div>
                <div className="mt-2 text-sm font-medium text-gray-100">
                  {formatRestrictionLabel(restriction)}
                </div>
              </div>
              <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-gray-400">
                {postingQuotaLabel}
              </span>
            </div>

            <div className="mt-4 space-y-3 border-t border-white/[0.05] pt-4">
              <div className="flex items-center justify-between rounded-[14px] bg-black/10 px-3.5 py-2.5 text-xs">
                <span className="text-gray-400">Posting quota</span>
                <span
                  className={`font-semibold ${
                    restrictionDraft.unlimitedPosts ? "text-emerald-200" : "text-gray-300"
                  }`}
                >
                  {postingQuotaLabel}
                </span>
              </div>

              <button
                type="button"
                disabled={isRateLimitBypassBusy}
                onClick={() => onToggleUnlimitedPosting(!restrictionDraft.unlimitedPosts)}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                  restrictionDraft.unlimitedPosts
                    ? "bg-emerald-500/14 text-emerald-200 hover:bg-emerald-500/22"
                    : "bg-white/[0.06] text-gray-100 hover:bg-white/[0.12]"
                }`}
              >
                {isRateLimitBypassBusy
                  ? "Saving..."
                  : restrictionDraft.unlimitedPosts
                    ? "Disable unlimited posting"
                    : "Enable unlimited posting"}
              </button>

              <FilterDropdown
                ariaLabel={`Posting restriction for ${authorName}`}
                value={restrictionDraft.duration}
                options={restrictionDurationOptions}
                onChange={(value) =>
                  onRestrictionDraftChange({ duration: value as RestrictionDuration })
                }
              />

              <input
                value={restrictionDraft.reason}
                onChange={(event) =>
                  onRestrictionDraftChange({ reason: event.target.value })
                }
                placeholder="Optional restriction reason..."
                className="w-full rounded-xl bg-white/[0.05] px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              />

              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
                <button
                  type="button"
                  disabled={isRestrictionBusy}
                  onClick={() =>
                    onApplyRestriction(restrictionDraft.duration, restrictionDraft.reason)
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.08] px-3.5 py-2.5 text-sm font-semibold text-gray-100 hover:bg-white/[0.14] disabled:opacity-50"
                >
                  {isRestrictionBusy ? "Saving..." : "Apply restriction"}
                </button>

                {restriction?.active && (
                  <button
                    type="button"
                    disabled={isRestrictionBusy}
                    onClick={onClearRestriction}
                    className="inline-flex items-center justify-center rounded-xl bg-emerald-500/14 px-3.5 py-2.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/22 disabled:opacity-50"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {post.rejectionReason && (
          <div className="mt-4 rounded-[18px] bg-red-500/10 px-4 py-3.5 text-sm text-red-200">
            <div className="text-[10px] uppercase tracking-[0.2em] text-red-200/75">
              Rejection note
            </div>
            <div className="mt-2 leading-6">{post.rejectionReason}</div>
          </div>
        )}

        <div className="mt-4 border-t border-white/[0.05] pt-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500">
            Review actions
          </div>

          {showRejectBox && (
            <textarea
              value={rejectionDraft}
              onChange={(event) => onRejectionDraftChange(event.target.value)}
              placeholder="Optional rejection reason..."
              className="mt-3 min-h-[110px] w-full rounded-[18px] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          )}

          <div className="mt-3 space-y-2.5">
            {showApproveAction && (
              <button
                type="button"
                disabled={isBusy}
                onClick={onApprove}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(13,148,136,0.22)] hover:bg-teal-500 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Approve
              </button>
            )}

            {showSecondaryActionRow && (
              <div className={`grid gap-2.5 ${secondaryActionGridClass}`}>
                {!isEditing && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={onStartEdit}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-gray-200 hover:bg-white/[0.1] disabled:opacity-50"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                )}

                {showRejectBox ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={onCloseReject}
                    className="inline-flex items-center justify-center rounded-xl bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-gray-300 hover:bg-white/[0.1] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                ) : showRejectAction ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={onOpenReject}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-500/18 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Reject
                  </button>
                ) : null}
              </div>
            )}

            {showRejectBox && (
              <button
                type="button"
                disabled={isBusy}
                onClick={onReject}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/12 px-4 py-3 text-sm font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Confirm reject
              </button>
            )}

            <button
              type="button"
              disabled={isBusy}
              onClick={onDelete}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-gray-300 hover:bg-white/[0.08] disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
