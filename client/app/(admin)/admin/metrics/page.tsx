"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";

interface Metrics {
  window_days: number;
  listings_created: number;
  messages_sent: number;
  reports_filed: number;
  pending_reports: number;
}

export default function AdminMetricsPage() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api
      .get<Metrics>("/admin/metrics", token)
      .then(setM)
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!m) return null;

  const cards = [
    { label: `Listings (last ${m.window_days}d)`, value: m.listings_created },
    { label: `Messages (last ${m.window_days}d)`, value: m.messages_sent },
    { label: `Reports filed (last ${m.window_days}d)`, value: m.reports_filed },
    { label: `Pending reports`, value: m.pending_reports },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
          <p className="text-xs text-[var(--color-muted)]">{c.label}</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--color-primary)]">{c.value}</p>
        </div>
      ))}
    </div>
  );
}
