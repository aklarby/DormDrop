"use client";

import { useState, useRef, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";

const OTP_LENGTH = 6;

export default function LoginPage() {
  const router = useRouter();
  const { signInWithOtp, verifyOtp } = useAuth();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [step, setStep] = useState<"email" | "otp">("email");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signInWithOtp(email);
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;

    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);

    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    if (!pasted) return;

    const next = [...otp];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setOtp(next);

    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIndex]?.focus();
  }

  async function handleOtpSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const token = otp.join("");
    if (token.length !== OTP_LENGTH) {
      setError("Please enter the full 6-digit code.");
      return;
    }

    setSubmitting(true);

    try {
      const { session } = await verifyOtp(email, token);
      const accessToken = session?.access_token;

      if (accessToken) {
        try {
          await api.get("/students/me", accessToken);
        } catch {
          const pendingName = localStorage.getItem(
            "dormdrop_pending_display_name"
          );
          const displayName = pendingName || email.split("@")[0];
          await api.post(
            "/auth/complete-signup",
            { display_name: displayName },
            accessToken
          );
          localStorage.removeItem("dormdrop_pending_display_name");
        }
      }

      router.push("/browse");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired code");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithOtp(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "otp") {
    return (
      <div className="w-full max-w-[360px]">
        <div className="mb-8">
          <h1 className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--color-primary)]">
            DormDrop
          </h1>
          <p className="mt-1 text-sm text-[var(--color-secondary)]">
            Enter your code
          </p>
        </div>

        <div className="border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 mb-4">
          <p className="text-sm text-[var(--color-primary)]">
            We sent a 6-digit code to{" "}
            <span className="font-medium">{email}</span>.
          </p>
          <p className="mt-2 text-xs text-[var(--color-secondary)]">
            Check your inbox and spam folder.
          </p>
        </div>

        <form onSubmit={handleOtpSubmit} className="space-y-4">
          <div
            className="flex items-center justify-between gap-2"
            onPaste={handleOtpPaste}
          >
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                autoFocus={i === 0}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className="h-12 w-12 border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-center text-lg font-medium text-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
              />
            ))}
          </div>

          {error && (
            <p className="text-xs text-[var(--color-destructive)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="h-10 w-full bg-[var(--color-primary)] text-white text-sm font-normal transition-colors duration-200 hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? "Verifying\u2026" : "Continue"}
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={submitting}
            className="flex items-center justify-center h-10 w-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-sm text-[var(--color-secondary)] transition-colors duration-200 hover:bg-[var(--color-surface)] disabled:opacity-50 disabled:pointer-events-none"
          >
            Resend code
          </button>

          <button
            type="button"
            onClick={() => {
              setStep("email");
              setOtp(Array(OTP_LENGTH).fill(""));
              setError(null);
            }}
            className="flex items-center justify-center h-10 w-full text-sm text-[var(--color-secondary)] transition-colors duration-200 hover:text-[var(--color-primary)]"
          >
            Use a different email
          </button>
        </form>
      </div>
    );
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

      <form onSubmit={handleEmailSubmit} className="space-y-3">
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
          {submitting ? "Sending code\u2026" : "Continue with email"}
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
