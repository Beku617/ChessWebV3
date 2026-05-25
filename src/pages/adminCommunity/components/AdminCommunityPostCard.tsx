import { Trans, useTranslation } from "react-i18next";
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

const SECONDARY_ACTION_GRID_CLASS = {
  single: "grid-cols-1",
  double: "grid-cols-2",
} as const;

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
  const { t } = useTranslation();
  const authorName =
    post.author?.fullName ||
    t("admin.community.labels.chessPlayer", "Chess Player");
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
    ? t("admin.community.labels.reviewedAt", {
        defaultValue: "Reviewed {{time}}",
        time: formatRelativeTime(post.reviewedAt),
      })
    : t("admin.community.labels.awaitingReview", "Awaiting review");
  const showApproveAction = post.status !== "approved";
  const showRejectAction = post.status !== "rejected";
  const showSecondaryActionRow = !isEditing || showRejectBox || showRejectAction;
  const secondaryActionGridClass =
    !isEditing && (showRejectBox || showRejectAction)
      ? SECONDARY_ACTION_GRID_CLASS.double
      : SECONDARY_ACTION_GRID_CLASS.single;

  return (
    <article className="group overflow-hidden rounded-[24px] border border-theme-glass bg-theme-panel shadow-[0_22px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl">
      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4 border-b border-theme-glass pb-4">
              <div className="flex min-w-0 items-center gap-3.5">
                <Avatar initials={getInitials(authorName)} src={post.author?.avatar} size="sm" />
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-semibold text-theme-on-accent">{authorName}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-theme-muted">
                    <span><Trans>Submitted</Trans> {formatRelativeTime(post.createdAt)}</span>
                    {post.updatedAt && (
                      <span><Trans>Updated</Trans> {formatRelativeTime(post.updatedAt)}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-[10px] uppercase tracking-[0.22em] text-theme-muted"> <Trans>Preview</Trans> </div>
                <div className="mt-1 text-xs text-theme-muted">{contentTypeLabel}</div>
              </div>
            </div>

            {post.text && (
              <div className="rounded-[18px] border border-theme-glass bg-theme-panel/[0.025] px-4 py-3.5">
                <div className="text-[10px] uppercase tracking-[0.2em] text-theme-muted"> <Trans>Caption</Trans> </div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-theme-foreground/90">
                  {post.text}
                </div>
              </div>
            )}

            {post.group && (
              <div className="rounded-[18px] border border-theme-glass bg-theme-panel/[0.02] px-4 py-3 text-sm text-theme-muted">
                <div className="text-[10px] uppercase tracking-[0.2em] text-theme-muted"> <Trans>Group</Trans> </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-[11px] font-semibold text-brand-100">
                    {post.group.name}
                  </span>
                  {post.group.topic && (
                    <span className="rounded-full bg-theme-panel/[0.04] px-2.5 py-1 text-[11px] text-theme-muted">
                      {post.group.topic}
                    </span>
                  )}
                </div>
              </div>
            )}

            {isEditing && (
              <div className="space-y-3 rounded-[18px] border border-theme-glass bg-theme-panel p-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-theme-muted"> <Trans>Edit Submission</Trans> </div>
                <textarea
                  value={editText}
                  onChange={(event) => onEditTextChange(event.target.value)}
                  placeholder={t("admin.community.placeholders.editPostText", "Edit post text...")}
                  className="min-h-[120px] w-full rounded-xl bg-theme-panel/[0.05] px-4 py-3 text-sm text-theme-foreground placeholder:text-theme-disabled focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
                <div className="max-w-[220px]">
                  <FilterDropdown
                    ariaLabel={t("admin.community.aria.editPostStatus", "Edit post status")}
                    value={editStatus}
                    options={postStatusOptions}
                    onChange={onEditStatusChange}
                  />
                </div>
                {editStatus === "rejected" && (
                  <input
                    value={editRejectionReason}
                    onChange={(event) => onEditRejectionReasonChange(event.target.value)}
                    placeholder={t("admin.community.placeholders.rejectionReason", "Rejection reason")}
                    className="w-full rounded-xl bg-theme-panel/[0.05] px-4 py-2.5 text-sm text-theme-foreground placeholder:text-theme-disabled focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                )}
                {isGamePost ? (
                  <div className="rounded-xl bg-theme-panel/[0.04] px-4 py-3 text-sm leading-6 text-theme-muted"> <Trans>Shared game snapshot is locked for moderation edits. You can update the caption, status, and rejection reason here.</Trans> </div>
                ) : (
                  <>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                      onChange={(event) => onEditMediaFileChange(event.target.files?.[0] || null)}
                      className="block w-full text-sm text-theme-muted file:mr-3 file:rounded-xl file:border-0 file:bg-theme-panel/[0.1] file:px-3 file:py-2 file:text-sm file:text-theme-foreground hover:file:bg-theme-panel/[0.16]"
                    />
                    {post.mediaType !== "none" && (
                      <label className="inline-flex items-center gap-2 text-xs text-theme-muted">
                        <input
                          type="checkbox"
                          checked={editRemoveMedia}
                          onChange={(event) => onEditRemoveMediaChange(event.target.checked)}
                          className="rounded border-theme-glass bg-transparent text-brand-500 focus:ring-brand-500/30"
                        /> <Trans>Remove existing media</Trans> </label>
                    )}
                  </>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="inline-flex items-center gap-2 rounded-xl bg-theme-panel/[0.08] px-4 py-2.5 text-sm text-theme-muted hover:bg-theme-panel/[0.14]"
                  >
                    <X className="h-4 w-4" /> <Trans>Cancel</Trans> </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={onSaveEdit}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-theme-on-accent hover:bg-brand-500 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" /> <Trans>Save changes</Trans> </button>
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

