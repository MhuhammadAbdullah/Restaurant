"use client";

import { useRef, useState } from "react";
import { FaCloudArrowUp, FaXmark } from "react-icons/fa6";
import { api, ApiError } from "../lib/api";

type UploadSignature = {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
  allowedFormats: string;
};

const MAX_IMAGES = 6;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Direct-to-Cloudinary upload for (optional, up to 6) complaint attachments — works for guests
 * too, since the signature endpoint it calls is public and hardcoded to the "complaints" folder.
 */
export function ComplaintImageUpload({ value, onChange }: { value: string[]; onChange: (urls: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadOne(file: File): Promise<string> {
    const sig = await api.public.get<UploadSignature>("/media/complaint-upload-signature");
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
    return json.secure_url as string;
  }

  async function handleFiles(files: FileList | File[]) {
    setError(null);
    const remaining = MAX_IMAGES - value.length;
    if (remaining <= 0) {
      setError(`You can attach up to ${MAX_IMAGES} images`);
      return;
    }
    const toUpload = Array.from(files).slice(0, remaining);
    const oversized = toUpload.find((f) => f.size > MAX_FILE_BYTES);
    if (oversized) {
      setError(`"${oversized.name}" is larger than 5MB`);
      return;
    }

    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of toUpload) {
        uploaded.push(await uploadOne(file));
      }
      onChange([...value, ...uploaded]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not upload image");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  const full = value.length >= MAX_IMAGES;

  return (
    <div>
      {!full && (
        <button
          type="button"
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          disabled={uploading}
          className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
            dragOver ? "border-brand-red bg-red-50" : "border-line bg-surface hover:border-brand-red hover:bg-surface-alt"
          } disabled:cursor-wait`}
        >
          {uploading ? (
            <>
              <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-brand-red/20 border-t-brand-red" />
              <span className="text-sm font-medium text-ink">Uploading...</span>
            </>
          ) : (
            <>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-brand-red">
                <FaCloudArrowUp size={20} />
              </span>
              <span className="text-sm font-semibold text-ink">Click to upload or drag photos here</span>
              <span className="text-xs text-muted">
                JPG, PNG or WebP, up to 5MB each ({value.length}/{MAX_IMAGES} added)
              </span>
            </>
          )}
        </button>
      )}

      {value.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {value.map((url, i) => (
            <div key={url} className="group relative aspect-square overflow-hidden rounded-xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Attached photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label="Remove photo"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white transition hover:bg-brand-red"
              >
                <FaXmark size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
      />
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
