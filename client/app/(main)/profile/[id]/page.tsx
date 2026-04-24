"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Calendar, Ban, Flag } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { getSupabaseImageUrl } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { ListingGrid } from "@/components/listings/ListingGrid";
import { useToast } from "@/components/ui/Toast";

interface Student {
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
  students?: { display_name: string; pfp_path: string | null };
}

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user, session, loading: authLoading } = useAuth();
  const token = session?.access_token;
  const { toast } = useToast();

  const [student, setStudent] = useState<Student | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);

  const isSelf = user?.id === id;

  const blockUser = async () => {
    if (!token || !student || isSelf) return;
    if (!window.confirm(`Block ${student.display_name}? You won't see their listings or messages anymore.`)) return;
    setBlocking(true);
    try {
      await api.post("/blocks", { blocked_id: student.id }, token);
      toast("User blocked", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to block user", "error");
    } finally {
      setBlocking(false);
    }
  };

  const reportUser = async () => {
    if (!token || !student || isSelf) return;
    const reason = window.prompt("Why are you reporting this user?");
    if (!reason?.trim()) return;
    try {
      await api.post(
        "/reports",
        { target_type: "student", target_id: student.id, reason: reason.trim() },
        token
      );
      toast("Report submitted", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to submit report", "error");
    }
  };

  useEffect(() => {
    if (authLoading || !token) return;

    async function load() {
      setLoading(true);
      try {
        const [studentData, listingsRes] = await Promise.all([
          api.get<Student>(`/students/${id}`, token),
          api.get<{ data: Listing[]; count: number }>("/listings", token),
        ]);
        setStudent(studentData);
        const allListings = listingsRes.data ?? [];
        setListings(
          allListings.filter((l) => l.seller_id === id && l.status === "active")
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
  }, [id, token, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-sm text-[var(--color-destructive)]">
          {error || "Student not found"}
        </p>
      </div>
    );
  }

  const avatarUrl = getSupabaseImageUrl("profile_pictures", student.pfp_path);
  const memberSince = new Date(student.created_at).toLocaleDateString(
    "en-US",
    { month: "short", year: "numeric" }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 border-b border-[var(--color-border)] pb-5">
        <Avatar
          src={avatarUrl}
          alt={student.display_name}
          fallback={student.display_name.charAt(0)}
          size="lg"
          className="!h-16 !w-16 text-lg"
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-medium text-[var(--color-primary)]">
            {student.display_name}
          </h1>
          {student.bio && (
            <p className="mt-1 text-sm text-[var(--color-secondary)] line-clamp-3">
              {student.bio}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {student.venmo_handle && (
              <a
                href={`https://venmo.com/u/${student.venmo_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:underline"
              >
                <Image src="/Venmo_logo.png" alt="Venmo" width={12} height={12} className="rounded-sm" />
                @{student.venmo_handle}
              </a>
            )}
            <span className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
              <Calendar className="w-3 h-3" />
              Member since {memberSince}
            </span>
          </div>
          {!isSelf && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={reportUser}
                className="inline-flex items-center gap-1 border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-secondary)] hover:text-[var(--color-primary)]"
              >
                <Flag className="w-3 h-3" />
                Report
              </button>
              <button
                type="button"
                disabled={blocking}
                onClick={blockUser}
                className="inline-flex items-center gap-1 border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
              >
                <Ban className="w-3 h-3" />
                {blocking ? "Blocking…" : "Block"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-[var(--color-primary)] mb-3">
          Listings
        </h2>
        <ListingGrid listings={listings} emptyMessage="No active listings" />
      </div>
    </div>
  );
}
