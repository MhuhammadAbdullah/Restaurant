import type { MetadataRoute } from "next";
import { getBranding, squareIcon } from "../lib/branding";

export const revalidate = 3600;

/** Web app manifest: lets staff install the admin panel on a computer or phone like an app. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const b = await getBranding();
  const logo = b.logoUrl;
  return {
    name: `${b.name} Admin`,
    short_name: "Admin",
    description: `Staff and admin panel for ${b.name}.`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ED2320",
    icons: logo
      ? [
          { src: squareIcon(logo, 192), sizes: "192x192", type: "image/png", purpose: "any" },
          { src: squareIcon(logo, 512), sizes: "512x512", type: "image/png", purpose: "any" },
          { src: squareIcon(logo, 512, 0.6), sizes: "512x512", type: "image/png", purpose: "maskable" },
        ]
      : [],
  };
}
