import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  PresenceStatus,
  presenceDotClass,
  presenceText,
} from "../../../utils/presence";
import { Conversation } from "../types";
import {
  formatConversationTime,
  getInitials,
} from "../utils";

type ConversationSidebarProps = {
  activeChatId: string;
  chatTab: "conversations" | "archived";
  friendPresenceMap: Map<
    string,
    { status: PresenceStatus; lastActiveAt: string | null }
  >;
  loading: boolean;
  search: string;
  tabbedConversations: {
    active: Conversation[];
    archived: Conversation[];
  };
  visibleConversations: Conversation[];
  onSearchChange: (value: string) => void;
  onSelectConversation: (partnerId: string) => void;
  onTabChange: (value: "conversations" | "archived") => void;
};

export function ConversationSidebar({
  activeChatId,
  chatTab,
  friendPresenceMap,
  loading,
  search,
  tabbedConversations,
  visibleConversations,
  onSearchChange,
  onSelectConversation,
  onTabChange,
}: ConversationSidebarProps) {
  const { t } = useTranslation();

  return (
    <aside className="col-span-4 min-w-0 min-h-0 overflow-y-auto premium-scrollbar border-r border-theme-glass bg-theme-panel/95 backdrop-blur-xl">
      <div className="sticky top-0 z-20 bg-theme-panel p-5 backdrop-blur-xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-muted" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("messages.search", "Search conversations")}
            className="w-full rounded-xl border border-theme-glass bg-theme-panel py-2.5 pl-10 pr-3 text-sm text-theme-foreground placeholder:text-theme-disabled outline-none transition-all focus:border-brand-400/80 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      </div>

      <div className="p-4 pt-0">
        <section className="overflow-hidden rounded-xl border border-theme-glass bg-theme-panel shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
          <div className="flex border-b border-theme-glass bg-theme-panel">
            <button
              type="button"
              onClick={() => onTabChange("conversations")}
              className={`flex flex-1 items-center justify-between gap-2 border-r border-theme-glass px-4 py-3 text-[12px] font-semibold leading-4 transition-all ${
                chatTab === "conversations"
                  ? "relative -mb-px border-b border-theme-glass bg-theme-panel text-brand-300 shadow-[inset_0_1px_0_rgba(37,52,78,0.8)]"
                  : "border-b border-theme-glass bg-theme-panel text-theme-muted hover:bg-theme-surface hover:bg-theme-panel hover:text-theme-foreground"
              }`}
            >
              <span>{t("messages.tabConversations", "Conversations")}</span>
              <span
                className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] ${
                  chatTab === "conversations"
                    ? "bg-brand-500/15 text-brand-200"
                    : "bg-theme-panel text-theme-muted"
                }`}
              >
                {tabbedConversations.active.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange("archived")}
              className={`flex flex-1 items-center justify-between gap-2 border-l border-theme-glass px-4 py-3 text-[12px] font-semibold leading-4 transition-all ${
                chatTab === "archived"
                  ? "relative -mb-px border-b border-theme-glass bg-theme-panel text-brand-300 shadow-[inset_0_1px_0_rgba(37,52,78,0.8)]"
                  : "border-b border-theme-glass bg-theme-panel text-theme-muted hover:bg-theme-surface hover:bg-theme-panel hover:text-theme-foreground"
              }`}
            >
              <span>{t("messages.tabArchived", "Archived")}</span>
              <span
                className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] ${
                  chatTab === "archived"
                    ? "bg-brand-500/15 text-brand-200"
                    : "bg-theme-panel text-theme-muted"
                }`}
              >
                {tabbedConversations.archived.length}
              </span>
            </button>
          </div>

          <div className="p-3">
            {loading ? (
              <div className="rounded-xl border border-dashed border-theme-glass bg-theme-panel px-3 py-4 text-center text-xs text-theme-muted">
                {t("messages.loading", "Loading conversations...")}
              </div>
            ) : visibleConversations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-theme-glass bg-theme-panel px-3 py-4 text-center text-xs text-theme-muted">
                {chatTab === "archived"
                  ? t("messages.archivedEmpty", "No archived chats.")
                  : t("messages.conversationsEmpty", "No conversations yet.")}
              </div>
            ) : (
              <div className="space-y-1.5">
                {visibleConversations.map((conversation) => {
                  const selected = activeChatId === conversation.partnerId;
                  const presence = friendPresenceMap.get(conversation.partnerId);
                  const presenceStatus: PresenceStatus =
                    presence?.status || "offline";
                  const presenceLabel = presenceText(
                    presenceStatus,
                    presence?.lastActiveAt || null,
                  );

                  return (
                    <button
                      key={conversation.partnerId}
                      onClick={() => onSelectConversation(conversation.partnerId)}
                      className={`group w-full rounded-[14px] border px-3 py-2.5 text-left transition-all duration-200 ${
                        selected
                          ? "border-brand-400/45 bg-brand-50 shadow-[inset_0_0_0_1px_rgba(45,212,191,0.12),0_8px_18px_rgba(8,145,178,0.12)]"
                          : "border-theme-glass bg-theme-panel hover:border-theme-glass hover:bg-theme-panel"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="relative h-9 w-9 shrink-0 rounded-full bg-theme-panel text-xs font-semibold text-theme-foreground ring-1 ring-theme-border">
                          {conversation.partnerAvatar ? (
                            <img
                              src={conversation.partnerAvatar}
                              alt={conversation.partnerName}
                              className="h-full w-full rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              {getInitials(conversation.partnerName)}
                            </div>
                          )}
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-theme-panel ${presenceDotClass(
                              presenceStatus,
                            )}`}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="truncate pr-1 text-[15px] font-semibold leading-5 text-theme-foreground">
                              {conversation.partnerName}
                            </span>
                            <span className="shrink-0 pt-0.5 text-[11px] leading-4 text-theme-muted">
                              {formatConversationTime(
                                conversation.lastMessageAt,
                              )}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <span className="truncate text-[12px] leading-4 text-theme-muted">
                              {conversation.lastMessage ||
                                t(
                                  "messages.noMessages",
                                  "No messages yet.",
                                )}
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-[11px] leading-4 text-theme-muted">
                                <span
                                  className={`h-2 w-2 rounded-full ${presenceDotClass(
                                    presenceStatus,
                                  )}`}
                                />
                                <span className="max-w-[110px] truncate">
                                  {presenceLabel}
                                </span>
                              </span>
                              {conversation.unreadCount > 0 && (
                                <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[10px] font-semibold text-theme-on-accent">
                                  {conversation.unreadCount > 99
                                    ? "99+"
                                    : conversation.unreadCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}

