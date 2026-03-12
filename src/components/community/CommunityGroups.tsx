import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Plus, Users, X } from "lucide-react";
import { Avatar, SidebarCard, formatCount } from "./CommunityUI";
import { CommunityGroup, getInitials, resolveAssetUrl } from "./types";
import { useBlockingModalLock } from "../../hooks/useBlockingModal";

function groupInitials(group: CommunityGroup) {
  return getInitials(group.name || "Group");
}

export function CommunityGroupAvatar({
  group,
  size = "sm",
}: {
  group: CommunityGroup;
  size?: "sm" | "md" | "lg";
}) {
  const src = resolveAssetUrl(group.avatarUrl);
  return <Avatar initials={groupInitials(group)} src={src} size={size} />;
}

export function CommunityGroupActionButton({
  group,
  busy = false,
  onToggle,
}: {
  group: CommunityGroup;
  busy?: boolean;
  onToggle?: (group: CommunityGroup) => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onToggle?.(group)}
      className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-55 ${
        group.joined
          ? "bg-white/[0.06] text-gray-200 hover:bg-white/[0.12]"
          : "bg-teal-600 text-white hover:bg-teal-500"
      }`}
    >
      {busy ? "Saving..." : group.joined ? "Leave" : "Join"}
    </button>
  );
}

export function CommunityGroupMiniRow({
  group,
  busy = false,
  onToggle,
}: {
  group: CommunityGroup;
  busy?: boolean;
  onToggle?: (group: CommunityGroup) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]">
      <Link to={`/community/groups/${group.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
        <CommunityGroupAvatar group={group} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">
            {group.name}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
            <span>{formatCount(group.memberCount)} members</span>
            {group.topic && <span className="truncate">{group.topic}</span>}
          </div>
        </div>
      </Link>

      <CommunityGroupActionButton group={group} busy={busy} onToggle={onToggle} />
    </div>
  );
}

export function CommunityGroupCard({
  group,
  busy = false,
  onToggle,
  compact = false,
}: {
  group: CommunityGroup;
  busy?: boolean;
  onToggle?: (group: CommunityGroup) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.05] bg-[#0c1728]/82 shadow-[0_18px_50px_rgba(0,0,0,0.2)] ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <div className="flex items-start gap-3">
        <CommunityGroupAvatar group={group} size="md" />
        <div className="min-w-0 flex-1">
          <Link
            to={`/community/groups/${group.slug}`}
            className="block truncate text-base font-semibold text-white hover:text-teal-200 transition-colors"
          >
            {group.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-teal-300/80" />
              {formatCount(group.memberCount)} members
            </span>
            {group.topic && (
              <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-gray-400">
                {group.topic}
              </span>
            )}
          </div>
        </div>

        <CommunityGroupActionButton group={group} busy={busy} onToggle={onToggle} />
      </div>

      <p className="mt-3 max-h-[4.5rem] overflow-hidden text-sm leading-6 text-gray-400">
        {group.description || "A public NeonGambit group for chess discussion and shared games."}
      </p>

      {group.creator && (
        <div className="mt-4 border-t border-white/[0.05] pt-3 text-xs text-gray-500">
          Created by <span className="text-gray-300">{group.creator.fullName}</span>
        </div>
      )}
    </div>
  );
}

export function CommunityGroupsSidebarSection({
  joinedGroups,
  discoverGroups,
  busyGroupId,
  onToggleGroup,
  onOpenCreate,
}: {
  joinedGroups: CommunityGroup[];
  discoverGroups: CommunityGroup[];
  busyGroupId?: string | null;
  onToggleGroup?: (group: CommunityGroup) => void;
  onOpenCreate?: () => void;
}) {
  return (
    <SidebarCard
      title="Groups"
      icon={<Users className="h-4 w-4 text-teal-300" />}
      action={
        <div className="flex items-center gap-2">
          <Link
            to="/community/groups"
            className="text-[11px] font-semibold text-teal-200/80 hover:text-teal-100"
          >
            All groups
          </Link>
          <button
            type="button"
            onClick={onOpenCreate}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-gray-300 transition-colors hover:bg-white/[0.1] hover:text-white"
            aria-label="Create group"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {joinedGroups.length > 0 && (
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-gray-500">
              Joined Groups
            </div>
            <div className="space-y-1.5">
              {joinedGroups.map((group) => (
                <CommunityGroupMiniRow
                  key={group.id}
                  group={group}
                  busy={busyGroupId === group.id}
                  onToggle={onToggleGroup}
                />
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-gray-500">
            Discover
          </div>
          {discoverGroups.length === 0 ? (
            <div className="rounded-xl bg-white/[0.03] px-4 py-4 text-sm text-gray-400">
              More groups will show up here as the community grows.
            </div>
          ) : (
            <div className="space-y-1.5">
              {discoverGroups.map((group) => (
                <CommunityGroupMiniRow
                  key={group.id}
                  group={group}
                  busy={busyGroupId === group.id}
                  onToggle={onToggleGroup}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </SidebarCard>
  );
}

export function CommunityGroupCreateModal({
  open,
  busy = false,
  error = "",
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (payload: { name: string; description: string; topic: string }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState("");
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useBlockingModalLock(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, open]);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setTopic("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 24);
    return () => window.clearTimeout(timeout);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[190] flex items-center justify-center bg-[rgba(4,10,18,0.78)] p-4 backdrop-blur-[2px]"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-group-modal-title"
        className="w-full max-w-xl overflow-hidden rounded-[28px] border border-white/[0.1] bg-[linear-gradient(180deg,rgba(12,22,38,0.92),rgba(8,15,27,0.9))] shadow-[0_32px_90px_rgba(0,0,0,0.48)] backdrop-blur-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-teal-100/80">
              Community Group
            </div>
            <div
              id="community-group-modal-title"
              className="mt-1 text-lg font-semibold text-white"
            >
              Create a group
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-gray-200 transition-colors hover:bg-white/[0.14] hover:text-white disabled:opacity-50"
            aria-label="Close group modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[min(78vh,720px)] overflow-y-auto px-6 py-5 premium-scrollbar">
          <label className="block">
            <div className="mb-2 text-xs font-semibold text-gray-200">Group name</div>
            <input
              ref={nameInputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Opening Lab"
              className="w-full rounded-2xl border border-white/[0.08] bg-black/30 px-4 py-3 text-sm text-white placeholder:text-gray-400 focus:border-teal-400/35 focus:outline-none focus:ring-2 focus:ring-teal-400/25"
            />
          </label>

          <label className="mt-4 block">
            <div className="mb-2 text-xs font-semibold text-gray-200">Description</div>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="A place for sharp opening prep, traps, and post-game notes."
              className="min-h-[120px] w-full rounded-2xl border border-white/[0.08] bg-black/30 px-4 py-3 text-sm leading-6 text-white placeholder:text-gray-400 focus:border-teal-400/35 focus:outline-none focus:ring-2 focus:ring-teal-400/25 premium-scrollbar"
            />
          </label>

          <label className="mt-4 block">
            <div className="mb-2 text-xs font-semibold text-gray-200">Topic</div>
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Openings, Tactics, Clubs..."
              className="w-full rounded-2xl border border-white/[0.08] bg-black/30 px-4 py-3 text-sm text-white placeholder:text-gray-400 focus:border-teal-400/35 focus:outline-none focus:ring-2 focus:ring-teal-400/25"
            />
          </label>

          {error && (
            <div className="mt-4 rounded-2xl bg-red-500/12 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/[0.08] px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl bg-white/[0.08] px-4 py-2.5 text-sm font-semibold text-gray-100 transition-colors hover:bg-white/[0.14] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSubmit({ name, description, topic })}
            className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-500 disabled:opacity-50"
          >
            {busy ? "Creating..." : "Create group"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
