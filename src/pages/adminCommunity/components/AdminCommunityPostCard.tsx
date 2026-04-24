import { Check, X } from "lucide-react";
import { Avatar } from "../../../components/community/CommunityUI";
import {
  formatRelativeTime,
  getCommunityMediaItems,
  getCommunityOpeningLabel,
  getInitials,
  resolveAssetUrl,
} from "../../../components/community/types";
import { FilterDropdown } from "./FilterDropdown";
import { AdminCommunityMediaPreview } from "./AdminCommunityMediaPreview";
import { AdminCommunityReviewSidebar } from "./AdminCommunityReviewSidebar";
import type {
  AdminCommunityPost,
  FilterOption,
  RestrictionDraft,
  RestrictionDuration,
} from "../types";
import {
  formatAdminContentType,
  formatStatusLabel,
  inferRestrictionDuration,
} from "../utils";

interface AdminCommunityPostCardProps {
  post: AdminCommunityPost;
  postStatusOptions: FilterOption[];
  restrictionDurationOptions: FilterOption[];
  rejectionDraft: string;
  isBusy: boolean;
  showRejectBox: boolean;
  isEditing: boolean;
  editText: string;
  editStatus: string;
  editRejectionReason: string;
  editRemoveMedia: boolean;
  restrictionDraft: RestrictionDraft | null;
  isRestrictionBusy: boolean;
  isRateLimitBypassBusy: boolean;
  onOpenGallery: (items: { src: string; alt: string }[], index: number) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditTextChange: (value: string) => void;
  onEditStatusChange: (value: string) => void;
  onEditRejectionReasonChange: (value: string) => void;
  onEditMediaFileChange: (file: File | null) => void;
  onEditRemoveMediaChange: (value: boolean) => void;
  onApprove: () => void;
  onOpenReject: () => void;
  onCloseReject: () => void;
  onReject: () => void;
  onDelete: () => void;
  onRejectionDraftChange: (value: string) => void;
  onRestrictionDraftChange: (patch: Partial<RestrictionDraft>) => void;
  onApplyRestriction: (duration: RestrictionDuration, reason: string) => void;
  onClearRestriction: () => void;
  onToggleUnlimitedPosting: (enabled: boolean) => void;
}

export function AdminCommunityPostCard({
  post,
  postStatusOptions,
  restrictionDurationOptions,
  rejectionDraft,
  isBusy,
  showRejectBox,
  isEditing,
  editText,
  editStatus,
  editRejectionReason,
  editRemoveMedia,
  restrictionDraft,
  isRestrictionBusy,
  isRateLimitBypassBusy,
  onOpenGallery,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditTextChange,
  onEditStatusChange,
  onEditRejectionReasonChange,
  onEditMediaFileChange,
  onEditRemoveMediaChange,
  onApprove,
  onOpenReject,
  onCloseReject,
  onReject,
  onDelete,
  onRejectionDraftChange,
  onRestrictionDraftChange,
  onApplyRestriction,
  onClearRestriction,
  onToggleUnlimitedPosting,
}: AdminCommunityPostCardProps) {
  const authorName = post.author?.fullName || "Chess Player";
  const authorId = String(post.author?.id || "");
  const mediaItems = getCommunityMediaItems(post);
  const mediaUrl = resolveAssetUrl(mediaItems[0]?.url || post.mediaUrl);
  const imageItems = mediaItems
    .filter((item) => item.type === "image")
    .map((item) => ({
      ...item,
      url: resolveAssetUrl(item.url),
    }));
  const isGamePost = post.postType === "game";
  const gameOpening = getCommunityOpeningLabel(post.game?.eco, post.game?.event);
  const restriction = post.authorPostingRestriction || null;
  const resolvedRestrictionDraft =
    restrictionDraft || {
      duration: inferRestrictionDuration(restriction),
      reason: restriction?.reason || "",
      unlimitedPosts: Boolean(post.authorPostingRateLimitBypass),
    };
  const contentTypeLabel = formatAdminContentType(post);
  const reviewStatusLabel = formatStatusLabel(post.status);
  const reviewStateLabel = post.reviewedAt
    ? `Reviewed ${formatRelativeTime(post.reviewedAt)}`
    : "Awaiting review";
  const showApproveAction = post.status !== "approved";
  const showRejectAction = post.status !== "rejected";
  const showSecondaryActionRow = !isEditing || showRejectBox || showRejectAction;
  const secondaryActionGridClass =
    !isEditing && (showRejectBox || showRejectAction) ? "grid-cols-2" : "grid-cols-1";

  return (
    <article className="group overflow-hidden rounded-[24px] border border-gray-200 dark:border-white/[0.05] bg-[#0c1728]/88 shadow-[0_22px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl">
      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 dark:border-white/[0.05] pb-4">
              <div className="flex min-w-0 items-center gap-3.5">
                <Avatar initials={getInitials(authorName)} src={post.author?.avatar} size="sm" />
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-semibold text-white">{authorName}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                    <span>Submitted {formatRelativeTime(post.createdAt)}</span>
                    {post.updatedAt && (
                      <span>Updated {formatRelativeTime(post.updatedAt)}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-[10px] uppercase tracking-[0.22em] text-gray-500">
                  Preview
                </div>
                <div className="mt-1 text-xs text-gray-400">{contentTypeLabel}</div>
              </div>
            </div>

            {post.text && (
              <div className="rounded-[18px] border border-gray-200 dark:border-white/[0.04] bg-white/[0.025] px-4 py-3.5">
                <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
                  Caption
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-100/90">
                  {post.text}
                </div>
              </div>
            )}

            {post.group && (
              <div className="rounded-[18px] border border-gray-200 dark:border-white/[0.04] bg-white/[0.02] px-4 py-3 text-sm text-gray-300">
                <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
                  Group
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-[11px] font-semibold text-brand-100">
                    {post.group.name}
                  </span>
                  {post.group.topic && (
                    <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-gray-400">
                      {post.group.topic}
                    </span>
                  )}
                </div>
              </div>
            )}

            {isEditing && (
              <div className="space-y-3 rounded-[18px] border border-gray-200 dark:border-white/[0.05] bg-[#091321]/78 p-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
                  Edit Submission
                </div>
                <textarea
                  value={editText}
                  onChange={(event) => onEditTextChange(event.target.value)}
                  placeholder="Edit post text..."
                  className="min-h-[120px] w-full rounded-xl bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
                <div className="max-w-[220px]">
                  <FilterDropdown
                    ariaLabel="Edit post status"
                    value={editStatus}
                    options={postStatusOptions}
                    onChange={onEditStatusChange}
                  />
                </div>
                {editStatus === "rejected" && (
                  <input
                    value={editRejectionReason}
                    onChange={(event) => onEditRejectionReasonChange(event.target.value)}
                    placeholder="Rejection reason"
                    className="w-full rounded-xl bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                )}
                {isGamePost ? (
                  <div className="rounded-xl bg-white/[0.04] px-4 py-3 text-sm leading-6 text-gray-400">
                    Shared game snapshot is locked for moderation edits. You can update the caption,
                    status, and rejection reason here.
                  </div>
                ) : (
                  <>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                      onChange={(event) => onEditMediaFileChange(event.target.files?.[0] || null)}
                      className="block w-full text-sm text-gray-300 file:mr-3 file:rounded-xl file:border-0 file:bg-white/[0.1] file:px-3 file:py-2 file:text-sm file:text-gray-100 hover:file:bg-white/[0.16]"
                    />
                    {post.mediaType !== "none" && (
                      <label className="inline-flex items-center gap-2 text-xs text-gray-400">
                        <input
                          type="checkbox"
                          checked={editRemoveMedia}
                          onChange={(event) => onEditRemoveMediaChange(event.target.checked)}
                          className="rounded border-white/20 bg-transparent text-brand-500 focus:ring-brand-500/30"
                        />
                        Remove existing media
                      </label>
                    )}
                  </>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/[0.08] px-4 py-2.5 text-sm text-gray-200 hover:bg-white/[0.14]"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={onSaveEdit}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    Save changes
                  </button>
                </div>
              </div>
            )}
          </div>

          <AdminCommunityMediaPreview
            post={post}
            mediaUrl={mediaUrl}
            imageItems={imageItems}
            contentTypeLabel={contentTypeLabel}
            onOpenGallery={onOpenGallery}
          />
        </div>

        <AdminCommunityReviewSidebar
          post={post}
          authorName={authorName}
          authorId={authorId}
          contentTypeLabel={contentTypeLabel}
          reviewStatusLabel={reviewStatusLabel}
          reviewStateLabel={reviewStateLabel}
          gameOpening={gameOpening}
          restrictionDraft={resolvedRestrictionDraft}
          restrictionDurationOptions={restrictionDurationOptions}
          isRestrictionBusy={isRestrictionBusy}
          isRateLimitBypassBusy={isRateLimitBypassBusy}
          isBusy={isBusy}
          showRejectBox={showRejectBox}
          rejectionDraft={rejectionDraft}
          isEditing={isEditing}
          showApproveAction={showApproveAction}
          showRejectAction={showRejectAction}
          showSecondaryActionRow={showSecondaryActionRow}
          secondaryActionGridClass={secondaryActionGridClass}
          onRejectionDraftChange={onRejectionDraftChange}
          onApprove={onApprove}
          onStartEdit={onStartEdit}
          onOpenReject={onOpenReject}
          onCloseReject={onCloseReject}
          onReject={onReject}
          onDelete={onDelete}
          onRestrictionDraftChange={onRestrictionDraftChange}
          onApplyRestriction={onApplyRestriction}
          onClearRestriction={onClearRestriction}
          onToggleUnlimitedPosting={onToggleUnlimitedPosting}
        />
      </div>
    </article>
  );
}

