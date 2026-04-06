"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Check, X } from "lucide-react";
import { ListingGrid } from "@/components/listings/ListingGrid";
import { Skeleton } from "@/components/ui/Skeleton";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CONDITIONS,
  CONDITION_LABELS,
} from "@/types/constants";

type Listing = {
  id: string;
  title: string;
  price_cents: number;
  condition: string;
  status: string;
  photos: { order: number; path: string }[];
  created_at: string;
  students?: { display_name: string; pfp_path: string | null };
};

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low \u2192 High" },
  { value: "price_desc", label: "Price: High \u2192 Low" },
];

const CONDITION_OPTIONS = [
  { value: "", label: "Any" },
  ...CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] })),
];

const PAGE_SIZE = 20;

function BrowseContent() {
  const searchParams = useSearchParams();
  const search = searchParams.get("search") || "";
  const { session, loading: authLoading } = useAuth();
  const token = session?.access_token;

  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [condition, setCondition] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("newest");

  const [dMin, setDMin] = useState("");
  const [dMax, setDMax] = useState("");

  const [listings, setListings] = useState<Listing[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDMin(minPrice), 500);
    return () => clearTimeout(t);
  }, [minPrice]);

  useEffect(() => {
    const t = setTimeout(() => setDMax(maxPrice), 500);
    return () => clearTimeout(t);
  }, [maxPrice]);

  useEffect(() => {
    if (!catOpen) return;
    const handler = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node))
        setCatOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [catOpen]);

  const buildQuery = useCallback(
    (cursor?: string) => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (categories.size > 0) p.set("category", [...categories].join(","));
      if (condition) p.set("condition", condition);
      if (dMin) {
        const c = Math.round(parseFloat(dMin) * 100);
        if (!isNaN(c) && c > 0) p.set("min_price", String(c));
      }
      if (dMax) {
        const c = Math.round(parseFloat(dMax) * 100);
        if (!isNaN(c) && c > 0) p.set("max_price", String(c));
      }
      if (sort !== "newest") p.set("sort", sort);
      if (cursor) p.set("cursor", cursor);
      p.set("limit", String(PAGE_SIZE));
      return p.toString();
    },
    [search, categories, condition, dMin, dMax, sort]
  );

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setLoading(true);
    cursorRef.current = null;

    api
      .get<{ data: Listing[]; count: number }>(`/listings?${buildQuery()}`, token)
      .then((res) => {
        if (cancelled) return;
        const items = res.data ?? [];
        setListings(items);
        setHasMore(items.length === PAGE_SIZE);
        cursorRef.current =
          items.length > 0 ? items[items.length - 1].created_at : null;
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [buildQuery, authLoading, token]);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ data: { listing_id: string }[] }>("/saved", token)
      .then((res) => setSavedIds(new Set((res.data ?? []).map((s) => s.listing_id))))
      .catch(() => {});
  }, [token]);

  const handleLoadMore = async () => {
    if (!cursorRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.get<{ data: Listing[]; count: number }>(
        `/listings?${buildQuery(cursorRef.current)}`,
        token
      );
      const items = res.data ?? [];
      setListings((prev) => [...prev, ...items]);
      setHasMore(items.length === PAGE_SIZE);
      cursorRef.current =
        items.length > 0 ? items[items.length - 1].created_at : null;
    } catch {
      /* swallow */
    }
    setLoadingMore(false);
  };

  const handleToggleSave = useCallback(
    async (id: string) => {
      if (!token) return;
      const wasSaved = savedIds.has(id);
      setSavedIds((prev) => {
        const next = new Set(prev);
        wasSaved ? next.delete(id) : next.add(id);
        return next;
      });
      try {
        if (wasSaved) await api.delete(`/saved/${id}`, token);
        else await api.post(`/saved/${id}`, {}, token);
      } catch {
        setSavedIds((prev) => {
          const next = new Set(prev);
          wasSaved ? next.add(id) : next.delete(id);
          return next;
        });
      }
    },
    [token, savedIds]
  );

  const toggleCat = (c: string) =>
    setCategories((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });

  const clearFilters = () => {
    setCategories(new Set());
    setCondition("");
    setMinPrice("");
    setMaxPrice("");
    setSort("newest");
  };

  const hasActiveFilters =
    categories.size > 0 || condition || dMin || dMax || sort !== "newest";

  return (
    <div className="space-y-4">
      {search && (
        <p className="text-xs text-[var(--color-muted)]">
          Results for &ldquo;
          <span className="text-[var(--color-primary)]">{search}</span>&rdquo;
        </p>
      )}

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-end gap-2">
        {/* Category multi-select */}
        <div ref={catRef} className="relative flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--color-primary)]">
            Category
          </span>
          <button
            type="button"
            onClick={() => setCatOpen((o) => !o)}
            className={cn(
              "flex h-10 items-center gap-1.5 border bg-[var(--color-surface-raised)] px-3 text-sm",
              "transition-colors duration-200",
              "focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]",
              categories.size > 0
                ? "border-[var(--color-brand)] text-[var(--color-primary)]"
                : "border-[var(--color-border)] text-[var(--color-muted)]"
            )}
          >
            {categories.size > 0 ? `${categories.size} selected` : "All"}
            <ChevronDown
              size={14}
              className={cn(
                "text-[var(--color-muted)] transition-transform duration-200",
                catOpen && "rotate-180"
              )}
            />
            {categories.size > 0 && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setCategories(new Set());
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    setCategories(new Set());
                  }
                }}
                className="ml-0.5 text-[var(--color-muted)] hover:text-[var(--color-primary)]"
              >
                <X size={12} />
              </span>
            )}
          </button>

          {catOpen && (
            <div className="animate-scale-in absolute top-full left-0 z-20 mt-1 w-60 max-h-64 overflow-y-auto border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-1 shadow-lg">
              {CATEGORIES.map((cat) => (
                <label
                  key={cat}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-[var(--color-surface-sunken)] transition-colors duration-200"
                >
                  <span
                    className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center border transition-colors duration-200",
                      categories.has(cat)
                        ? "border-[var(--color-brand)] bg-[var(--color-brand)]"
                        : "border-[var(--color-border)]"
                    )}
                  >
                    {categories.has(cat) && (
                      <Check size={10} className="text-white" />
                    )}
                  </span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={categories.has(cat)}
                    onChange={() => toggleCat(cat)}
                  />
                  <span className="text-[var(--color-primary)]">
                    {CATEGORY_LABELS[cat]}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <Dropdown
          label="Condition"
          options={CONDITION_OPTIONS}
          value={condition}
          onChange={setCondition}
          placeholder="Any"
          className="w-36"
        />

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--color-primary)]">
            Price
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="decimal"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="Min"
              min="0"
              step="0.01"
              className="h-10 w-20 border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2.5 text-sm text-[var(--color-primary)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
            />
            <span className="text-xs text-[var(--color-muted)]">&ndash;</span>
            <input
              type="number"
              inputMode="decimal"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max"
              min="0"
              step="0.01"
              className="h-10 w-20 border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2.5 text-sm text-[var(--color-primary)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
            />
          </div>
        </div>

        <Dropdown
          label="Sort"
          options={SORT_OPTIONS}
          value={sort}
          onChange={setSort}
          className="w-44"
        />

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="mb-2 self-end text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* ── Listings ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="aspect-square w-full" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <ListingGrid
            listings={listings}
            savedIds={savedIds}
            onToggleSave={token ? handleToggleSave : undefined}
            emptyMessage="No listings match your filters"
          />
          {hasMore && (
            <div className="flex justify-center pt-2 pb-4">
              <Button
                variant="outlined"
                size="sm"
                onClick={handleLoadMore}
                loading={loadingMore}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BrowsePage() {
  return (
    <Suspense>
      <BrowseContent />
    </Suspense>
  );
}
