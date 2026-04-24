"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Dropdown } from "@/components/ui/Dropdown";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CONDITIONS,
  CONDITION_LABELS,
  LISTING_STATUSES,
} from "@/types/constants";

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({
  value: c,
  label: CATEGORY_LABELS[c] || c,
}));

const CONDITION_OPTIONS = CONDITIONS.map((c) => ({
  value: c,
  label: CONDITION_LABELS[c] || c,
}));

const STATUS_OPTIONS = LISTING_STATUSES.filter((s) =>
  ["active", "reserved", "sold", "removed"].includes(s)
).map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }));

interface Listing {
  id: string;
  title: string;
  description: string | null;
  category: string;
  condition: string;
  price_cents: number;
  is_negotiable: boolean;
  status: string;
  seller_id: string;
  pickup_location: string | null;
}

interface PriceGuidance {
  avg_cents: number | null;
  median_cents: number | null;
  sample_size: number | null;
}

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuth();
  const token = session?.access_token;
  const { toast } = useToast();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("");
  const [price, setPrice] = useState("");
  const [isNegotiable, setIsNegotiable] = useState(false);
  const [status, setStatus] = useState("active");
  const [pickupLocation, setPickupLocation] = useState("");

  const [guidance, setGuidance] = useState<PriceGuidance | null>(null);

  useEffect(() => {
    if (authLoading || !token) return;
    setLoading(true);
    api
      .get<Listing>(`/listings/${id}`, token)
      .then((l) => {
        setListing(l);
        setTitle(l.title);
        setDescription(l.description ?? "");
        setCategory(l.category);
        setCondition(l.condition);
        setPrice((l.price_cents / 100).toFixed(2));
        setIsNegotiable(l.is_negotiable);
        setStatus(l.status);
        setPickupLocation(l.pickup_location ?? "");
      })
      .catch((err) =>
        toast(err instanceof Error ? err.message : "Failed to load listing", "error")
      )
      .finally(() => setLoading(false));
  }, [id, token, authLoading, toast]);

  // Fetch price guidance whenever the user picks a different category/condition.
  useEffect(() => {
    if (!token || !category || !condition) return;
    api
      .get<{ data: PriceGuidance }>(
        `/listings/price-guidance?category=${encodeURIComponent(category)}&condition=${encodeURIComponent(condition)}`,
        token
      )
      .then((res) => setGuidance(res.data ?? null))
      .catch(() => setGuidance(null));
  }, [token, category, condition]);

  if (authLoading || loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <p className="text-sm text-[var(--color-muted)]">Listing not found.</p>
      </div>
    );
  }

  if (user?.id !== listing.seller_id) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <p className="text-sm text-[var(--color-destructive)]">
          You can&apos;t edit this listing — it belongs to someone else.
        </p>
      </div>
    );
  }

  async function handleSave() {
    if (!token || !listing) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast("Title is required", "error");
      return;
    }
    const parsedPrice = Math.round(parseFloat(price || "0") * 100);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast("Price must be a non-negative number", "error");
      return;
    }

    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      if (trimmedTitle !== listing.title) patch.title = trimmedTitle;
      if ((description || null) !== (listing.description || null)) {
        patch.description = description || null;
      }
      if (category !== listing.category) patch.category = category;
      if (condition !== listing.condition) patch.condition = condition;
      if (parsedPrice !== listing.price_cents) patch.price_cents = parsedPrice;
      if (isNegotiable !== listing.is_negotiable) patch.is_negotiable = isNegotiable;
      if (status !== listing.status) patch.status = status;
      if ((pickupLocation || null) !== (listing.pickup_location || null)) {
        patch.pickup_location = pickupLocation || null;
      }

      if (Object.keys(patch).length === 0) {
        toast("Nothing changed", "info");
        setSaving(false);
        return;
      }

      await api.patch(`/listings/${listing.id}`, patch, token);
      toast("Listing updated", "success");
      router.push(`/listing/${listing.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-xs text-[var(--color-secondary)] hover:text-[var(--color-primary)]"
      >
        <ArrowLeft className="w-3 h-3" />
        Back
      </button>

      <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold">
        Edit listing
      </h1>
      <p className="text-xs text-[var(--color-muted)]">
        Title/description changes re-run moderation.
      </p>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-primary)]">
            Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="MacBook Pro 14&quot; M3 — Space Gray"
            maxLength={120}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-primary)]">
            Description
          </label>
          <Textarea
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is it, any flaws, etc."
            maxLength={2000}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-primary)]">
              Category
            </label>
            <Dropdown
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={setCategory}
              placeholder="Category"
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-primary)]">
              Condition
            </label>
            <Dropdown
              options={CONDITION_OPTIONS}
              value={condition}
              onChange={setCondition}
              placeholder="Condition"
              className="w-full"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-primary)]">
            Price (USD)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-muted)]">$</span>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="flex-1"
            />
          </div>
          {guidance && guidance.sample_size && guidance.sample_size > 0 && (
            <p className="mt-1 text-[11px] text-[var(--color-muted)]">
              Similar {CATEGORY_LABELS[category]?.toLowerCase() ?? category} listings
              {" "}in {CONDITION_LABELS[condition]?.toLowerCase() ?? condition}{" "}
              condition average{" "}
              <span className="text-[var(--color-primary)]">
                ${((guidance.avg_cents ?? 0) / 100).toFixed(2)}
              </span>
              {" "}(median{" "}
              <span className="text-[var(--color-primary)]">
                ${((guidance.median_cents ?? 0) / 100).toFixed(2)}
              </span>
              , n={guidance.sample_size}).
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--color-primary)]">
          <input
            type="checkbox"
            checked={isNegotiable}
            onChange={(e) => setIsNegotiable(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-brand)]"
          />
          Accept offers (buyers can send counter-offers)
        </label>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-primary)]">
            Pickup location (optional)
          </label>
          <Input
            value={pickupLocation}
            onChange={(e) => setPickupLocation(e.target.value)}
            placeholder="Hemmingson Center, Jepson, etc."
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-primary)]">
            Status
          </label>
          <Dropdown
            options={STATUS_OPTIONS}
            value={status}
            onChange={setStatus}
            placeholder="Status"
            className="w-full"
          />
          <p className="mt-1 text-[11px] text-[var(--color-muted)]">
            Marking as removed drops the photos from storage.
          </p>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          loading={saving}
          className="flex-1"
        >
          <Check size={14} />
          Save changes
        </Button>
      </div>
    </div>
  );
}
