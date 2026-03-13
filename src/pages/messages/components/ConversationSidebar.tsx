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
    <aside className="col-span-4 min-w-0 min-h-0 overflow-y-auto premium-scrollbar border-r border-[#1b2740] bg-white/95 dark:bg-[#0d1525]/92 backdrop-blur-xl">
      <div className="sticky top-0 z-20 bg-[#101a2d]/92 p-5 backdrop-blur-xl">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("messages.search", "Search conversations")}
            className="w-full rounded-xl border border-[#25344e] bg-[#0c1629]/90 py-2.5 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all focus:border-teal-400/80 focus:ring-2 focus:ring-teal-500/20"
          />
        </div>
      </div>

      <div className="p-4 pt-0">
        <section className="overflow-hidden rounded-xl border border-[#25344e] bg-[#0c1629]/60 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
          <div className="flex border-b border-[#25344e] bg-[#0c1629]/65">
            <button
              type="button"
              onClick={() => onTabChange("conversations")}
              className={`flex flex-1 items-center justify-between gap-2 border-r border-[#25344e] px-4 py-3 text-[12px] font-semibold leading-4 transition-all ${
                chatTab === "conversations"
                  ? "relative -mb-px border-b border-[#0c1629] bg-[#0c1629] text-teal-300 shadow-[inset_0_1px_0_rgba(37,52,78,0.8)]"
                  : "border-b border-[#25344e] bg-[#0c1629]/40 text-slate-400 hover:bg-gray-100 dark:hover:bg-[#13223a]/65 hover:text-slate-200"
              }`}
            >
              <span>{t("messages.tabConversations", "Conversations")}</span>
              <span
                className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] ${
                  chatTab === "conversations"
                    ? "bg-teal-500/15 text-teal-200"
                    : "bg-[#1b2d45] text-slate-300"
                }`}
              >
                {tabbedConversations.active.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange("archived")}
              className={`flex flex-1 items-center justify-between gap-2 border-l border-[#25344e] px-4 py-3 text-[12px] font-semibold leading-4 transition-all ${
                chatTab === "archived"
                  ? "relative -mb-px border-b border-[#0c1629] bg-[#0c1629] text-teal-300 shadow-[inset_0_1px_0_rgba(37,52,78,0.8)]"
                  : "border-b border-[#25344e] bg-[#0c1629]/40 text-slate-400 hover:bg-gray-100 dark:hover:bg-[#13223a]/65 hover:text-slate-200"
              }`}
            >
              <span>{t("messages.tabArchived", "Archived")}</span>
              <span
                className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] ${
                  chatTab === "archived"
                    ? "bg-teal-500/15 text-teal-200"
                    : "bg-[#1b2d45] text-slate-300"
                }`}
              >
                {tabbedConversations.archived.length}
              </span>
            </button>
          </div>

          <div className="p-3">
            {loading ? (
              <div className="rounded-xl border border-dashed border-[#27354f] bg-[#0f192b]/65 px-3 py-4 text-center text-xs text-slate-500">
                {t("messages.loading", "Loading conversations...")}
              </div>
            ) : visibleConversations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#27354f] bg-[#0f192b]/65 px-3 py-4 text-center text-xs text-slate-500">
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
                          ? "border-teal-400/45 bg-teal-50 dark:bg-[#10253a]/95 shadow-[inset_0_0_0_1px_rgba(45,212,191,0.12),0_8px_18px_rgba(8,145,178,0.12)]"
                          : "border-[#24334d]/45 bg-[#0d1729]/72 hover:border-gray-300 dark:border-[#314664] hover:bg-[#111e32]/90"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="relative h-9 w-9 shrink-0 rounded-full bg-[#1a2940] text-xs font-semibold text-slate-100 ring-1 ring-[#2a3a57]">
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
                            className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white dark:border-[#0f1828] ${presenceDotClass(
                              presenceStatus,
                            )}`}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="truncate pr-1 text-[15px] font-semibold leading-5 text-slate-100">
                              {conversation.partnerName}
                            </span>
                            <span className="shrink-0 pt-0.5 text-[11px] leading-4 text-slate-500">
                              {formatConversationTime(
                                conversation.lastMessageAt,
                              )}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <span className="truncate text-[12px] leading-4 text-slate-400">
                              {conversation.lastMessage ||
                                t(
                                  "messages.noMessages",
                                  "No messages yet.",
                                )}
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-[11px] leading-4 text-slate-400">
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
                                <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-teal-500 px-1.5 text-[10px] font-semibold text-white">
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
