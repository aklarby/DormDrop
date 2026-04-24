"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const TOUR_KEY = "dormdrop:tour-seen";

const STEPS = [
  {
    title: "Browse and search",
    body: "Every listing on DormDrop is from a student at your school. Typos are OK — search is fuzzy.",
  },
  {
    title: "Sell in under a minute",
    body: "Tap Sell, drop up to 8 photos, and let AI suggest a title, category, and price.",
  },
  {
    title: "Message and meet",
    body: "Chat with buyers, make offers, and meet somewhere public on campus. Pay through Venmo.",
  },
];

export function FirstLoginTour() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (loading || !user) return;
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(TOUR_KEY);
    if (!seen) {
      setOpen(true);
    }
  }, [loading, user]);

  if (!open) return null;

  const current = STEPS[step];

  const close = () => {
    window.localStorage.setItem(TOUR_KEY, "1");
    setOpen(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
            {step + 1} / {STEPS.length}
          </p>
          <button
            type="button"
            aria-label="Skip tour"
            onClick={close}
            className="text-[var(--color-muted)] hover:text-[var(--color-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <h2 className="font-[family-name:var(--font-display)] text-base font-semibold text-[var(--color-primary)]">
          {current.title}
        </h2>
        <p className="mt-2 text-sm text-[var(--color-secondary)]">{current.body}</p>

        <div className="mt-5 flex items-center justify-end gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-secondary)] hover:text-[var(--color-primary)]"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="bg-[var(--color-primary)] px-3 py-1.5 text-xs text-white hover:bg-[var(--color-primary-hover)]"
          >
            {step === STEPS.length - 1 ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
