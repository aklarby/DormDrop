import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://dormdrop.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/browse", "/browse/*", "/free", "/terms", "/privacy", "/community-guidelines"],
        disallow: [
          "/messages",
          "/messages/*",
          "/settings",
          "/settings/*",
          "/profile/*",
          "/listing/*",
          "/admin",
          "/admin/*",
          "/auth/*",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
