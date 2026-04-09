"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Send, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { cn, timeAgo, getSupabaseImageUrl } from "@/lib/utils";

interface ConversationRaw {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  listings: {
    id: string;
    title: string;
    photos: { order: number; path: string }[];
    price_cents: number;
  };
  buyer: {
    id: string;
    display_name: string;
    pfp_path: string | null;
  };
  seller: {
    id: string;
    display_name: string;
    pfp_path: string | null;
    venmo_handle: string | null;
  };
}

interface Conversation {
  id: string;
  listing: {
    id: string;
    title: string;
    photos: { order: number; path: string }[];
  };
  other_user: {
    id: string;
    display_name: string;
    pfp_path: string | null;
    venmo_handle?: string | null;
  };
  last_message: {
    body: string;
    created_at: string;
    sender_id: string;
  } | null;
  unread_count: number;
}

interface MessageRaw {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  is_read: boolean;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

function MessagesContent() {
  const searchParams = useSearchParams();
  const { user, session, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convoLoading, setConvoLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const token = session?.access_token;

  const active = conversations.find((c) => c.id === activeId) ?? null;

  // fetch conversation list
  useEffect(() => {
    if (!token || !user) return;
    setConvoLoading(true);
    api
      .get<{ data: ConversationRaw[] }>("/conversations", token)
      .then((res) => {
        const mapped: Conversation[] = (res.data ?? []).map((c) => {
          const isBuyer = c.buyer_id === user.id;
          const other = isBuyer ? c.seller : c.buyer;
          return {
            id: c.id,
            listing: { id: c.listings.id, title: c.listings.title, photos: c.listings.photos },
            other_user: {
              id: other.id,
              display_name: other.display_name,
              pfp_path: other.pfp_path,
              venmo_handle: isBuyer ? c.seller.venmo_handle : null,
            },
            last_message: null,
            unread_count: 0,
          };
        });
        setConversations(mapped);
      })
      .catch(() => toast("Failed to load conversations", "error"))
      .finally(() => setConvoLoading(false));
  }, [token, user, toast]);

  // auto-open from URL param after conversations load
  useEffect(() => {
    if (conversations.length === 0) return;
    const paramId = searchParams.get("conversation");
    if (paramId && conversations.some((c) => c.id === paramId)) {
      setActiveId(paramId);
    }
  }, [conversations, searchParams]);

  // fetch messages when active conversation changes
  useEffect(() => {
    if (!activeId || !token) return;

    setMsgsLoading(true);
    setMessages([]);
    api
      .get<{ data: MessageRaw[] }>(`/conversations/${activeId}/messages`, token)
      .then((res) => {
        const msgs: Message[] = (res.data ?? []).map((m) => ({
          id: m.id,
          conversation_id: m.conversation_id,
          sender_id: m.sender_id,
          body: m.body,
          created_at: m.created_at,
        }));
        setMessages(msgs.reverse());
      })
      .catch(() => toast("Failed to load messages", "error"))
      .finally(() => setMsgsLoading(false));

    // mark as read
    api.patch(`/messages/read?conversation_id=${activeId}`, {}, token).catch(() => {});
    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, unread_count: 0 } : c))
    );
  }, [activeId, token, toast]);

  // realtime subscription
  useEffect(() => {
    if (!activeId || !user) return;

    const channel = supabase
      .channel(`messages:${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeId}`,
        },
        (payload) => {
          const raw = payload.new as MessageRaw;
          const msg: Message = {
            id: raw.id,
            conversation_id: raw.conversation_id,
            sender_id: raw.sender_id,
            body: raw.body,
            created_at: raw.created_at,
          };
          if (msg.sender_id === user.id) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          setConversations((prev) =>
            prev.map((c) =>
              c.id === activeId
                ? {
                    ...c,
                    last_message: {
                      body: msg.body,
                      created_at: msg.created_at,
                      sender_id: msg.sender_id,
                    },
                  }
                : c
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeId, user, supabase]);

  // auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // focus input when chat opens
  useEffect(() => {
    if (activeId) inputRef.current?.focus();
  }, [activeId]);

  // send message
  const sendMessage = useCallback(async () => {
    if (!input.trim() || !activeId || !token || !user) return;

    const text = input.trim();
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: activeId,
      sender_id: user.id,
      body: text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setSending(true);

    try {
      const raw = await api.post<MessageRaw>(
        `/conversations/${activeId}/messages`,
        { body: text },
        token
      );
      const real: Message = {
        id: raw.id,
        conversation_id: raw.conversation_id,
        sender_id: raw.sender_id,
        body: raw.body,
        created_at: raw.created_at,
      };
      setMessages((prev) => prev.map((m) => (m.id === tempId ? real : m)));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                last_message: {
                  body: real.body,
                  created_at: real.created_at,
                  sender_id: real.sender_id,
                },
              }
            : c
        )
      );
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast("Failed to send message", "error");
      setInput(text);
    } finally {
      setSending(false);
    }
  }, [input, activeId, token, user, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // loading
  if (authLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-sm text-[var(--color-secondary)]">Sign in to view messages</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-11rem)] md:h-[calc(100dvh-5.5rem)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] overflow-hidden">
      {/* ---- left panel: conversation list ---- */}
      <div
        className={cn(
          "flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-raised)]",
          "w-full md:w-80 md:shrink-0",
          activeId ? "hidden md:flex" : "flex"
        )}
      >
        <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
          <h1 className="font-[family-name:var(--font-display)] text-base font-semibold">
            Messages
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto">
          {convoLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <MessageSquare size={28} className="text-[var(--color-muted)] mb-2" />
              <p className="text-sm text-[var(--color-secondary)]">No messages yet</p>
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                When you message a seller, it&apos;ll appear here.
              </p>
            </div>
          ) : (
            conversations.map((c) => {
              const firstPhoto = c.listing.photos?.[0];
              const thumb = firstPhoto
                ? getSupabaseImageUrl("listing_photos", typeof firstPhoto === "string" ? firstPhoto : firstPhoto.path)
                : null;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3 text-left transition-colors",
                    c.id === activeId
                      ? "bg-[var(--color-surface-sunken)]"
                      : "hover:bg-[var(--color-surface-sunken)]"
                  )}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface-sunken)]">
                    {thumb ? (
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[var(--color-muted)]">
                        <MessageSquare size={14} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-[var(--color-primary)]">
                        {c.other_user.display_name}
                      </span>
                      {c.last_message && (
                        <span className="shrink-0 text-xs text-[var(--color-muted)]">
                          {timeAgo(c.last_message.created_at)}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-[var(--color-muted)]">
                      {c.listing.title}
                    </p>
                    {c.last_message && (
                      <p className="mt-0.5 truncate text-xs text-[var(--color-secondary)]">
                        {c.last_message.sender_id === user.id ? "You: " : ""}
                        {c.last_message.body}
                      </p>
                    )}
                  </div>
                  {c.unread_count > 0 && (
                    <span className="mt-1 flex h-5 min-w-5 shrink-0 items-center justify-center bg-[var(--color-brand)] px-1.5 text-[10px] font-medium text-white">
                      {c.unread_count}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ---- right panel: active chat ---- */}
      <div
        className={cn(
          "flex flex-1 flex-col min-w-0",
          activeId ? "flex" : "hidden md:flex"
        )}
      >
        {active ? (
          <>
            {/* chat header */}
            <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="md:hidden shrink-0 p-1 text-[var(--color-secondary)] hover:text-[var(--color-primary)]"
              >
                <ArrowLeft size={18} />
              </button>
              <Avatar
                src={active.other_user.pfp_path ? getSupabaseImageUrl("profile_pictures", active.other_user.pfp_path) : undefined}
                alt={active.other_user.display_name}
                fallback={active.other_user.display_name?.[0]}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--color-primary)]">
                  {active.other_user.display_name}
                </p>
                <p className="truncate text-xs text-[var(--color-muted)]">
                  {active.listing.title}
                  {active.other_user.venmo_handle && (
                    <> &middot; <a
                      href={`https://venmo.com/u/${active.other_user.venmo_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 hover:text-[var(--color-primary)] hover:underline"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/Venmo_logo.png" alt="Venmo" width={10} height={10} className="rounded-sm inline" />
                      @{active.other_user.venmo_handle}
                    </a></>
                  )}
                </p>
              </div>
            </div>

            {/* messages list */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {msgsLoading ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-xs text-[var(--color-muted)]">
                    Start the conversation
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {messages.map((msg, i) => {
                    const own = msg.sender_id === user.id;
                    const showTime =
                      i === 0 ||
                      new Date(msg.created_at).getTime() -
                        new Date(messages[i - 1].created_at).getTime() >
                        300_000;
                    return (
                      <div key={msg.id}>
                        {showTime && (
                          <p className="my-2 text-center text-[10px] text-[var(--color-muted)]">
                            {timeAgo(msg.created_at)}
                          </p>
                        )}
                        <div className={cn("flex", own ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[75%] px-3 py-2 text-sm",
                              own
                                ? "bg-[var(--color-brand-subtle)] text-[var(--color-primary)]"
                                : "bg-[var(--color-surface-sunken)] text-[var(--color-primary)]"
                            )}
                          >
                            {msg.body}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* input bar */}
            <div className="shrink-0 border-t border-[var(--color-border)] px-4 py-2">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message…"
                  className="h-10 flex-1 border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 text-sm text-[var(--color-primary)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center transition-colors",
                    input.trim() && !sending
                      ? "bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-light)]"
                      : "bg-[var(--color-surface-sunken)] text-[var(--color-muted)] cursor-not-allowed"
                  )}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center px-4">
            <MessageSquare size={28} className="text-[var(--color-muted)] mb-2" />
            <p className="text-sm text-[var(--color-secondary)]">
              Select a conversation
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      }
    >
      <MessagesContent />
    </Suspense>
  );
}
