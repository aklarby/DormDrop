"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  destructive?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  destructive,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !destructive) onClose();
    },
    [onClose, destructive]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, handleEsc]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-[var(--color-surface-overlay)]"
        onClick={destructive ? undefined : onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "animate-scale-in relative z-10 flex w-full max-w-lg flex-col",
          "max-h-[90vh] bg-[var(--color-surface-raised)] shadow-xl"
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3.5">
          <h2 className="text-sm font-medium text-[var(--color-primary)]">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-muted)] transition-colors duration-200 hover:text-[var(--color-primary)]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-[var(--color-primary)]">
          {children}
        </div>

        {footer && (
          <div className="border-t border-[var(--color-border)] px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
