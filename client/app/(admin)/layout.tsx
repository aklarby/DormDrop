"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/metrics", label: "Metrics" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, loading: authLoading } = useAuth();
  const token = session?.access_token;
  const pathname = usePathname();
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setAllowed(false);
      return;
    }
    api
      .get<{ role?: string }>("/students/me", token)
      .then((me) => {
        const role = me.role ?? "student";
        setAllowed(role === "admin" || role === "moderator");
      })
      .catch(() => setAllowed(false));
  }, [authLoading, token]);

  if (authLoading || allowed === null) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 py-24 text-center">
        <AlertTriangle className="w-5 h-5 text-[var(--color-destructive)]" />
        <p className="text-sm text-[var(--color-secondary)]">
          You need admin or moderator access to view this page.
        </p>
        <button
          type="button"
          onClick={() => router.push("/browse")}
          className="mt-2 text-xs text-[var(--color-brand)] hover:underline"
        >
          Back to browse
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Admin
        </h1>
        <nav className="mt-2 flex gap-2 border-b border-[var(--color-border)]">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "border-b-2 px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-[var(--color-brand)] text-[var(--color-primary)]"
                    : "border-transparent text-[var(--color-secondary)] hover:text-[var(--color-primary)]"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}
