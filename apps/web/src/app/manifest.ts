import type { MetadataRoute } from "next";
import { getSite } from "../lib/seo";
import { appIcon } from "../lib/appIcon";

export const revalidate = 3600;

/** Web app manifest: lets customers install the site on their phone's home screen like an app. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const site = await getSite();
  return {
    name: site.name,
    short_name: site.name.length > 14 ? site.name.split(" ")[0]! : site.name,
    description: site.seo.defaultDescription || `Order online from ${site.name}.`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ED2320",
    icons: [
      { src: site.logoUrl ? appIcon(site.logoUrl, 192) : "/logo-fallback.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: site.logoUrl ? appIcon(site.logoUrl, 512) : "/logo-fallback.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: site.logoUrl ? appIcon(site.logoUrl, 512, 0.6) : "/logo-fallback.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
