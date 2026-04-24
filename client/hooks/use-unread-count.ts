"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  // supabase-js caches channels by name; if this hook rebuilds the client
  // every render, StrictMode's double-mount tries to `.on()` a channel
  // that was already `.subscribe()`d from the first mount and throws
  // "cannot add postgres_changes callbacks ... after subscribe()".
  // Memoize so the realtime effect only runs when user.id changes.
  const supabase = useMemo(() => createClient(), []);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<() => void>(() => {});

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

  // Keep a stable ref so the realtime effect below doesn't need refresh
  // in its deps array (which would re-subscribe on every token change).
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    queueMicrotask(() => refresh());
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (token) {
      pollTimerRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [refresh, token]);

  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;

    // supabase-js caches channels by name. Under React StrictMode (and during
    // fast refresh), the cleanup's removeChannel can race the next mount,
    // leaving a subscribed channel in the registry. Calling .on() on an
    // already-subscribed channel throws. A fresh per-mount name avoids the
    // collision entirely.
    const channelName = `unread:${uid}:${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(channelName);
    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as { sender_id?: string } | null;
          if (!row || row.sender_id === uid) return;
          refreshRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, supabase]);

  return count;
}
