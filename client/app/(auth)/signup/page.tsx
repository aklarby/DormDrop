"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";

type Step = "email" | "details" | "verify";

export default function SignupPage() {
  const { signUp } = useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validatingEmail, setValidatingEmail] = useState(false);

  async function validateDomain() {
    if (!email) return;
    setError(null);
    setValidatingEmail(true);

    try {
      await api.post("/auth/validate-domain", { email });
      setStep("details");
    } catch {
      setError("Your school is not supported yet.");
    } finally {
      setValidatingEmail(false);
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    await validateDomain();
  }

  async function handleDetailsSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await signUp(email, password);
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
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
          {step === "verify"
            ? "Almost there"
            : "Create your account"}
        </p>
      </div>

      {step === "email" && (
        <form onSubmit={handleEmailSubmit} className="space-y-3">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-[var(--color-secondary)] mb-1.5"
            >
              School email
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              onBlur={() => {
                if (email) validateDomain();
              }}
              placeholder="you@university.edu"
              className="h-10 w-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 text-sm text-[var(--color-primary)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
            />
          </div>

          {error && (
            <p className="text-xs text-[var(--color-destructive)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={validatingEmail || !email}
            className="h-10 w-full bg-[var(--color-primary)] text-white text-sm font-normal transition-colors duration-200 hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:pointer-events-none"
          >
            {validatingEmail ? "Checking\u2026" : "Continue"}
          </button>
        </form>
      )}

      {step === "details" && (
        <form onSubmit={handleDetailsSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--color-secondary)] mb-1.5">
              Email
            </label>
            <div className="h-10 flex items-center px-3 border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-secondary)]">
              {email}
            </div>
          </div>

          <div>
            <label
              htmlFor="displayName"
              className="block text-xs font-medium text-[var(--color-secondary)] mb-1.5"
            >
              Display name
            </label>
            <input
              id="displayName"
              type="text"
              required
              autoFocus
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How others will see you"
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="h-10 w-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 text-sm text-[var(--color-primary)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-xs font-medium text-[var(--color-secondary)] mb-1.5"
            >
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            {submitting ? "Creating account\u2026" : "Create account"}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep("email");
              setError(null);
            }}
            className="h-10 w-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-sm text-[var(--color-secondary)] transition-colors duration-200 hover:bg-[var(--color-surface)]"
          >
            Back
          </button>
        </form>
      )}

      {step === "verify" && (
        <div className="space-y-4">
          <div className="border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
            <p className="text-sm text-[var(--color-primary)]">
              Check your email for a verification link.
            </p>
            <p className="mt-2 text-xs text-[var(--color-secondary)]">
              We sent a confirmation to{" "}
              <span className="text-[var(--color-primary)]">{email}</span>.
              Click the link to activate your account, then sign in.
            </p>
          </div>

          <Link
            href="/login"
            className="flex items-center justify-center h-10 w-full bg-[var(--color-primary)] text-white text-sm font-normal transition-colors duration-200 hover:bg-[var(--color-primary-hover)]"
          >
            Go to sign in
          </Link>
        </div>
      )}

      {step !== "verify" && (
        <p className="mt-5 text-center text-xs text-[var(--color-secondary)]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-[var(--color-brand)] hover:underline"
          >
            Sign in
          </Link>
        </p>
      )}
    </div>
  );
}
