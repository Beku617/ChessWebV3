import { ReactNode, useEffect, useMemo, useState } from "react";

function joinClasses(...classes: Array<string | undefined | null | false>) {
  return classes.filter(Boolean).join(" ");
}

export interface SidebarMessageItem {
  id: string;
  sender?: string;
  content: string;
  createdAt?: string;
}

interface MoveListTabsProps {
  movesContent: ReactNode;
  messages?: SidebarMessageItem[];
  showMessagesTab?: boolean;
  className?: string;
  movesLabel?: string;
  messagesLabel?: string;
  emptyMessagesText?: string;
  defaultTab?: "moves" | "messages";
}

function formatMessageTime(rawDate?: string) {
  if (!rawDate) return "";
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MoveListTabs({
  movesContent,
  messages,
  showMessagesTab,
  className,
  movesLabel = "Moves",
  messagesLabel = "Messages",
  emptyMessagesText = "No messages yet.",
  defaultTab = "moves",
}: MoveListTabsProps) {
  const canShowMessages = showMessagesTab ?? messages !== undefined;
  const [tab, setTab] = useState<"moves" | "messages">(
    defaultTab === "messages" && !canShowMessages ? "moves" : defaultTab,
  );
  const safeMessages = useMemo(() => messages || [], [messages]);
  const activeTab = canShowMessages ? tab : "moves";

  useEffect(() => {
    if (!canShowMessages && tab !== "moves") {
      setTab("moves");
    }
  }, [canShowMessages, tab]);

  return (
    <div className={joinClasses("h-full flex flex-col min-h-0", className)}>
      {canShowMessages ? (
        <div className="theme-glass-panel-soft mx-2 mt-2 mb-2 flex items-center gap-2 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setTab("moves")}
            className={joinClasses(
              "flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
              tab === "moves"
                ? "bg-emerald-500/20 text-emerald-300"
                : "text-gray-600 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-slate-700/60",
            )}
          >
            {movesLabel}
          </button>
          <button
            type="button"
            onClick={() => setTab("messages")}
            className={joinClasses(
              "flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
              tab === "messages"
                ? "bg-emerald-500/20 text-emerald-300"
                : "text-gray-600 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-slate-700/60",
            )}
          >
            {messagesLabel}
          </button>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "moves" ? (
          <div className="h-full overflow-auto p-2.5">{movesContent}</div>
        ) : (
          <div className="h-full overflow-auto p-2 space-y-1.5">
            {safeMessages.length === 0 ? (
              <div className="text-center text-gray-400 dark:text-gray-500 text-xs py-6">
                {emptyMessagesText}
              </div>
            ) : (
              safeMessages.map((message) => {
                const sender = String(message.sender || "System").trim() || "System";
                const content = String(message.content || "").trim();
                const timeLabel = formatMessageTime(message.createdAt);
                return (
                  <div
                    key={message.id}
                    className="rounded-lg border border-gray-200/70 bg-white/60 px-2.5 py-2 dark:border-white/10 dark:bg-slate-900/70"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="font-semibold text-gray-700 dark:text-gray-200">
                        {sender}
                      </span>
                      {timeLabel ? <span>{timeLabel}</span> : null}
                    </div>
                    <p className="mt-1 text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words">
                      {content || "-"}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

