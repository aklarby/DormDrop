import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseHostname = supabaseUrl
  ? new URL(supabaseUrl).hostname
  : "*.supabase.co";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.0.0.54"],
  images: {
    // Public bucket reads (college assets today, public thumbs later) AND
    // signed URLs from private buckets (listing_photos, profile_pictures,
    // message_photos). Signed paths end up under /storage/v1/object/sign/.
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHostname,
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: supabaseHostname,
        pathname: "/storage/v1/object/sign/**",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

// Bundle analyzer is opt-in via `ANALYZE=true npm run build`. We avoid a
// static import so the package doesn't need to be installed for a normal
// build.
let wrapped: NextConfig | ReturnType<typeof Object> = nextConfig;
if (process.env.ANALYZE === "true") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const withBundleAnalyzer = require("@next/bundle-analyzer")({
      enabled: true,
    });
    wrapped = withBundleAnalyzer(nextConfig);
  } catch {
    console.warn(
      "ANALYZE=true set but @next/bundle-analyzer isn't installed — ignoring."
    );
  }
}

export default wrapped;
