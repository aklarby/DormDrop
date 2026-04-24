import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CATEGORIES, CATEGORY_LABELS } from "@/types/constants";

interface Props {
  params: Promise<{ category: string }>;
}

function isKnownCategory(value: string): value is (typeof CATEGORIES)[number] {
  return (CATEGORIES as readonly string[]).includes(value);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  if (!isKnownCategory(category)) return { title: "DormDrop" };
  const label = CATEGORY_LABELS[category] ?? category;
  return {
    title: `${label} on DormDrop`,
    description: `Browse ${label.toLowerCase()} listings from students at your school on DormDrop.`,
    alternates: { canonical: `/browse/${category}` },
  };
}

export default async function CategoryLandingPage({ params }: Props) {
  const { category } = await params;
  if (!isKnownCategory(category)) notFound();
  // Landing page mirrors the main browse page with a prefilter. Browse is
  // client-rendered and reads the filter from the query string.
  redirect(`/browse?category=${encodeURIComponent(category)}`);
}
