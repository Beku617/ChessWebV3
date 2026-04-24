import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Search, Send, Loader2, Check } from "lucide-react";
import { useFriendStore, FriendListItem } from "../store/friendStore";
import { GameHistory } from "../historyTypes";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface ShareGameModalProps {
  game: GameHistory;
  onClose: () => void;
}

export function ShareGameModal({ game, onClose }: ShareGameModalProps) {
  const friends = useFriendStore((s) => s.friends);
  const loadFriends = useFriendStore((s) => s.loadAll);
  const [search, setSearch] = useState("");
  const [selectedFriend, setSelectedFriend] = useState<FriendListItem | null>(
    null,
  );
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (friends.length === 0) void loadFriends();
  }, [friends.length, loadFriends]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.name.toLowerCase().includes(q));
  }, [friends, search]);

  const playerIsWhite = game.playAs === "white";
  const resultText =
    game.result === "1-0"
      ? playerIsWhite
        ? "Win"
        : "Loss"
      : game.result === "0-1"
        ? playerIsWhite
          ? "Loss"
          : "Win"
        : "Draw";

  const resultColor =
    resultText === "Win"
      ? "text-brand-400"
      : resultText === "Loss"
        ? "text-rose-400"
        : "text-amber-400";

  const handleSend = useCallback(async () => {
    if (!selectedFriend || sending || sent) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/messages/share-game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          receiverId: selectedFriend.id,
          gameId: game._id,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to share game.");
        return;
      }
      setSent(true);
      setTimeout(() => onClose(), 1200);
    } catch {
      setError("Failed to share game. Please try again.");
    } finally {
      setSending(false);
    }
  }, [selectedFriend, sending, sent, game._id, onClose]);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative mx-4 flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#27354f] bg-[#0c1627]/98 shadow-[0_24px_60px_rgba(0,0,0,0.6)] ring-1 ring-black/40"
        style={{ maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1f2c45] px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-100">Share Game</h3>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors hover:bg-[#1b2a41] hover:text-slate-100"
          >
            Close
          </button>
        </div>

        {/* Game preview */}
        <div className="border-b border-[#1f2c45] px-5 py-3">
          <div className="flex items-center gap-3 rounded-xl border border-[#25344e] bg-[#0b1424]/80 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-slate-100">{game.white}</span>
                <span className="text-slate-500">vs</span>
                <span className="font-medium text-slate-100">{game.black}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                <span className={`font-semibold ${resultColor}`}>
                  {resultText}
                </span>
                <span>·</span>
                <span>{game.timeControl || "—"}</span>
                {game.eco && (
                  <>
                    <span>·</span>
                    <span>{game.eco}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Friend search */}
        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search friends..."
              className="w-full rounded-xl border border-[#25344e] bg-[#0c1629]/90 py-2.5 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all focus:border-brand-400/80 focus:ring-2 focus:ring-brand-500/20"
              autoFocus
            />
          </div>
        </div>

        {/* Friend list */}
        <div
          className="min-h-0 flex-1 overflow-y-auto px-5 py-2 premium-scrollbar"
          style={{ maxHeight: "260px" }}
        >
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#27354f] bg-[#0f192b]/65 px-3 py-6 text-center text-xs text-slate-500">
              {friends.length === 0
                ? "No friends yet."
                : "No matching friends."}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((f) => {
                const selected = selectedFriend?.id === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFriend(selected ? null : f)}
                    className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                      selected
                        ? "border-brand-400/45 bg-brand-500/8 shadow-[inset_0_0_0_1px_rgba(45,212,191,0.12)]"
                        : "border-transparent hover:border-[#314664] hover:bg-[#111e32]/90"
                    }`}
                  >
                    <div className="relative h-9 w-9 shrink-0 rounded-full bg-[#1a2940] text-xs font-semibold text-slate-100 ring-1 ring-[#2a3a57]">
                      {f.avatar ? (
                        <img
                          src={f.avatar}
                          alt={f.name}
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          {f.name
                            .split(" ")
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((p) => p[0]?.toUpperCase() || "")
                            .join("")}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm font-medium text-slate-100">
                        {f.name}
                      </span>
                      {f.rating != null && (
                        <span className="ml-2 text-xs text-slate-400">
                          {f.rating}
                        </span>
                      )}
                    </div>
                    {selected && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mb-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[#1f2c45] px-5 py-4">
          <button
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[#25344e] bg-[#0e1727] px-4 text-sm font-medium text-slate-200 transition-colors hover:bg-[#162237]"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSend()}
            disabled={!selectedFriend || sending || sent}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-white transition-all ${
              sent
                ? "bg-brand-600 shadow-[0_10px_20px_rgba(16,185,129,0.3)]"
                : "bg-brand-600 shadow-[0_10px_20px_rgba(13,148,136,0.35)] hover:bg-brand-500"
            } disabled:cursor-not-allowed disabled:bg-[#1e2a40] disabled:text-slate-600 disabled:shadow-none`}
          >
            {sent ? (
              <>
                <Check className="h-4 w-4" />
                Sent
              </>
            ) : sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

