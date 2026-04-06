"use client";

import { cn } from "@/lib/utils";

interface SpinnerProps {
  size?: "sm" | "md";
  className?: string;
}

const sizeStyles = {
  sm: "h-3.5 w-3.5 border",
  md: "h-5 w-5 border-2",
};

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "rounded-full border-[var(--color-faint)] border-t-[var(--color-brand)] animate-spin",
        sizeStyles[size],
        className
      )}
    />
  );
}
