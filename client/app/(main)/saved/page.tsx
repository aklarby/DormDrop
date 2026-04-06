"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";
import { ListingGrid } from "@/components/listings/ListingGrid";

interface Listing {
  id: string;
  title: string;
  price_cents: number;
  condition: string;
  status: string;
  photos: { order: number; path: string }[];
  created_at: string;
  students?: { display_name: string; pfp_path: string | null };
}

interface SavedItem {
  id: string;
  listing_id: string;
  listing?: Listing;
  listings?: Listing;
}

export default function SavedPage() {
  const { session, loading: authLoading } = useAuth();
  const token = session?.access_token;

  const [listings, setListings] = useState<Listing[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSaved = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.get<SavedItem[]>("/saved", token);
      const extracted = data
        .map((item) => item.listing || item.listings)
        .filter((l): l is Listing => !!l);
      setListings(extracted);
      setSavedIds(new Set(extracted.map((l) => l.id)));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load saved listings"
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (authLoading || !token) return;
    fetchSaved();
  }, [authLoading, token, fetchSaved]);

  async function handleToggleSave(listingId: string) {
    if (!token) return;
    try {
      await api.delete(`/saved/${listingId}`, token);
      setListings((prev) => prev.filter((l) => l.id !== listingId));
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(listingId);
        return next;
      });
    } catch {
      await fetchSaved();
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-base font-medium text-[var(--color-primary)]">
        Saved
      </h1>

      {error && (
        <p className="text-xs text-[var(--color-destructive)]">{error}</p>
      )}

      <ListingGrid
        listings={listings}
        savedIds={savedIds}
        onToggleSave={handleToggleSave}
        emptyMessage="No saved listings yet"
      />
    </div>
  );
}
