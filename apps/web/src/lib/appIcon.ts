/**
 * Square PNG of a Cloudinary picture at the given size. The picture is first fitted into `fill` of the square (80% by default,
 * about 60% for the "maskable" icon, which phones crop to a circle or rounded square) and then padded onto white, so a wide
 * logo is never cut at the edges. Other addresses are used as they are.
 */
export function appIcon(url: string, size: number, fill = 0.8): string {
  if (!url.includes("res.cloudinary.com") || !url.includes("/image/upload/")) return url;
  const inner = Math.round(size * fill);
  return url.replace("/image/upload/", `/image/upload/c_fit,w_${inner},h_${inner}/c_pad,b_white,w_${size},h_${size},f_png/`);
}
