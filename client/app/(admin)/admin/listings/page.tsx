"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";

interface Row {
  id: string;
  title: string;
  status: string;
  price_cents: number;
  seller_id: string;
  students: { display_name: string } | null;
  created_at: string;
}

export default function AdminListingsPage() {
  const { session } = useAuth();
  const token = session?.access_token;
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const res = await api.get<{ data: Row[] }>(`/admin/listings${qs}`, token);
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

  const forceRemove = async (id: string) => {
    if (!token) return;
    if (!window.confirm("Force-remove this listing?")) return;
    try {
      await api.post(`/admin/listings/${id}/remove`, {}, token);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "removed" } : r)));
      toast("Listing removed", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to remove", "error");
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
          placeholder="Search titles…"
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
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-[var(--color-primary)]">{r.title}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  ${(r.price_cents / 100).toFixed(2)} • {r.status} •{" "}
                  {r.students?.display_name ?? "unknown"} •{" "}
                  {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => forceRemove(r.id)}
                className="shrink-0 border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-destructive)] hover:bg-[var(--color-destructive)] hover:text-white"
              >
                Force-remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
