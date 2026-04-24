"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";

interface Report {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  created_at: string;
  reporter: { display_name: string } | null;
}

const ACTIONS: { value: string; label: string }[] = [
  { value: "dismiss", label: "Dismiss" },
  { value: "warn", label: "Warn" },
  { value: "remove_listing", label: "Remove listing" },
  { value: "ban_user", label: "Ban user" },
];

export default function AdminReportsPage() {
  const { session } = useAuth();
  const token = session?.access_token;
  const { toast } = useToast();
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.get<{ data: Report[] }>("/admin/reports", token);
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

  const resolve = async (reportId: string, action: string) => {
    if (!token) return;
    const notes = window.prompt(`Notes for ${action}? (optional)`);
    if (notes === null) return;
    setActing(reportId);
    try {
      await api.post(`/admin/reports/${reportId}/resolve`, { action, notes }, token);
      toast("Report resolved", "success");
      setRows((prev) => prev.filter((r) => r.id !== reportId));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to resolve", "error");
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="py-6 text-sm text-[var(--color-muted)]">No pending reports.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-[var(--color-muted)]">
                {new Date(r.created_at).toLocaleString()} • {r.target_type}
              </p>
              <p className="text-sm text-[var(--color-primary)]">{r.reason}</p>
              {r.reporter && (
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Reported by {r.reporter.display_name}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {ACTIONS.map((a) => (
              <button
                key={a.value}
                type="button"
                disabled={acting === r.id}
                onClick={() => resolve(r.id, a.value)}
                className="border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
