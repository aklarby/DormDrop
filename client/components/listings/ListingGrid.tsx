"use client";

import { ListingCard } from "./ListingCard";

interface ListingGridProps {
  listings: Array<{
    id: string;
    title: string;
    price_cents: number;
    condition: string;
    status: string;
    photos: { order: number; path: string }[];
    created_at: string;
    students?: {
      display_name: string;
      pfp_path: string | null;
    };
  }>;
  savedIds?: Set<string>;
  onToggleSave?: (id: string) => void;
  emptyMessage?: string;
}

export function ListingGrid({
  listings,
  savedIds = new Set(),
  onToggleSave,
  emptyMessage = "No listings found",
}: ListingGridProps) {
  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-[var(--color-muted)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {listings.map((listing) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          saved={savedIds.has(listing.id)}
          onToggleSave={onToggleSave}
        />
      ))}
    </div>
  );
}
