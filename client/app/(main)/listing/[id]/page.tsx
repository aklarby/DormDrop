"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Heart,
  MessageSquare,
  Flag,
  Clock,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import {
  formatPrice,
  timeAgo,
  cn,
  getSupabaseImageUrl,
} from "@/lib/utils";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/types/constants";

type ListingDetail = {
  id: string;
  title: string;
  description: string;
  price_cents: number;
  condition: string;
  category: string;
  status: string;
  photos: { order: number; path: string }[];
  created_at: string;
  student_id: string;
  students: {
    id: string;
    display_name: string;
    pfp_path: string | null;
    venmo_handle: string | null;
  };
};

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "muted" | "destructive"
> = {
  sold: "success",
  reserved: "warning",
  expired: "muted",
  removed: "destructive",
};

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, session } = useAuth();
  const token = session?.access_token;

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePhoto, setActivePhoto] = useState(0);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const isOwner = user?.id === listing?.student_id;

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .get<ListingDetail>(`/listings/${id}`, token)
      .then(setListing)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, token]);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ data: { listing_id: string }[] }>("/saved", token)
      .then((res) => setSaved((res.data ?? []).some((s) => s.listing_id === id)))
      .catch(() => {});
  }, [id, token]);

  const toggleSave = async () => {
    if (!token) return;
    const prev = saved;
    setSaved(!prev);
    try {
      prev
        ? await api.delete(`/saved/${id}`, token)
        : await api.post(`/saved/${id}`, {}, token);
    } catch {
      setSaved(prev);
    }
  };

  const handleMessage = async () => {
    if (!token || !listing) return;
    setBusy("message");
    try {
      const res = await api.post<{ id: string }>(
        "/conversations",
        { listing_id: listing.id },
        token
      );
      router.push(`/messages?conversation=${res.id}`);
    } catch {
      setBusy(null);
    }
  };

  const handleMarkSold = async () => {
    if (!token || !listing) return;
    setBusy("sold");
    try {
      await api.patch(`/listings/${id}`, { status: "sold" }, token);
      setListing({ ...listing, status: "sold" });
    } catch {
      /* swallow */
    }
    setBusy(null);
  };

  const handleExtend = async () => {
    if (!token) return;
    setBusy("extend");
    try {
      await api.post(`/listings/${id}/extend`, {}, token);
    } catch {
      /* swallow */
    }
    setBusy(null);
  };

  const handleRemove = async () => {
    if (!token) return;
    setBusy("remove");
    try {
      await api.delete(`/listings/${id}`, token);
      router.push("/browse");
    } catch {
      setBusy(null);
    }
  };

  const submitReport = async () => {
    if (!token || !reportReason.trim()) return;
    setReportBusy(true);
    try {
      await api.post(
        "/reports",
        {
          target_type: "listing",
          target_id: id,
          reason: reportReason.trim(),
        },
        token
      );
      setReportOpen(false);
      setReportReason("");
    } catch {
      /* swallow */
    }
    setReportBusy(false);
  };

  const photos = (listing?.photos ?? []).sort((a, b) => a.order - b.order);
  const mainUrl = photos[activePhoto]
    ? getSupabaseImageUrl("listing_photos", photos[activePhoto].path)
    : null;

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-16" />
        <div className="grid grid-cols-1 md:grid-cols-[1fr_340px] gap-6">
          <Skeleton className="aspect-square w-full" />
          <div className="space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
            <div className="pt-4 space-y-2">
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Not found ── */
  if (!listing) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-[var(--color-muted)]">Listing not found</p>
        <button
          onClick={() => router.push("/browse")}
          className="mt-2 text-xs text-[var(--color-brand)] hover:underline"
        >
          Back to browse
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Back nav */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors"
      >
        <ArrowLeft size={14} />
        Back
      </button>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_340px] lg:grid-cols-[1fr_380px] gap-6">
        {/* ═══ Image gallery ═══ */}
        <div className="space-y-2">
          {/* Desktop main image */}
          <div className="hidden md:block relative aspect-square bg-[var(--color-surface-sunken)] overflow-hidden">
            {mainUrl ? (
              <Image
                src={mainUrl}
                alt={listing.title}
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 60vw"
                priority
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--color-muted)]">
                No photos
              </div>
            )}
            {listing.status !== "active" && (
              <div className="absolute top-3 left-3">
                <Badge variant={STATUS_VARIANT[listing.status] ?? "muted"}>
                  {listing.status.charAt(0).toUpperCase() +
                    listing.status.slice(1)}
                </Badge>
              </div>
            )}
          </div>

          {/* Desktop thumbnails */}
          {photos.length > 1 && (
            <div className="hidden md:flex gap-1.5 overflow-x-auto">
              {photos.map((p, i) => {
                const url = getSupabaseImageUrl("listing_photos", p.path);
                return (
                  <button
                    key={i}
                    onClick={() => setActivePhoto(i)}
                    className={cn(
                      "relative shrink-0 w-16 h-16 overflow-hidden border-2 transition-colors",
                      i === activePhoto
                        ? "border-[var(--color-brand)]"
                        : "border-transparent hover:border-[var(--color-border)]"
                    )}
                  >
                    {url && (
                      <Image
                        src={url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Mobile horizontal scroll */}
          <div
            ref={scrollContainerRef}
            className="md:hidden flex gap-1 overflow-x-auto snap-x snap-mandatory -mx-4 px-4"
            style={{ scrollbarWidth: "none" }}
          >
            {photos.length > 0 ? (
              photos.map((p, i) => {
                const url = getSupabaseImageUrl("listing_photos", p.path);
                return (
                  <div
                    key={i}
                    className="relative shrink-0 w-[85vw] aspect-square snap-center bg-[var(--color-surface-sunken)]"
                  >
                    {url && (
                      <Image
                        src={url}
                        alt=""
                        fill
                        className="object-contain"
                        sizes="85vw"
                        priority={i === 0}
                      />
                    )}
                    {i === 0 && listing.status !== "active" && (
                      <div className="absolute top-3 left-3">
                        <Badge
                          variant={STATUS_VARIANT[listing.status] ?? "muted"}
                        >
                          {listing.status.charAt(0).toUpperCase() +
                            listing.status.slice(1)}
                        </Badge>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="w-full aspect-square bg-[var(--color-surface-sunken)] flex items-center justify-center text-xs text-[var(--color-muted)]">
                No photos
              </div>
            )}
          </div>
        </div>

        {/* ═══ Details panel ═══ */}
        <div className="space-y-4">
          <div>
            <h1 className="text-base font-medium text-[var(--color-primary)] leading-tight">
              {listing.title}
            </h1>
            <p className="mt-1 text-lg font-[family-name:var(--font-display)] font-semibold text-[var(--color-primary)]">
              {formatPrice(listing.price_cents)}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Badge variant="default">
              {CONDITION_LABELS[listing.condition] ?? listing.condition}
            </Badge>
            <Badge variant="muted">
              {CATEGORY_LABELS[listing.category] ?? listing.category}
            </Badge>
          </div>

          {listing.description && (
            <p className="text-sm text-[var(--color-secondary)] whitespace-pre-wrap leading-relaxed">
              {listing.description}
            </p>
          )}

          <p className="text-xs text-[var(--color-muted)]">
            Listed {timeAgo(listing.created_at)}
          </p>

          {/* ── Seller ── */}
          {listing.students && (
            <div className="border-t border-[var(--color-border-subtle)] pt-4">
              <Link
                href={`/profile/${listing.students.id}`}
                className="flex items-center gap-2.5 group"
              >
                <Avatar
                  src={
                    listing.students.pfp_path
                      ? getSupabaseImageUrl(
                          "profile_pictures",
                          listing.students.pfp_path
                        )
                      : null
                  }
                  alt={listing.students.display_name}
                  fallback={listing.students.display_name?.[0]}
                  size="md"
                />
                <div>
                  <p className="text-sm font-medium text-[var(--color-primary)] group-hover:underline">
                    {listing.students.display_name}
                  </p>
                  {listing.students.venmo_handle && (
                    <p className="text-xs text-[var(--color-muted)]">
                      Venmo: @{listing.students.venmo_handle}
                    </p>
                  )}
                </div>
              </Link>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="space-y-2 pt-1">
            {!isOwner && (
              <>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleMessage}
                    loading={busy === "message"}
                    disabled={listing.status !== "active"}
                    className="flex-1"
                  >
                    <MessageSquare size={14} />
                    Message Seller
                  </Button>
                  <button
                    onClick={toggleSave}
                    aria-label={saved ? "Unsave" : "Save"}
                    className={cn(
                      "flex items-center justify-center h-8 w-8 border transition-colors",
                      saved
                        ? "border-[var(--color-brand)] text-[var(--color-brand)]"
                        : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-brand)] hover:border-[var(--color-brand)]"
                    )}
                  >
                    <Heart
                      size={14}
                      fill={saved ? "currentColor" : "none"}
                    />
                  </button>
                </div>

                <button
                  onClick={() => setReportOpen(true)}
                  className="flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-destructive)] transition-colors"
                >
                  <Flag size={12} />
                  Report listing
                </button>
              </>
            )}

            {isOwner && (
              <div className="flex flex-wrap gap-2">
                {listing.status === "active" && (
                  <>
                    <Button
                      variant="outlined"
                      size="sm"
                      onClick={handleMarkSold}
                      loading={busy === "sold"}
                    >
                      <CheckCircle2 size={14} />
                      Mark as Sold
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleExtend}
                      loading={busy === "extend"}
                    >
                      <Clock size={14} />
                      Extend
                    </Button>
                  </>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRemove}
                  loading={busy === "remove"}
                >
                  <Trash2 size={14} />
                  Remove
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Report modal ── */}
      <Modal
        open={reportOpen}
        onClose={() => {
          setReportOpen(false);
          setReportReason("");
        }}
        title="Report Listing"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setReportOpen(false);
                setReportReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={submitReport}
              loading={reportBusy}
              disabled={!reportReason.trim()}
            >
              Submit
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-muted)]">
            Why are you reporting this listing?
          </p>
          <Textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="Describe the issue\u2026"
            rows={3}
          />
        </div>
      </Modal>
    </div>
  );
}
