"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { getSupabaseImageUrl } from "@/lib/utils";

interface BlockRow {
  blocked_id: string;
  reason: string | null;
  created_at: string;
  students: {
    id: string;
    display_name: string;
    pfp_path: string | null;
  } | null;
}

export default function BlockedUsersPage() {
  const { session, loading: authLoading } = useAuth();
  const token = session?.access_token;
  const { toast } = useToast();

  const [rows, setRows] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !token) return;
    api
      .get<{ data: BlockRow[] }>("/blocks", token)
      .then((res) => setRows(res.data ?? []))
      .catch(() => toast("Failed to load blocked users", "error"))
      .finally(() => setLoading(false));
  }, [authLoading, token, toast]);

  const unblock = async (blockedId: string) => {
    if (!token) return;
    setActingOn(blockedId);
    try {
      await api.delete(`/blocks/${blockedId}`, token);
      setRows((prev) => prev.filter((r) => r.blocked_id !== blockedId));
      toast("Unblocked", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to unblock", "error");
    } finally {
      setActingOn(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-secondary)] hover:text-[var(--color-primary)]"
      >
        <ArrowLeft className="w-3 h-3" />
        Settings
      </Link>

      <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold">
        Blocked users
      </h1>
      <p className="text-xs text-[var(--color-muted)]">
        You won&apos;t see listings or messages from anyone on this list.
      </p>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border border-dashed border-[var(--color-border)] py-12">
          <Ban className="w-5 h-5 text-[var(--color-muted)]" />
          <p className="text-sm text-[var(--color-secondary)]">
            You haven&apos;t blocked anyone.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border-subtle)] border border-[var(--color-border)]">
          {rows.map((row) => (
            <li
              key={row.blocked_id}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <Avatar
                src={
                  row.students?.pfp_path
                    ? getSupabaseImageUrl("profile_pictures", row.students.pfp_path)
                    : undefined
                }
                alt={row.students?.display_name ?? ""}
                fallback={(row.students?.display_name ?? "?").charAt(0)}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm text-[var(--color-primary)]">
                  {row.students?.display_name ?? "Unknown user"}
                </p>
                {row.reason && (
                  <p className="truncate text-xs text-[var(--color-muted)]">
                    {row.reason}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={actingOn === row.blocked_id}
                onClick={() => unblock(row.blocked_id)}
                className="border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
              >
                {actingOn === row.blocked_id ? "…" : "Unblock"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
