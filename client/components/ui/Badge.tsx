"use client";

import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "muted";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-[var(--color-brand-subtle)] text-[var(--color-brand)]",
  success: "bg-[#EBF5EC] text-[var(--color-success)]",
  warning: "bg-[#FEF3E2] text-[#92600A]",
  destructive: "bg-[#FDECEC] text-[var(--color-destructive)]",
  muted: "bg-[var(--color-surface-sunken)] text-[var(--color-secondary)]",
};

export function Badge({
  variant = "default",
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
