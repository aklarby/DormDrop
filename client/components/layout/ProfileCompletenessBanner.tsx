"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";

interface Me {
  pfp_path: string | null;
  bio: string | null;
  venmo_handle: string | null;
}

const DISMISS_KEY = "dormdrop:profile-banner-dismissed";

export function ProfileCompletenessBanner() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [missing, setMissing] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!token) return;
    api
      .get<Me>("/students/me", token)
      .then((me) => {
        const fields: string[] = [];
        if (!me.pfp_path) fields.push("photo");
        if (!me.bio) fields.push("bio");
        if (!me.venmo_handle) fields.push("Venmo");
        setMissing(fields);
      })
      .catch(() => {});
  }, [token]);

  if (dismissed || missing.length === 0) return null;

  return (
    <div className="flex items-center gap-3 border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-xs">
      <p className="flex-1 text-[var(--color-secondary)]">
        Finish your profile — buyers trust completed profiles more. Still missing:{" "}
        <span className="text-[var(--color-primary)]">{missing.join(", ")}</span>.
      </p>
      <Link
        href="/settings"
        className="whitespace-nowrap border border-[var(--color-border)] px-2 py-1 text-[var(--color-primary)] hover:bg-[var(--color-surface-sunken)]"
      >
        Complete profile
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          window.localStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
        className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
