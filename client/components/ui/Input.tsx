"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-[var(--color-primary)]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "h-10 w-full border bg-[var(--color-surface-raised)] px-3 text-sm text-[var(--color-primary)]",
            "placeholder:text-[var(--color-muted)]",
            "focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error
              ? "border-[var(--color-destructive)]"
              : "border-[var(--color-border)]",
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-[var(--color-destructive)]">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
