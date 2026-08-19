/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  // Turbopack's persistent disk cache (on by default) keeps growing across restarts and has
  // repeatedly filled this environment's small disk, corrupting itself and crashing dev. The
  // in-memory cache Turbopack falls back to is slightly slower on cold start but never persists.
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
