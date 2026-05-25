import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

function joinClasses(...classes: Array<string | undefined | null | false>) {
  return classes.filter(Boolean).join(" ");
}

export interface SidebarMessageItem {
  id: string;
  sender?: string;
  senderId?: string;
  senderUsername?: string;
  content: string;
  createdAt?: string;
  isSystem?: boolean;
  isOwn?: boolean;
  type?: "chat" | "system";
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
  currentUserId?: string | null;
  messagesTopContent?: ReactNode;
  focusMessagesOnTopContent?: boolean;
  onSendMessage?: (message: string) => void;
  disableMessageInput?: boolean;
  hideMessageInput?: boolean;
  messageInputPlaceholder?: string;
  sendButtonLabel?: string;
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

function buildMessageTrackingKey(message: SidebarMessageItem) {
  const senderId = String(message.senderId || "").trim();
  const senderName = String(
    message.senderUsername || message.sender || "",
  ).trim();
  const createdAt = String(message.createdAt || "").trim();
  const content = String(message.content || "").trim();
  const type = String(message.type || "").trim();
  const isSystem = message.isSystem === true ? "1" : "0";

  return [senderId, senderName, createdAt, type, isSystem, content].join("::");
}

export function MoveListTabs({
  movesContent,
  messages,
  showMessagesTab,
  className,
  movesLabel,
  messagesLabel,
  emptyMessagesText,
  defaultTab = "moves",
  currentUserId,
  messagesTopContent,
  focusMessagesOnTopContent = false,
  onSendMessage,
  disableMessageInput = false,
  hideMessageInput = false,
  messageInputPlaceholder,
  sendButtonLabel,
}: MoveListTabsProps) {
  const { t } = useTranslation();
  const resolvedMovesLabel = movesLabel ?? t("quickMatch.tabs.moves", "Moves");
  const resolvedMessagesLabel = messagesLabel ?? t("Messages");
  const resolvedEmptyMessagesText =
    emptyMessagesText ??
    t("quickMatch.chat.emptyMessages", "No messages yet.");
  const resolvedMessageInputPlaceholder =
    messageInputPlaceholder ??
    t("quickMatch.chat.typeMessage", "Type a message...");
  const resolvedSendButtonLabel =
    sendButtonLabel ?? t("quickMatch.chat.send", "Send");
  const canShowMessages = showMessagesTab ?? messages !== undefined;
  const [tab, setTab] = useState<"moves" | "messages">(
    defaultTab === "messages" && !canShowMessages ? "moves" : defaultTab,
  );
  const [draftMessage, setDraftMessage] = useState("");
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const safeMessages = useMemo(() => messages || [], [messages]);
  const activeTab = canShowMessages ? tab : "moves";
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const knownMessageKeysRef = useRef<Set<string>>(new Set());
  const initializedKnownMessagesRef = useRef(false);
  const canShowComposer = Boolean(onSendMessage) && !hideMessageInput;

  useEffect(() => {
    if (activeTab !== "messages") return;
    const container = messagesScrollRef.current;
    if (!container) return;
    if (messagesTopContent && focusMessagesOnTopContent) {
      container.scrollTop = 0;
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [activeTab, focusMessagesOnTopContent, safeMessages, messagesTopContent]);

  useEffect(() => {
    if (!canShowMessages && tab !== "moves") {
      setTab("moves");
    }
  }, [canShowMessages, tab]);

  useEffect(() => {
    if (!canShowMessages || !focusMessagesOnTopContent || !messagesTopContent) {
      return;
    }
    setTab("messages");
  }, [canShowMessages, focusMessagesOnTopContent, messagesTopContent]);

  useEffect(() => {
    if (safeMessages.length === 0) {
      knownMessageKeysRef.current.clear();
      initializedKnownMessagesRef.current = false;
      setUnreadMessageCount(0);
      return;
    }

    const knownKeys = knownMessageKeysRef.current;

    // Do not treat the initial batch as unread; we only badge truly new arrivals.
    if (!initializedKnownMessagesRef.current) {
      safeMessages.forEach((message) => {
        knownKeys.add(buildMessageTrackingKey(message));
      });
      initializedKnownMessagesRef.current = true;
      return;
    }

    let unreadIncrement = 0;

    safeMessages.forEach((message) => {
      const messageKey = buildMessageTrackingKey(message);
      if (knownKeys.has(messageKey)) return;
      knownKeys.add(messageKey);

      if (activeTab === "messages") return;

      const sender = String(
        message.senderUsername || message.sender || "System",
      ).trim() || "System";
      const isSystemMessage =
        message.isSystem === true ||
        message.type === "system" ||
        sender.toLowerCase() === "system";
      const isOwnMessage =
        !isSystemMessage &&
        (message.isOwn === true ||
          (!!currentUserId && message.senderId === currentUserId));

      if (!isSystemMessage && !isOwnMessage) {
        unreadIncrement += 1;
      }
    });

    if (unreadIncrement > 0) {
      setUnreadMessageCount((previous) => previous + unreadIncrement);
    }
  }, [activeTab, currentUserId, safeMessages]);

  useEffect(() => {
    if (activeTab !== "messages") return;
    if (unreadMessageCount === 0) return;
    setUnreadMessageCount(0);
  }, [activeTab, unreadMessageCount]);

  const submitDraftMessage = () => {
    if (!onSendMessage || disableMessageInput) return;
    const trimmedMessage = draftMessage.trim();
    if (!trimmedMessage) return;
    onSendMessage(trimmedMessage);
    setDraftMessage("");
  };

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
                ? "border border-theme-glass bg-theme-panel text-theme-foreground"
                : "text-theme-muted hover:bg-theme-surface/60",
            )}
          >
            {resolvedMovesLabel}
          </button>
          <button
            type="button"
            onClick={() => setTab("messages")}
            className={joinClasses(
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
              tab === "messages"
                ? "border border-theme-glass bg-theme-panel text-theme-foreground"
                : "text-theme-muted hover:bg-theme-surface/60",
            )}
          >
            <span>{resolvedMessagesLabel}</span>
            {unreadMessageCount > 0 ? (
              <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-theme-on-accent">
                {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
              </span>
            ) : null}
          </button>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "moves" ? (
          <div className="h-full overflow-auto p-2.5">{movesContent}</div>
        ) : (
          <div className="h-full flex min-h-0 flex-col">
            <div
              ref={messagesScrollRef}
              className="flex-1 min-h-0 overflow-auto p-2 space-y-1.5"
            >
              {messagesTopContent ? <div>{messagesTopContent}</div> : null}
              {safeMessages.length === 0 && !messagesTopContent ? (
                <div className="text-center text-theme-muted text-xs py-6">
                  {resolvedEmptyMessagesText}
                </div>
              ) : (
                safeMessages.map((message) => {
                  const sender = String(
                    message.senderUsername || message.sender || "System",
                  ).trim() || "System";
                  const content = String(message.content || "").trim();
                  const timeLabel = formatMessageTime(message.createdAt);
                  const isSystemMessage =
                    message.isSystem === true ||
                    message.type === "system" ||
                    sender.toLowerCase() === "system";
                  const isOwnMessage =
                    !isSystemMessage &&
                    (message.isOwn === true ||
                      (!!currentUserId && message.senderId === currentUserId));

                  if (isSystemMessage) {
                    return (
                      <div key={message.id} className="px-2 py-1 text-center">
                        <p className="text-[11px] text-theme-muted">
                          {content || "-"}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={message.id}
                      aria-label={
                        isOwnMessage
                          ? t("game.chat.yourMessage")
                          : t("game.chat.opponentMessage")
                      }
                      className={joinClasses(
                        "flex",
                        isOwnMessage ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={joinClasses(
                          "max-w-[85%] rounded-xl border px-2.5 py-2",
                          isOwnMessage
                            ? "border-brand-400/35 bg-brand-500/12 text-theme-foreground"
                            : "border-theme-glass bg-theme-panel/70 text-theme-foreground",
                        )}
                      >
                        {timeLabel ? (
                          <div
                            className={joinClasses(
                              "mb-1 text-[10px] opacity-70",
                              isOwnMessage ? "text-right" : "text-left",
                            )}
                          >
                            {timeLabel}
                          </div>
                        ) : null}
                        <p className="text-xs whitespace-pre-wrap break-words">
                          {content || "-"}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {canShowComposer ? (
              <div className="border-t border-theme-glass p-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draftMessage}
                    onChange={(event) => setDraftMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.shiftKey) return;
                      event.preventDefault();
                      submitDraftMessage();
                    }}
                    disabled={disableMessageInput}
                    placeholder={resolvedMessageInputPlaceholder}
                    className="flex-1 rounded-lg border border-theme-glass bg-theme-panel/65 px-3 py-2 text-xs text-theme-foreground placeholder:text-theme-disabled focus:border-brand-400/45 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={submitDraftMessage}
                    disabled={disableMessageInput || !draftMessage.trim()}
                    className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-theme-on-accent transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resolvedSendButtonLabel}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

