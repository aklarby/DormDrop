"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";

export default function ForgotPasswordPage() {
  const { resetPasswordForEmail } = useAuth();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await resetPasswordForEmail(email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-[360px]">
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--color-primary)]">
          DormDrop
        </h1>
        <p className="mt-1 text-sm text-[var(--color-secondary)]">
          {submitted ? "Check your email" : "Reset your password"}
        </p>
      </div>

      {submitted ? (
        <div className="space-y-4">
          <div className="border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
            <p className="text-sm text-[var(--color-primary)]">
              If an account exists for{" "}
              <span className="font-medium">{email}</span>, you&rsquo;ll
              receive a password reset link shortly.
            </p>
            <p className="mt-2 text-xs text-[var(--color-secondary)]">
              Check your inbox and spam folder.
            </p>
          </div>

          <Link
            href="/login"
            className="flex items-center justify-center h-10 w-full bg-[var(--color-primary)] text-white text-sm font-normal transition-colors duration-200 hover:bg-[var(--color-primary-hover)]"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-[var(--color-secondary)] mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              className="h-10 w-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 text-sm text-[var(--color-primary)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
            />
          </div>

          {error && (
            <p className="text-xs text-[var(--color-destructive)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="h-10 w-full bg-[var(--color-primary)] text-white text-sm font-normal transition-colors duration-200 hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? "Sending\u2026" : "Send reset link"}
          </button>

          <Link
            href="/login"
            className="flex items-center justify-center h-10 w-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-sm text-[var(--color-secondary)] transition-colors duration-200 hover:bg-[var(--color-surface)]"
          >
            Back to sign in
          </Link>
        </form>
      )}
    </div>
  );
}
