"use client";

import { useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { CloseIcon } from "./icons";

type UploadSignature = {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
  allowedFormats: string;
};

/**
 * Uploads directly to Cloudinary via a short-lived signed payload from our API (the binary
 * never touches our server). The "paste a URL instead" fallback stays tucked behind a toggle —
 * upload is the primary flow once CLOUDINARY_* env vars are configured.
 */
export function ImageUploadField({
  label,
  folder,
  value,
  onChange,
  compact,
  hideLabel,
  shape,
  hint,
}: {
  label: string;
  folder: "restaurant" | "banners" | "products" | "categories" | "deals" | "choices" | "addons";
  value: string;
  onChange: (url: string) => void;
  /** Smaller, square (1:1) dropzone instead of the default wide h-40 banner-style one. */
  compact?: boolean;
  /** Skip the built-in label above the dropzone — for callers rendering their own caption elsewhere (e.g. below the image, in a dense grid). */
  hideLabel?: boolean;
  /**
   * Fixes the dropzone's proportions so the preview matches what the image is for:
   * "square" is 1:1 (icons/thumbnails — cropped to fill), "landscape" is a wide 21:9 banner (shown whole, uncropped).
   * Omit it for the legacy compact / wide-box behaviour.
   */
  shape?: "square" | "landscape";
  /** Short guidance under the upload prompt, e.g. the recommended size. */
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrlField, setShowUrlField] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const sig = await api.get<UploadSignature>(`/media/cloudinary-signature?folder=${folder}`);
      const body = new FormData();
      body.append("file", file);
      body.append("api_key", sig.apiKey);
      body.append("timestamp", String(sig.timestamp));
      body.append("signature", sig.signature);
      body.append("folder", sig.folder);
      body.append("allowed_formats", sig.allowedFormats);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: "POST", body });
      const json = await res.json();
      if (!res.ok || !json.secure_url) throw new Error(json.error?.message ?? "Upload failed");
      onChange(json.secure_url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not upload image");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      {!hideLabel && <p className="mb-1 text-xs font-medium text-neutral-500">{label}</p>}

      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition ${
          shape === "square" ? "aspect-square w-44" : shape === "landscape" ? "aspect-[21/9] w-full bg-neutral-50" : compact ? "h-32 w-32" : "h-40 w-full"
        } ${dragOver ? "border-brand-red bg-red-50" : "border-neutral-300 hover:border-brand-red hover:bg-neutral-50"}`}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className={`h-full w-full ${shape === "landscape" ? "object-contain" : "object-cover"}`} />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/50 group-hover:opacity-100">
              <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-900">Click or drop to replace</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              aria-label="Remove image"
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <CloseIcon size={12} />
            </button>
          </>
        ) : uploading ? (
          <div className="flex flex-col items-center gap-2 text-neutral-400">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-sm">Uploading...</p>
          </div>
        ) : (
          <div className={`flex flex-col items-center text-center text-neutral-400 ${compact && !shape ? "gap-1 px-2" : "gap-1.5 px-4"}`}>
            <svg width={compact ? 20 : 28} height={compact ? 20 : 28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
              <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
            {compact && !shape ? (
              <p className="text-xs font-medium text-neutral-500">Upload</p>
            ) : (
              <>
                <p className="text-sm font-medium text-neutral-500">Click or drag an image to upload</p>
                <p className="text-xs">{hint ?? "JPG, PNG or WEBP"}</p>
              </>
            )}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={() => setShowUrlField((s) => !s)}
        className="mt-1.5 text-xs text-neutral-400 underline hover:text-neutral-600"
      >
        {showUrlField ? "Hide URL field" : "Paste an image URL instead"}
      </button>
      {showUrlField && (
        <input
          type="text"
          placeholder="https://..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input mt-1.5 w-full"
        />
      )}
    </div>
  );
}
