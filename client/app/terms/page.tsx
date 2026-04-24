import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | DormDrop",
  description: "The rules for using DormDrop, a student-to-student marketplace.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <article className="prose mx-auto max-w-2xl space-y-4 px-4 py-10 text-sm leading-relaxed">
      <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold">
        Terms of Service
      </h1>
      <p className="text-xs text-[var(--color-muted)]">Last updated 2026-04-24</p>

      <h2 className="mt-6 font-medium text-[var(--color-primary)]">Who we are</h2>
      <p>
        DormDrop connects verified college students at participating schools for
        peer-to-peer resale. Accounts require a school email ending in a
        supported domain.
      </p>

      <h2 className="mt-6 font-medium text-[var(--color-primary)]">Accounts</h2>
      <p>
        You are responsible for the activity on your account. Accounts may be
        deactivated for violating these terms, Community Guidelines, or
        applicable law.
      </p>

      <h2 className="mt-6 font-medium text-[var(--color-primary)]">
        Buying and selling
      </h2>
      <p>
        DormDrop is not a party to any transaction. Payments happen off-platform
        (typically via Venmo). You agree to meet in a public place on campus
        and to verify items before paying. We do not offer buyer or seller
        protection.
      </p>

      <h2 className="mt-6 font-medium text-[var(--color-primary)]">Prohibited items</h2>
      <p>
        Weapons, alcohol, tobacco, vapes, drugs, prescription medications,
        counterfeit goods, live animals, and anything else prohibited by your
        school or local law. See the{" "}
        <a href="/community-guidelines" className="underline">
          Community Guidelines
        </a>{" "}
        for the full list.
      </p>

      <h2 className="mt-6 font-medium text-[var(--color-primary)]">Changes</h2>
      <p>
        We may update these terms. Material changes will be announced via
        email or a notice on the app.
      </p>
    </article>
  );
}
