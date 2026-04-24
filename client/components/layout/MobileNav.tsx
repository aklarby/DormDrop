"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Plus, MessageSquare, Heart, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadCount } from "@/hooks/use-unread-count";

const tabs = [
  { href: "/browse", label: "Browse", icon: Search },
  { href: "/saved", label: "Saved", icon: Heart },
  { href: "/sell", label: "Sell", icon: Plus },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/settings", label: "Profile", icon: User },
];

export function MobileNav() {
  const pathname = usePathname();
  const unread = useUnreadCount();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-surface-raised)] border-t border-[var(--color-border)]">
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = pathname.startsWith(tab.href);
          const showBadge = tab.href === "/messages" && unread > 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] text-xs transition-colors duration-200",
                active
                  ? "text-[var(--color-brand)]"
                  : "text-[var(--color-muted)]"
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{tab.label}</span>
              {showBadge && (
                <span
                  aria-label={`${unread} unread messages`}
                  className="absolute top-1 right-1/4 flex h-4 min-w-4 items-center justify-center bg-[var(--color-brand)] px-1 text-[10px] font-semibold leading-none text-white"
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
