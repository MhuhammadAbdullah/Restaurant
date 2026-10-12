import { api } from "./api";

export type MediaAsset = {
  id: string;
  url: string;
  publicId: string;
  filename: string;
  altText?: string | null;
  folder: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  format: string | null;
  createdAt: string;
};

export type MediaPage = { items: MediaAsset[]; nextCursor: string | null; total: number };

type UploadSignature = { timestamp: number; signature: string; apiKey: string; cloudName: string; folder: string; allowedFormats: string };

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/** Smaller copy of a Cloudinary image for grids, so the library stays fast with many pictures. */
export function thumb(url: string, size = 300): string {
  return url.includes("/upload/") ? url.replace("/upload/", `/upload/c_limit,w_${size},h_${size},q_auto,f_auto/`) : url;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Uploads one image straight to Cloudinary (the file never passes through our server) and records it in the media
 * library, so it can be picked again from anywhere.
 */
export async function uploadToLibrary(file: File, folder = "restaurant"): Promise<MediaAsset> {
  if (!ACCEPTED.includes(file.type)) throw new Error(`${file.name}: only JPG, PNG or WebP images are allowed`);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name}: the image is larger than 10 MB`);

  const sig = await api.get<UploadSignature>(`/media/cloudinary-signature?folder=${encodeURIComponent(folder)}`);
  const body = new FormData();
  body.append("file", file);
  body.append("api_key", sig.apiKey);
  body.append("timestamp", String(sig.timestamp));
  body.append("signature", sig.signature);
  body.append("folder", sig.folder);
  body.append("allowed_formats", sig.allowedFormats);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: "POST", body });
  const json = (await res.json()) as {
    secure_url?: string;
    public_id?: string;
    original_filename?: string;
    width?: number;
    height?: number;
    bytes?: number;
    format?: string;
    error?: { message?: string };
  };
  if (!res.ok || !json.secure_url || !json.public_id) throw new Error(json.error?.message ?? `${file.name}: upload failed`);

  return api.post<MediaAsset>("/media/assets", {
    url: json.secure_url,
    publicId: json.public_id,
    filename: file.name.replace(/\.[^.]+$/, "") || json.original_filename || "image",
    folder: sig.folder,
    width: json.width,
    height: json.height,
    bytes: json.bytes,
    format: json.format,
  });
}
