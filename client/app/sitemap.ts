import type { MetadataRoute } from "next";
import { CATEGORIES } from "@/types/constants";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://dormdrop.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/browse`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/free`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/community-guidelines`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = CATEGORIES.map((cat) => ({
    url: `${BASE}/browse/${cat}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.5,
  }));

  return [...staticRoutes, ...categoryRoutes];
}
