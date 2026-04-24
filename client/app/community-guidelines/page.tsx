import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Community Guidelines | DormDrop",
  description: "How to post, message, and meet safely on DormDrop.",
  alternates: { canonical: "/community-guidelines" },
};

export default function CommunityGuidelinesPage() {
  return (
    <article className="prose mx-auto max-w-2xl space-y-4 px-4 py-10 text-sm leading-relaxed">
      <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold">
        Community Guidelines
      </h1>

      <p>
        DormDrop is a marketplace for students. Keep it chill, honest, and
        campus-only.
      </p>

      <h2 className="mt-6 font-medium text-[var(--color-primary)]">Be honest</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Use your own photos. No stock images.</li>
        <li>Describe condition accurately. Mention flaws.</li>
        <li>Don&apos;t post the same item twice.</li>
      </ul>

      <h2 className="mt-6 font-medium text-[var(--color-primary)]">Prohibited</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Weapons (including knives, pepper spray), alcohol, tobacco, vapes, drugs, prescription meds.</li>
        <li>Counterfeit goods, hacked accounts, or digital codes you don&apos;t own.</li>
        <li>Live animals, fireworks, lab equipment, hazardous chemicals.</li>
        <li>Services: rides, essay writing, homework help — this is a goods marketplace.</li>
        <li>Anything your school&apos;s code of conduct prohibits.</li>
      </ul>

      <h2 className="mt-6 font-medium text-[var(--color-primary)]">Meet safely</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Meet in a public, well-lit campus location.</li>
        <li>Inspect items before paying.</li>
        <li>Never share financial logins or your student ID.</li>
      </ul>

      <h2 className="mt-6 font-medium text-[var(--color-primary)]">Moderation</h2>
      <p>
        We automatically scan text and image uploads. You can report any
        listing, user, or message from the three-dot menu. Repeat
        offenders are banned.
      </p>
    </article>
  );
}
