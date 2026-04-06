"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, LogOut, Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { getSupabaseImageUrl, formatPriceShort, cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";

interface StudentProfile {
  id: string;
  display_name: string;
  bio: string | null;
  venmo_handle: string | null;
  pfp_path: string | null;
  created_at: string;
}

interface Listing {
  id: string;
  title: string;
  price_cents: number;
  condition: string;
  status: string;
  seller_id: string;
  photos: { order: number; path: string }[];
  created_at: string;
}

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "destructive" | "muted"
> = {
  active: "success",
  sold: "muted",
  reserved: "warning",
  expired: "destructive",
  removed: "destructive",
};

export default function SettingsPage() {
  const router = useRouter();
  const { user, session, loading: authLoading, signOut } = useAuth();
  const token = session?.access_token;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [venmoHandle, setVenmoHandle] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !token) return;

    async function load() {
      try {
        const [profileData, allListings] = await Promise.all([
          api.get<StudentProfile>("/students/me", token),
          api.get<Listing[]>("/listings", token),
        ]);
        setProfile(profileData);
        setDisplayName(profileData.display_name || "");
        setBio(profileData.bio || "");
        setVenmoHandle(profileData.venmo_handle || "");
        setAvatarPreview(getSupabaseImageUrl("avatars", profileData.pfp_path));
        setListings(
          allListings.filter((l) => l.seller_id === profileData.id)
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load profile"
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, authLoading]);

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await api.patch<StudentProfile>(
        "/students/me",
        {
          display_name: displayName,
          bio: bio || null,
          venmo_handle: venmoHandle || null,
        },
        token
      );
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    setUploadingAvatar(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/students/me/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      const newUrl = getSupabaseImageUrl("avatars", data.pfp_path);
      setAvatarPreview(newUrl);
      setProfile((prev) =>
        prev ? { ...prev, pfp_path: data.pfp_path } : prev
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Avatar upload failed"
      );
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleListingAction(
    listingId: string,
    action: "sold" | "extend" | "removed"
  ) {
    if (!token) return;
    setActionLoading(listingId);
    try {
      if (action === "extend") {
        await api.post(`/listings/${listingId}/extend`, {}, token);
      } else {
        await api.patch(`/listings/${listingId}`, { status: action }, token);
      }
      setListings((prev) =>
        prev.map((l) =>
          l.id === listingId
            ? { ...l, status: action === "extend" ? "active" : action }
            : l
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-[var(--color-destructive)]">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-base font-medium text-[var(--color-primary)]">
        Settings
      </h1>

      {error && (
        <p className="text-xs text-[var(--color-destructive)]">{error}</p>
      )}

      {/* Avatar upload */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingAvatar}
          className="relative group shrink-0"
        >
          <Avatar
            src={avatarPreview}
            alt={displayName}
            fallback={displayName.charAt(0) || "?"}
            size="lg"
            className="!h-16 !w-16 text-lg"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
            {uploadingAvatar ? (
              <Spinner
                size="sm"
                className="border-white/50 border-t-white"
              />
            ) : (
              <Camera className="w-4 h-4 text-white" />
            )}
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarUpload}
          className="hidden"
          aria-label="Upload avatar"
        />
        <div>
          <p className="text-sm text-[var(--color-primary)]">
            {displayName || "Your name"}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            Click photo to change
          </p>
        </div>
      </div>

      {/* Profile fields */}
      <div className="space-y-3">
        <Input
          label="Display Name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
        />
        <Textarea
          label="Bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell people about yourself"
          rows={3}
        />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--color-primary)]">
            Venmo
          </label>
          <div className="flex items-center border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
            <span className="pl-3 text-sm text-[var(--color-muted)] select-none">
              @
            </span>
            <input
              value={venmoHandle}
              onChange={(e) => setVenmoHandle(e.target.value)}
              placeholder="handle"
              className="h-10 flex-1 bg-transparent px-1.5 text-sm text-[var(--color-primary)] placeholder:text-[var(--color-muted)] focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saving}>
          Save Changes
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-[var(--color-success)]">
            <Check className="w-3 h-3" />
            Saved
          </span>
        )}
      </div>

      <div className="border-t border-[var(--color-border)]" />

      {/* My Listings */}
      <div>
        <h2 className="text-sm font-medium text-[var(--color-primary)] mb-3">
          My Listings
        </h2>
        {listings.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)] py-4">
            No listings yet
          </p>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {listings.map((listing) => {
              const thumb = listing.photos?.[0]?.path
                ? getSupabaseImageUrl(
                    "listing_photos",
                    listing.photos[0].path
                  )
                : null;
              const isActive = listing.status === "active";

              return (
                <div
                  key={listing.id}
                  className="flex items-center gap-3 py-3"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden bg-[var(--color-surface-sunken)]">
                    {thumb ? (
                      <Image
                        src={thumb}
                        alt={listing.title}
                        width={48}
                        height={48}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-[var(--color-muted)] text-[9px]">
                        No img
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--color-primary)] truncate">
                      {listing.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-[var(--color-secondary)]">
                        {formatPriceShort(listing.price_cents)}
                      </span>
                      <Badge
                        variant={
                          STATUS_VARIANT[listing.status] || "muted"
                        }
                      >
                        {listing.status.charAt(0).toUpperCase() +
                          listing.status.slice(1)}
                      </Badge>
                    </div>
                  </div>

                  {isActive && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actionLoading === listing.id}
                        onClick={() =>
                          handleListingAction(listing.id, "sold")
                        }
                      >
                        Sold
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actionLoading === listing.id}
                        onClick={() =>
                          handleListingAction(listing.id, "extend")
                        }
                      >
                        Extend
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actionLoading === listing.id}
                        onClick={() =>
                          handleListingAction(listing.id, "removed")
                        }
                        className="text-[var(--color-destructive)] hover:text-[var(--color-destructive)]"
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--color-border)]" />

      <Button variant="destructive" onClick={handleSignOut}>
        <LogOut className="w-4 h-4" />
        Sign Out
      </Button>
    </div>
  );
}
