"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaPhotoFilm } from "react-icons/fa6";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatBytes, thumb, uploadToLibrary, type MediaAsset, type MediaPage } from "../../lib/media";
import { CloseIcon, SearchIcon } from "../icons";

/**
 * Pick an image from the media library (or upload a new one), like the media dialog in WordPress.
 * Used by every image field in the admin. `uploadFolder` is where newly uploaded files are filed.
 */
export function MediaPickerModal({ uploadFolder, selectedUrl, onSelect, onClose }: { uploadFolder: string; selectedUrl?: string; onSelect: (url: string) => void; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"library" | "upload">("library");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<{ name: string; state: "uploading" | "done" | "error"; message?: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["media-assets", debounced],
    queryFn: ({ pageParam }) => api.get<MediaPage>(`/media/assets?limit=40${debounced ? `&search=${encodeURIComponent(debounced)}` : ""}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploads(list.map((f) => ({ name: f.name, state: "uploading" as const })));
    let first: MediaAsset | null = null;
    for (const [i, file] of list.entries()) {
      try {
        const asset = await uploadToLibrary(file, uploadFolder);
        first ??= asset;
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, state: "done" } : x)));
      } catch (e) {
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, state: "error", message: e instanceof Error ? e.message : "Upload failed" } : x)));
      }
    }
    await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
    if (first) {
      setSelected(first);
      setTab("library");
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  const choose = (asset: MediaAsset) => {
    onSelect(asset.url);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 sm:p-6" onClick={onClose}>
      <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3">
          <div className="flex items-center gap-1">
            <p className="mr-3 text-base font-semibold text-neutral-900">Media Library</p>
            {(["library", "upload"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-brand-red text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
                {t === "library" ? `Library${total ? ` (${total})` : ""}` : "Upload files"}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90">
            <CloseIcon size={14} />
          </button>
        </div>

        {tab === "upload" ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-6">
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void upload(e.dataTransfer.files);
              }}
              className={`flex h-56 w-full max-w-xl cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-center transition ${dragOver ? "border-brand-red bg-red-50" : "border-neutral-300 hover:border-brand-red hover:bg-neutral-50"}`}
            >
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
                <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
              </svg>
              <p className="text-sm font-medium text-neutral-700">Drop images here or click to choose files</p>
              <p className="text-xs text-neutral-400">JPG, PNG or WebP, up to 10 MB each. You can pick several at once.</p>
            </div>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />
            {uploads.length > 0 && (
              <ul className="w-full max-w-xl space-y-1.5">
                {uploads.map((u, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                    <span className="truncate text-neutral-700">{u.name}</span>
                    <span className={u.state === "error" ? "text-red-600" : u.state === "done" ? "text-green-600" : "text-neutral-400"}>{u.state === "uploading" ? "Uploading..." : u.state === "done" ? "Uploaded" : u.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-neutral-100 px-5 py-3">
              <div className="relative max-w-sm">
                <SearchIcon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search images by name" className="input w-full !pl-9" />
              </div>
            </div>
            <div className="modal-scroll min-h-0 flex-1 overflow-y-auto p-5">
              {isLoading ? (
                <p className="py-10 text-center text-sm text-neutral-400">Loading images...</p>
              ) : items.length === 0 ? (
                <div className="py-14 text-center">
                  <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-brand-red">
                    <FaPhotoFilm size={26} />
                  </span>
                  <p className="text-sm text-neutral-500">{debounced ? "No images match your search." : "No images in the library yet."}</p>
                  {!debounced && (
                    <button type="button" onClick={() => setTab("upload")} className="mt-3 rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">
                      Upload images
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                    {items.map((a) => {
                      const on = selected?.id === a.id || (!selected && selectedUrl === a.url);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setSelected(a)}
                          onDoubleClick={() => choose(a)}
                          title={a.filename}
                          className={`group relative aspect-square overflow-hidden rounded-xl border-2 bg-neutral-100 ${on ? "border-brand-red ring-2 ring-brand-red/30" : "border-transparent hover:border-neutral-300"}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={thumb(a.url)} alt={a.filename} loading="lazy" className="h-full w-full object-contain" />
                          {on && <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-red text-[11px] text-white">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  {hasNextPage && (
                    <div className="mt-4 text-center">
                      <button type="button" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60">
                        {isFetchingNextPage ? "Loading..." : "Load more"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-neutral-200 px-5 py-3">
              <p className="min-w-0 truncate text-xs text-neutral-500">
                {selected ? `${selected.filename}${selected.width && selected.height ? ` · ${selected.width}×${selected.height}` : ""}${selected.bytes ? ` · ${formatBytes(selected.bytes)}` : ""}` : "Click an image to select it, or double-click to use it."}
              </p>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={onClose} className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100">
                  Cancel
                </button>
                <button type="button" disabled={!selected} onClick={() => selected && choose(selected)} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  Use this image
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
