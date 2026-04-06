"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface AvatarProps {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeStyles = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
};

export function Avatar({
  src,
  alt,
  fallback,
  size = "md",
  className,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showFallback = !src || imgError;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full",
        "flex items-center justify-center bg-[var(--color-surface-sunken)]",
        sizeStyles[size],
        className
      )}
    >
      {showFallback ? (
        <span className="select-none font-medium uppercase text-[var(--color-secondary)]">
          {fallback || "?"}
        </span>
      ) : (
        <img
          src={src}
          alt={alt || ""}
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}
