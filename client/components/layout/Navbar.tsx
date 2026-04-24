"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, Plus, MessageSquare, Heart, User, LogOut, Menu, X, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUnreadCount } from "@/hooks/use-unread-count";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

const RECENT_STORAGE_KEY = "dormdrop:recent-searches";
const RECENT_LIMIT = 6;

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string").slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeRecent(next: string[]) {
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next.slice(0, RECENT_LIMIT)));
  } catch {
    /* quota exceeded or storage unavailable — ignore */
  }
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const unread = useUnreadCount();
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  useEffect(() => {
    if (!searchFocused) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setSearchFocused(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchFocused]);

  const pushRecent = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const next = [trimmed, ...recent.filter((r) => r.toLowerCase() !== trimmed.toLowerCase())];
    writeRecent(next);
    setRecent(next.slice(0, RECENT_LIMIT));
  };

  const runSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    pushRecent(trimmed);
    setSearchQuery("");
    setSearchFocused(false);
    router.push(`/browse?search=${encodeURIComponent(trimmed)}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(searchQuery);
  };

  const navLinks = [
    { href: "/browse", label: "Browse", icon: Search },
    { href: "/sell", label: "Sell", icon: Plus },
    { href: "/messages", label: "Messages", icon: MessageSquare },
    { href: "/saved", label: "Saved", icon: Heart },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[var(--color-surface-raised)] border-b border-[var(--color-border)]">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
        <Link
          href="/browse"
          className="font-[family-name:var(--font-display)] text-base font-semibold text-[var(--color-primary)] shrink-0"
        >
          DormDrop
        </Link>

        <form onSubmit={handleSearch} className="hidden sm:flex flex-1 max-w-md mx-4">
          <div ref={searchRef} className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              placeholder="Search listings..."
              className="w-full h-9 pl-9 pr-3 text-sm bg-[var(--color-surface)] border border-[var(--color-border-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)] transition-colors"
            />
            {searchFocused && recent.length > 0 && searchQuery === "" && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-lg animate-scale-in">
                <p className="px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
                  Recent
                </p>
                <ul className="pb-1">
                  {recent.map((query) => (
                    <li key={query}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          runSearch(query);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-primary)] hover:bg-[var(--color-surface-sunken)]"
                      >
                        <Clock className="h-3 w-3 text-[var(--color-muted)]" />
                        <span className="truncate">{query}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </form>

        <nav className="hidden md:flex items-center gap-1 ml-auto">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = pathname.startsWith(link.href);
            const showBadge = link.href === "/messages" && unread > 0;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors duration-200",
                  active
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-secondary)] hover:text-[var(--color-primary)]"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{link.label}</span>
                {showBadge && (
                  <span
                    aria-label={`${unread} unread messages`}
                    className="ml-1 flex h-4 min-w-4 items-center justify-center bg-[var(--color-brand)] px-1 text-[10px] font-semibold leading-none text-white"
                  >
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-2 ml-2">
          <Link href="/settings" className="flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--color-secondary)] hover:text-[var(--color-primary)] transition-colors duration-200">
            <Avatar size="sm" fallback={user?.email?.charAt(0) || "U"} />
          </Link>
          <button
            onClick={() => signOut()}
            className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors duration-200"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden ml-auto p-2 text-[var(--color-secondary)]"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] animate-fade-in">
          <form onSubmit={handleSearch} className="px-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search listings..."
                className="w-full h-10 pl-9 pr-3 text-sm bg-[var(--color-surface)] border border-[var(--color-border-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
              />
            </div>
          </form>
          <div className="px-2 py-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = pathname.startsWith(link.href);
              const showBadge = link.href === "/messages" && unread > 0;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-200",
                    active
                      ? "text-[var(--color-primary)] bg-[var(--color-surface)]"
                      : "text-[var(--color-secondary)] hover:text-[var(--color-primary)]"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                  {showBadge && (
                    <span
                      aria-label={`${unread} unread messages`}
                      className="ml-auto flex h-4 min-w-4 items-center justify-center bg-[var(--color-brand)] px-1 text-[10px] font-semibold leading-none text-white"
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
              );
            })}
            <Link
              href="/settings"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--color-secondary)] hover:text-[var(--color-primary)] transition-colors duration-200"
            >
              <User className="w-4 h-4" />
              <span>Profile</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
