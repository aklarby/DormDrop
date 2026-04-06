"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

interface ToastEntry {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const variantAccent: Record<ToastVariant, string> = {
  success: "border-l-[var(--color-success)]",
  error: "border-l-[var(--color-destructive)]",
  info: "border-l-[var(--color-brand)]",
};

const variantIcon: Record<ToastVariant, React.ReactNode> = {
  success: (
    <CheckCircle
      size={16}
      className="shrink-0 text-[var(--color-success)]"
    />
  ),
  error: (
    <AlertCircle
      size={16}
      className="shrink-0 text-[var(--color-destructive)]"
    />
  ),
  info: (
    <Info size={16} className="shrink-0 text-[var(--color-brand)]" />
  ),
};

function ToastItem({
  entry,
  onDismiss,
}: {
  entry: ToastEntry;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(entry.id), 4000);
    return () => clearTimeout(timer);
  }, [entry.id, onDismiss]);

  return (
    <div
      role="alert"
      className={cn(
        "animate-fade-in flex items-start gap-2.5",
        "border border-[var(--color-border)] border-l-[3px] bg-[var(--color-surface-raised)] px-4 py-3 shadow-lg",
        variantAccent[entry.variant]
      )}
    >
      {variantIcon[entry.variant]}
      <p className="flex-1 text-sm text-[var(--color-primary)]">
        {entry.message}
      </p>
      <button
        onClick={() => onDismiss(entry.id)}
        className="shrink-0 text-[var(--color-muted)] transition-colors duration-200 hover:text-[var(--color-primary)]"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = String(++counter);
      setToasts((prev) => [...prev, { id, message, variant }]);
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {mounted &&
        createPortal(
          <div
            aria-live="polite"
            className="fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2"
          >
            {toasts.map((t) => (
              <ToastItem key={t.id} entry={t} onDismiss={dismiss} />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}
