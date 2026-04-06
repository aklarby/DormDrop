"use client";

import Link from "next/link";
import Image from "next/image";
import { Heart } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatPriceShort, timeAgo, getSupabaseImageUrl, cn } from "@/lib/utils";
import { CONDITION_LABELS } from "@/types/constants";

interface ListingCardProps {
  listing: {
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
  };
  saved?: boolean;
  onToggleSave?: (id: string) => void;
}

export function ListingCard({ listing, saved = false, onToggleSave }: ListingCardProps) {
  const imageUrl =
    listing.photos?.[0]?.path
      ? getSupabaseImageUrl("listing_photos", listing.photos[0].path)
      : null;

  const showStatus = listing.status !== "active";

  return (
    <div className="group relative bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] hover:shadow-md transition-shadow duration-200">
      <Link href={`/listing/${listing.id}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-[var(--color-surface-sunken)]">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={listing.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--color-muted)] text-xs">
              No photo
            </div>
          )}
          {showStatus && (
            <div className="absolute top-2 left-2">
              <Badge
                variant={listing.status === "sold" ? "success" : "muted"}
              >
                {listing.status.charAt(0).toUpperCase() + listing.status.slice(1)}
              </Badge>
            </div>
          )}
        </div>

        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-[family-name:var(--font-display)] font-medium text-[var(--color-primary)] leading-tight line-clamp-1">
              {formatPriceShort(listing.price_cents)}
            </p>
            <Badge variant="muted">
              {CONDITION_LABELS[listing.condition] || listing.condition}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--color-secondary)] line-clamp-1">
            {listing.title}
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {timeAgo(listing.created_at)}
            {listing.students?.display_name && ` · ${listing.students.display_name}`}
          </p>
        </div>
      </Link>

      {onToggleSave && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSave(listing.id);
          }}
          className={cn(
            "absolute top-2 right-2 p-1.5 bg-[var(--color-surface-raised)]/80 backdrop-blur-sm transition-colors duration-200",
            saved ? "text-[var(--color-brand)]" : "text-[var(--color-muted)] hover:text-[var(--color-brand)]"
          )}
        >
          <Heart className="w-4 h-4" fill={saved ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
}
