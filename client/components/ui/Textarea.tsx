"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-xs font-medium text-[var(--color-primary)]"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            "min-h-[80px] w-full border bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-primary)]",
            "placeholder:text-[var(--color-muted)] resize-y",
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

Textarea.displayName = "Textarea";
