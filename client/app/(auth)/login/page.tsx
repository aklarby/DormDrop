"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signIn(email, password);
      router.push("/browse");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
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
          Sign in to your account
        </p>
      </div>

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

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-medium text-[var(--color-secondary)] mb-1.5"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {submitting ? "Signing in\u2026" : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-[var(--color-secondary)]">
        No account?{" "}
        <Link
          href="/signup"
          className="text-[var(--color-brand)] hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
