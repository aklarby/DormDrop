import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | DormDrop",
  description: "How DormDrop collects and uses student data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <article className="prose mx-auto max-w-2xl space-y-4 px-4 py-10 text-sm leading-relaxed">
      <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold">
        Privacy Policy
      </h1>
      <p className="text-xs text-[var(--color-muted)]">Last updated 2026-04-24</p>

      <h2 className="mt-6 font-medium text-[var(--color-primary)]">
        What we collect
      </h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Your school email (for verification only) and display name.</li>
        <li>Listings you post and messages you send.</li>
        <li>Product analytics: page views, feature usage, and crash events — aggregated and anonymized.</li>
        <li>Photos you upload go to private Supabase storage buckets. We don&apos;t scrape EXIF.</li>
      </ul>

      <h2 className="mt-6 font-medium text-[var(--color-primary)]">
        How we use it
      </h2>
      <p>
        To operate the marketplace — ranking search, preventing abuse, and
        powering messaging. We run text and image moderation via OpenAI on
        your listings and messages to enforce Community Guidelines.
      </p>

      <h2 className="mt-6 font-medium text-[var(--color-primary)]">
        What we don&apos;t do
      </h2>
      <p>
        We don&apos;t sell your data. We don&apos;t target advertising. We don&apos;t share
        personally identifying data with your school.
      </p>

      <h2 className="mt-6 font-medium text-[var(--color-primary)]">Your rights</h2>
      <p>
        You can export all of your data from the Settings page
        (<code>POST /students/me/export</code>) and delete your account
        (<code>DELETE /students/me</code>) at any time.
      </p>

      <h2 className="mt-6 font-medium text-[var(--color-primary)]">Contact</h2>
      <p>Questions? Email privacy@dormdrop.app.</p>
    </article>
  );
}
