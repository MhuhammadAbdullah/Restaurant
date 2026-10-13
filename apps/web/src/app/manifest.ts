import type { MetadataRoute } from "next";
import { getSite } from "../lib/seo";

export const revalidate = 3600;

/** Square PNG of the logo at the given size (Cloudinary pads it onto white); other addresses are used as they are. */
function icon(url: string | null, size: number): string {
  if (!url) return "/logo-fallback.png";
  if (!url.includes("res.cloudinary.com") || !url.includes("/image/upload/")) return url;
  return url.replace("/image/upload/", `/image/upload/c_pad,b_white,w_${size},h_${size},f_png/`);
}

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
      { src: icon(site.logoUrl, 192), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon(site.logoUrl, 512), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icon(site.logoUrl, 512), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
