import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, MessageSquare, Search, Send, UserCheck, UserX } from "lucide-react";
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
}

interface Message {
  _id: string;
  sender: string;
  receiver: string;
  content: string;
  read: boolean;
  createdAt: string;
}

interface RequestEntry {
  userId: string;
  name: string;
  lastMessage: string;
  totalMessages: number;
}

function formatTime(input: string) {
  const d = new Date(input);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Messages() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeChatId = searchParams.get("chat") || searchParams.get("to") || "";
  const presetName = searchParams.get("name") || "";

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [incoming, setIncoming] = useState<RequestEntry[]>([]);
  const [outgoing, setOutgoing] = useState<RequestEntry[]>([]);
  const [search, setSearch] = useState("");
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

  const fetchRequests = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/messages/requests`, {
      credentials: "include",
    });
    if (!res.ok) return;
    const data = await res.json();
    setIncoming(Array.isArray(data.incoming) ? data.incoming : []);
    setOutgoing(Array.isArray(data.outgoing) ? data.outgoing : []);
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
    Promise.all([fetchConversations(), fetchRequests()])
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [fetchConversations, fetchRequests]);

  useEffect(() => {
    void fetchMessages(activeChatId);
  }, [activeChatId, fetchMessages]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchConversations();
      void fetchRequests();
      if (activeChatId) void fetchMessages(activeChatId);
    }, 5000);
    return () => window.clearInterval(id);
  }, [activeChatId, fetchConversations, fetchMessages, fetchRequests]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.partnerName.toLowerCase().includes(q));
  }, [conversations, search]);

  const activeConversation = conversations.find((c) => c.partnerId === activeChatId);

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
      setError(data.error || "Failed to send message.");
      return;
    }

    if (data.mode === "request_pending") {
      setInfo("Message request sent.");
      await fetchRequests();
    }
    await Promise.all([fetchConversations(), fetchMessages(activeChatId)]);
  };

  const acceptRequest = async (userId: string) => {
    const res = await fetch(`${API_URL}/api/messages/requests/${userId}/accept`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      setError("Failed to accept request.");
      return;
    }
    setInfo("Message request accepted.");
    setSearchParams({ chat: userId });
    await Promise.all([fetchRequests(), fetchConversations(), fetchMessages(userId)]);
  };

  const declineRequest = async (userId: string) => {
    const res = await fetch(`${API_URL}/api/messages/requests/${userId}/decline`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      setError("Failed to decline request.");
      return;
    }
    setInfo("Message request declined.");
    await fetchRequests();
  };

  return (
    <div className="min-h-screen h-screen bg-[#f5f5f7] dark:bg-gray-950 text-gray-900 dark:text-white flex transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 ml-72 grid grid-cols-12 h-screen">
        <aside className="col-span-4 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <h1 className="text-xl font-bold mb-3">Messages</h1>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-10 pr-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="p-3 space-y-3">
            <div>
              <div className="text-xs uppercase font-semibold text-gray-500 mb-2">
                Incoming Requests
              </div>
              {incoming.length === 0 ? (
                <div className="text-xs text-gray-500">No incoming requests.</div>
              ) : (
                <div className="space-y-2">
                  {incoming.map((r) => (
                    <div
                      key={r.userId}
                      className="p-2 border border-gray-200 dark:border-gray-800 rounded-lg"
                    >
                      <div className="text-sm font-semibold">{r.name}</div>
                      <div className="text-xs text-gray-500 truncate">{r.lastMessage}</div>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => void acceptRequest(r.userId)}
                          className="flex-1 text-xs bg-emerald-500/15 text-emerald-600 rounded-md py-1 inline-flex items-center justify-center gap-1"
                        >
                          <UserCheck className="w-3 h-3" />
                          Accept
                        </button>
                        <button
                          onClick={() => void declineRequest(r.userId)}
                          className="flex-1 text-xs bg-red-500/15 text-red-600 rounded-md py-1 inline-flex items-center justify-center gap-1"
                        >
                          <UserX className="w-3 h-3" />
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs uppercase font-semibold text-gray-500 mb-2">
                Outgoing Requests
              </div>
              {outgoing.length === 0 ? (
                <div className="text-xs text-gray-500">No outgoing requests.</div>
              ) : (
                <div className="space-y-2">
                  {outgoing.map((r) => (
                    <div
                      key={r.userId}
                      className="p-2 border border-gray-200 dark:border-gray-800 rounded-lg"
                    >
                      <div className="text-sm font-semibold">{r.name}</div>
                      <div className="text-xs text-amber-600">Pending approval</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs uppercase font-semibold text-gray-500 mb-2">
                Conversations
              </div>
              {loading ? (
                <div className="text-xs text-gray-500">Loading...</div>
              ) : filteredConversations.length === 0 ? (
                <div className="text-xs text-gray-500">No conversations.</div>
              ) : (
                <div className="space-y-1">
                  {filteredConversations.map((c) => (
                    <button
                      key={c.partnerId}
                      onClick={() => setSearchParams({ chat: c.partnerId })}
                      className={`w-full text-left p-2 rounded-lg border ${
                        activeChatId === c.partnerId
                          ? "border-teal-500 bg-teal-500/10"
                          : "border-transparent hover:border-gray-200 dark:hover:border-gray-800"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold truncate">{c.partnerName}</span>
                        {c.unreadCount > 0 && (
                          <span className="text-[10px] bg-teal-500 text-white px-1.5 py-0.5 rounded-full">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{c.lastMessage}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="col-span-8 flex flex-col">
          {!activeChatId ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <MessageSquare className="w-8 h-8 mx-auto mb-2" />
                Select a conversation
              </div>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                <div className="font-semibold">
                  {activeConversation?.partnerName || presetName || "Conversation"}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {info && (
                  <div className="text-xs text-teal-600 bg-teal-500/10 border border-teal-500/20 rounded-lg p-2">
                    {info}
                  </div>
                )}
                {error && (
                  <div className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                    {error}
                  </div>
                )}
                {messages.length === 0 ? (
                  <div className="text-sm text-gray-500">No messages yet.</div>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender === user?.id;
                    return (
                      <div key={m._id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${
                            mine
                              ? "bg-teal-600 text-white"
                              : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
                          }`}
                        >
                          <div>{m.content}</div>
                          <div className="text-[10px] mt-1 opacity-80 inline-flex items-center gap-1">
                            {formatTime(m.createdAt)}
                            {mine && m.read && <Check className="w-3 h-3" />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="p-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                <div className="flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    placeholder="Type a message..."
                    className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => void sendMessage()}
                    className="w-10 h-10 rounded-lg bg-teal-600 text-white inline-flex items-center justify-center"
                  >
                    <Send className="w-4 h-4" />
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
