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

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-ink">
        Attach photos <span className="font-normal text-muted">(optional, up to {MAX_IMAGES})</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {value.map((url, i) => (
          <div key={url} className="group relative h-24 w-24 overflow-hidden rounded-xl border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              aria-label="Remove image"
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <CloseIcon size={11} />
            </button>
          </div>
        ))}

        {value.length < MAX_IMAGES && (
          <div
            onClick={() => !uploading && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex h-24 w-24 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed transition ${
              dragOver ? "border-brand-red bg-red-50" : "border-line hover:border-brand-red hover:bg-surface-alt"
            }`}
          >
            {uploading ? (
              <svg className="h-5 w-5 animate-spin text-muted" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : (
              <div className="flex flex-col items-center gap-1 px-2 text-center text-muted">
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
                  <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                </svg>
                <p className="text-xs font-medium">Upload</p>
              </div>
            )}
          </div>
        )}
      </div>
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
