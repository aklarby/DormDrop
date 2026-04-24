"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const POLL_INTERVAL_MS = 60_000;

/**
 * Keeps an unread-message counter up to date for the authenticated user.
 *
 * Uses the /conversations/unread-count RPC-backed endpoint, plus a Supabase
 * realtime subscription on `messages` inserts so the badge flips the moment
 * a new message lands.
 */
export function useUnreadCount(): number {
  const { user, session } = useAuth();
  const token = session?.access_token;
  const [count, setCount] = useState(0);
  const supabase = createClient();
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setCount(0);
      return;
    }
    try {
      const res = await api.get<{ count: number }>("/conversations/unread-count", token);
      setCount(res.count ?? 0);
    } catch {
      // Swallow: a 401 on sign-out is expected.
    }
  }, [token]);

  useEffect(() => {
    // Defer the initial refresh so setState doesn't run synchronously
    // inside the effect body.
    const micro = queueMicrotask(() => refresh());
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (token) {
      pollTimerRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
    void micro;
  }, [refresh, token]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`unread:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as { sender_id?: string } | null;
          if (!row || row.sender_id === user.id) return;
          // The server is authoritative; re-fetch to avoid double-counting
          // messages already read in another tab.
          refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase, refresh]);

  return count;
}
