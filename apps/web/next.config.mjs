/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Serve WebP (and AVIF where supported) instead of the original JPEG/PNG for every optimised image.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  // The page used to live at /locations; keep old links and Google results working.
  async redirects() {
    return [{ source: "/locations", destination: "/our-locations", permanent: true }];
  },
  // Private pages carry an X-Robots-Tag so they stay out of search even if linked from elsewhere.
  async headers() {
    return ["/checkout", "/account/:path*", "/order-confirmation/:path*"].map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }));
  },
  // Turbopack's persistent disk cache (on by default) keeps growing across restarts and has
  // repeatedly filled this environment's small disk, corrupting itself and crashing dev. The
  // in-memory cache Turbopack falls back to is slightly slower on cold start but never persists.
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
