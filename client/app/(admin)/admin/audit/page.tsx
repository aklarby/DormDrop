"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";

interface AuditRow {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: { id: string; display_name: string } | null;
}

export default function AdminAuditPage() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ data: AuditRow[] }>("/admin/audit", token)
      .then((res) => setRows(res.data ?? []))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="py-6 text-sm text-[var(--color-muted)]">No audit events yet.</p>;
  }

  return (
    <ul className="divide-y divide-[var(--color-border-subtle)] border border-[var(--color-border)]">
      {rows.map((r) => (
        <li key={r.id} className="px-3 py-2 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-[var(--color-primary)]">{r.action}</span>
            <span className="text-xs text-[var(--color-muted)]">
              {new Date(r.created_at).toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            {r.actor?.display_name ?? "system"}
            {r.target_type ? ` • ${r.target_type} ${r.target_id?.slice(0, 8)}` : ""}
          </p>
          {r.metadata && Object.keys(r.metadata).length > 0 && (
            <pre className="mt-1 overflow-x-auto bg-[var(--color-surface-sunken)] p-2 text-[11px]">
              {JSON.stringify(r.metadata, null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ul>
  );
}
