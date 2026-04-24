"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";

interface User {
  id: string;
  display_name: string;
  is_active: boolean;
  role: string;
  created_at: string;
}

export default function AdminUsersPage() {
  const { session } = useAuth();
  const token = session?.access_token;
  const { toast } = useToast();
  const [rows, setRows] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const res = await api.get<{ data: User[] }>(`/admin/users${qs}`, token);
      setRows(res.data ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const toggle = async (u: User) => {
    if (!token) return;
    const path = u.is_active ? `/admin/users/${u.id}/ban` : `/admin/users/${u.id}/unban`;
    if (u.is_active && !window.confirm(`Ban ${u.display_name}?`)) return;
    try {
      await api.post(path, u.is_active ? { reason: "admin action" } : {}, token);
      setRows((prev) =>
        prev.map((row) => (row.id === u.id ? { ...row, is_active: !u.is_active } : row))
      );
      toast(u.is_active ? "User banned" : "User unbanned", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search display names…"
          className="h-9 w-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 text-sm"
        />
        <button
          type="submit"
          className="border border-[var(--color-border)] px-3 text-xs hover:text-[var(--color-primary)]"
        >
          Search
        </button>
      </form>
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border-subtle)] border border-[var(--color-border)]">
          {rows.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div>
                <p className="text-sm text-[var(--color-primary)]">{u.display_name}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  {u.role} • {u.is_active ? "active" : "inactive"} •{" "}
                  {new Date(u.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggle(u)}
                className="shrink-0 border border-[var(--color-border)] px-2 py-1 text-xs hover:text-[var(--color-primary)]"
              >
                {u.is_active ? "Ban" : "Unban"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
