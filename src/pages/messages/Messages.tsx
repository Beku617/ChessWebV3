import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Check,
  Clock3,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Search,
  Send,
  Smile,
  Swords,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import Sidebar from "../../components/Sidebar";
import { useAuthStore } from "../../store/authStore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface Conversation {
  partnerId: string;
  partnerName: string;
  partnerAvatar: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  archived?: boolean;
  isArchived?: boolean;
  status?: string;
  folder?: string;
}

interface Message {
  _id: string;
  sender: string;
  receiver: string;
  content: string;
  read: boolean;
  createdAt: string;
}

function formatTime(input: string) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatConversationTime(input: string) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";

  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function isArchivedConversation(conversation: Conversation) {
  return (
    conversation.archived === true ||
    conversation.isArchived === true ||
    conversation.status === "archived" ||
    conversation.folder === "archived"
  );
}

export default function Messages() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeChatId = searchParams.get("chat") || searchParams.get("to") || "";
  const presetName = searchParams.get("name") || "";

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [chatTab, setChatTab] = useState<"conversations" | "archived">("conversations");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/messages/conversations`, {
      credentials: "include",
    });
    if (!res.ok) return;
    const data = await res.json();
    setConversations(Array.isArray(data.conversations) ? data.conversations : []);
  }, []);

  const fetchMessages = useCallback(async (partnerId: string) => {
    if (!partnerId) {
      setMessages([]);
      return;
    }
    const res = await fetch(`${API_URL}/api/messages/${partnerId}`, {
      credentials: "include",
    });
    if (!res.ok) return;
    const data = await res.json();
    setMessages(Array.isArray(data.messages) ? data.messages : []);
    await fetch(`${API_URL}/api/messages/read/${partnerId}`, {
      method: "PATCH",
      credentials: "include",
    }).catch(() => null);
  }, []);

  useEffect(() => {
    fetchConversations()
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [fetchConversations]);

  useEffect(() => {
    void fetchMessages(activeChatId);
  }, [activeChatId, fetchMessages]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchConversations();
      if (activeChatId) void fetchMessages(activeChatId);
    }, 5000);
    return () => window.clearInterval(id);
  }, [activeChatId, fetchConversations, fetchMessages]);

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedConversations;
    return sortedConversations.filter((c) =>
      c.partnerName.toLowerCase().includes(q),
    );
  }, [sortedConversations, search]);

  const tabbedConversations = useMemo(() => {
    const active = filteredConversations.filter((conversation) => !isArchivedConversation(conversation));
    const archived = filteredConversations.filter((conversation) => isArchivedConversation(conversation));
    return { active, archived };
  }, [filteredConversations]);

  const activeConversation = conversations.find((c) => c.partnerId === activeChatId);
  const visibleConversations = chatTab === "archived" ? tabbedConversations.archived : tabbedConversations.active;
  const hasConversations = sortedConversations.length > 0;

  useEffect(() => {
    if (!activeConversation) return;
    const nextTab = isArchivedConversation(activeConversation) ? "archived" : "conversations";
    setChatTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [activeConversation]);

  // When there is no active chat selected, automatically open the most recent conversation (prefer non-archived).
  useEffect(() => {
    if (loading) return;
    if (activeChatId) return;

    const next =
      tabbedConversations.active[0] ||
      tabbedConversations.archived[0] ||
      null;
    if (next?.partnerId) {
      setSearchParams({ chat: next.partnerId });
    }
  }, [loading, activeChatId, tabbedConversations, setSearchParams]);

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || !activeChatId) return;
    setError(null);
    setInfo(null);
    setDraft("");

    const res = await fetch(`${API_URL}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ receiverId: activeChatId, content }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || t("messages.errors.send", "Failed to send message."));
      return;
    }

    await Promise.all([fetchConversations(), fetchMessages(activeChatId)]);
  };

  const activeTitle = activeConversation?.partnerName || presetName || t("messages.conversation", "Conversation");
  const activeStatus = activeConversation?.lastMessageAt
    ? `${t("messages.lastMessage", "Last message")} ${formatConversationTime(activeConversation.lastMessageAt)}`
    : t("messages.activeNow", "Active now");

  return (
    <div className="min-h-screen h-screen bg-[#060b16] text-slate-100 flex transition-colors duration-300">
      <Sidebar />

      <div className="flex-1 ml-72 grid h-screen min-h-0 grid-cols-12 overflow-hidden">
        <aside className="col-span-4 min-w-0 min-h-0 overflow-y-auto premium-scrollbar border-r border-[#1b2740] bg-[#0d1525]/92 backdrop-blur-xl">
          <div className="sticky top-0 z-20 bg-[#101a2d]/92 p-5 backdrop-blur-xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
                  onClick={() => setChatTab("conversations")}
                  className={`flex flex-1 items-center justify-between gap-2 border-r border-[#25344e] px-4 py-3 text-[12px] font-semibold leading-4 transition-all ${
                    chatTab === "conversations"
                      ? "relative -mb-px border-b border-[#0c1629] bg-[#0c1629] text-teal-300 shadow-[inset_0_1px_0_rgba(37,52,78,0.8)]"
                      : "border-b border-[#25344e] bg-[#0c1629]/40 text-slate-400 hover:bg-[#13223a]/65 hover:text-slate-200"
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
                  onClick={() => setChatTab("archived")}
                  className={`flex flex-1 items-center justify-between gap-2 border-l border-[#25344e] px-4 py-3 text-[12px] font-semibold leading-4 transition-all ${
                    chatTab === "archived"
                      ? "relative -mb-px border-b border-[#0c1629] bg-[#0c1629] text-teal-300 shadow-[inset_0_1px_0_rgba(37,52,78,0.8)]"
                      : "border-b border-[#25344e] bg-[#0c1629]/40 text-slate-400 hover:bg-[#13223a]/65 hover:text-slate-200"
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
                  {visibleConversations.map((c) => {
                    const selected = activeChatId === c.partnerId;
                    return (
                      <button
                        key={c.partnerId}
                        onClick={() => setSearchParams({ chat: c.partnerId })}
                        className={`group w-full rounded-[14px] border px-3 py-2.5 text-left transition-all duration-200 ${
                          selected
                            ? "border-teal-400/45 bg-[#10253a]/95 shadow-[inset_0_0_0_1px_rgba(45,212,191,0.12),0_8px_18px_rgba(8,145,178,0.12)]"
                            : "border-[#24334d]/45 bg-[#0d1729]/72 hover:border-[#314664] hover:bg-[#111e32]/90"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="relative h-9 w-9 shrink-0 rounded-full bg-[#1a2940] text-xs font-semibold text-slate-100 ring-1 ring-[#2a3a57]">
                            {c.partnerAvatar ? (
                              <img
                                src={c.partnerAvatar}
                                alt={c.partnerName}
                                className="h-full w-full rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                {getInitials(c.partnerName)}
                              </div>
                            )}
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#0f1828] ${
                                c.unreadCount > 0 ? "bg-teal-400" : "bg-slate-600"
                              }`}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="truncate pr-1 text-[15px] font-semibold leading-5 text-slate-100">
                                {c.partnerName}
                              </span>
                              <span className="shrink-0 pt-0.5 text-[11px] leading-4 text-slate-500">
                                {formatConversationTime(c.lastMessageAt)}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center justify-between gap-2">
                              <span className="truncate text-[12px] leading-4 text-slate-400">
                                {c.lastMessage || t("messages.noMessages", "No messages yet.")}
                              </span>
                              {c.unreadCount > 0 && (
                                <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-teal-500 px-1.5 text-[10px] font-semibold text-white">
                                  {c.unreadCount > 99 ? "99+" : c.unreadCount}
                                </span>
                              )}
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

        <section className="col-span-8 min-w-0 min-h-0 flex flex-col overflow-hidden bg-[#08101d]/85">
          {!activeChatId ? (
            loading ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
                {t("messages.loadingConversation", "Loading conversations...")}
              </div>
            ) : hasConversations ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
                {t("messages.openingLatest", "Opening your latest conversation...")}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="w-full max-w-md rounded-3xl border border-[#26344c] bg-[#101a2d]/88 p-8 text-center shadow-[0_28px_52px_rgba(0,0,0,0.3)]">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-teal-400/30 bg-teal-500/10 text-teal-300">
                    <MessageSquare className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight text-slate-100">
                    {t("messages.emptyTitle", "No conversations")}
                  </h3>
                  <p className="mx-auto mt-2 max-w-xs text-sm text-slate-400">
                    {t("messages.emptySubtitle", "Choose a player from your list to start a focused, real-time chat.")}
                  </p>
                </div>
              </div>
            )
          ) : (
            <>
              <header className="flex shrink-0 items-center justify-between border-b border-[#1f2c45] bg-[#111b2f]/94 px-5 py-3.5 backdrop-blur-xl">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative h-11 w-11 shrink-0 rounded-full bg-[#1a2940] ring-1 ring-[#2a3a57]">
                    {activeConversation?.partnerAvatar ? (
                      <img
                        src={activeConversation.partnerAvatar}
                        alt={activeTitle}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-100">
                        {getInitials(activeTitle)}
                      </div>
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#111b2f] bg-emerald-400" />
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-100">{activeTitle}</div>
                    <div className="truncate text-xs text-slate-400">{activeStatus}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#2a3a57] bg-[#152238] text-slate-400 transition-colors hover:text-teal-300 hover:bg-teal-500/10"
                  >
                    <Swords className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#2a3a57] bg-[#152238] text-slate-400 transition-colors hover:text-slate-100 hover:bg-[#1b2a41]"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              </header>

              <div className="flex-1 min-h-0 overflow-y-auto premium-scrollbar px-5 py-4">
                {info && (
                  <div className="mb-3 rounded-xl border border-teal-500/30 bg-teal-500/12 px-3 py-2 text-xs font-medium text-teal-300">
                    {info}
                  </div>
                )}
                {error && (
                  <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">
                    {error}
                  </div>
                )}

                {messages.length === 0 ? (
                  <div className="flex h-full min-h-[260px] items-center justify-center">
                    <div className="rounded-2xl border border-dashed border-[#27354f] bg-[#0f192b]/65 px-6 py-8 text-center">
                      <Clock3 className="mx-auto mb-2 h-6 w-6 text-slate-500" />
                      <p className="text-sm text-slate-300">
                        {t("messages.startConversation", "No messages yet. Start the conversation.")}
                      </p>
                    </div>
                  </div>
                ) : (
                  messages.map((m, index) => {
                    const mine = m.sender === user?.id;
                    const previous = messages[index - 1];
                    const grouped = previous && previous.sender === m.sender;
                    const spacing = index === 0 ? "mt-0" : grouped ? "mt-1.5" : "mt-4";

                    return (
                      <div key={m._id} className={`flex ${mine ? "justify-end" : "justify-start"} ${spacing}`}>
                        <div
                          className={`max-w-[76%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            mine
                              ? "rounded-br-md bg-gradient-to-br from-teal-500 to-cyan-500 text-white shadow-[0_10px_24px_rgba(20,184,166,0.28)]"
                              : "rounded-bl-md border border-[#27354f] bg-[#132036] text-slate-100 shadow-[0_8px_20px_rgba(0,0,0,0.22)]"
                          }`}
                        >
                          <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.content}</div>
                          <div
                            className={`mt-1.5 inline-flex items-center gap-1 text-[10px] ${
                              mine ? "text-cyan-100/90" : "text-slate-400"
                            }`}
                          >
                            {formatTime(m.createdAt)}
                            {mine && m.read && <Check className="h-3 w-3" />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="shrink-0 border-t border-[#1f2c45] bg-[#0f182a]/95 px-4 py-3 backdrop-blur-xl">
                <div className="flex items-center gap-2 rounded-2xl border border-[#27354f] bg-[#121e31]/92 p-2">
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[#1b2a41] hover:text-slate-100"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[#1b2a41] hover:text-slate-100"
                  >
                    <Smile className="h-4 w-4" />
                  </button>

                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    placeholder={t("messages.composePlaceholder", "Type a message...")}
                    className="flex-1 bg-transparent px-2 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                  />

                  <button
                    onClick={() => void sendMessage()}
                    disabled={!draft.trim()}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white shadow-[0_10px_20px_rgba(13,148,136,0.35)] transition-all hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-[#1e2a40] disabled:text-slate-600 disabled:shadow-none"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
