"use client";

import { LoadingDots } from "../../../components/LoadingDots";
import { useEffect, useRef, useState } from "react";
import { FaPhotoFilm } from "react-icons/fa6";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../lib/api";
import { useMe, hasPermission } from "../../../lib/useMe";
import { formatBytes, thumb, uploadToLibrary, type MediaAsset, type MediaPage } from "../../../lib/media";
import { toast } from "../../../store/useToastStore";
import { CloseIcon, SearchIcon, TrashIcon } from "../../../components/icons";

type Usage = { used: { label: string; count: number }[] };

export default function MediaLibraryPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canSync = hasPermission(me, "cms.create");
  const canDelete = hasPermission(me, "cms.delete");
  const canEdit = hasPermission(me, "cms.edit");

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [forceNeeded, setForceNeeded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // bulk selection (tick boxes on the tiles)
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkSkipped, setBulkSkipped] = useState<{ id: string; filename: string; used: { label: string; count: number }[] }[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [altDraft, setAltDraft] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  // the edit boxes follow whichever image is selected
  useEffect(() => {
    setNameDraft(selected?.filename ?? "");
    setAltDraft(selected?.altText ?? "");
  }, [selected?.id, selected?.filename, selected?.altText]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["media-assets", debounced],
    queryFn: ({ pageParam }) => api.get<MediaPage>(`/media/assets?limit=40${debounced ? `&search=${encodeURIComponent(debounced)}` : ""}${pageParam ? `&cursor=${pageParam}` : ""}`),
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const { data: usage } = useQuery({
    queryKey: ["media-usage", selected?.id],
    queryFn: () => api.get<Usage>(`/media/assets/${selected!.id}/usage`),
    enabled: !!selected,
  });

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    let lastOk: MediaAsset | null = null;
    for (const [i, file] of list.entries()) {
      setUploading(`Uploading ${i + 1} of ${list.length}...`);
      try {
        lastOk = await uploadToLibrary(file, "restaurant");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      }
    }
    setUploading(null);
    if (inputRef.current) inputRef.current.value = "";
    await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
    if (lastOk) {
      setSelected(lastOk);
      toast.success(list.length > 1 ? "Images uploaded." : "Image uploaded.");
    }
  }

  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setBulkConfirm(false);
    setBulkSkipped([]);
  }

  function clearChecked() {
    setChecked(new Set());
    setBulkConfirm(false);
    setBulkSkipped([]);
  }

  async function bulkDelete(force: boolean) {
    setBulkBusy(true);
    try {
      const ids = [...checked];
      // the server takes up to 100 images per request, so a bigger selection is sent in batches
      type Skipped = { id: string; filename: string; used: { label: string; count: number }[] };
      const res: { deleted: number; skipped: Skipped[] } = { deleted: 0, skipped: [] };
      for (let i = 0; i < ids.length; i += 50) {
        const part = await api.post<{ deleted: number; skipped: Skipped[] }>("/media/assets/bulk-delete", { ids: ids.slice(i, i + 50), force });
        res.deleted += part.deleted;
        res.skipped.push(...part.skipped);
      }
      await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
      if (res.deleted > 0) toast.success(`${res.deleted} image${res.deleted === 1 ? "" : "s"} deleted.`);
      if (selected && ids.includes(selected.id) && (force || !res.skipped.some((x) => x.id === selected.id))) setSelected(null);
      if (res.skipped.length > 0) {
        // keep only the images that were not deleted selected, so they can be deleted anyway after a warning
        setChecked(new Set(res.skipped.map((x) => x.id)));
        setBulkSkipped(res.skipped);
        setBulkConfirm(true);
      } else {
        clearChecked();
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete the images");
    } finally {
      setBulkBusy(false);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      const res = await api.post<{ added: number }>("/media/assets/sync");
      await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
      toast.success(res.added > 0 ? `${res.added} existing image${res.added === 1 ? "" : "s"} added to the library.` : "The library already has all your images.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not import images");
    } finally {
      setSyncing(false);
    }
  }

  async function remove(force: boolean) {
    if (!selected) return;
    setDeleting(true);
    try {
      await api.delete(`/media/assets/${selected.id}${force ? "?force=true" : ""}`);
      await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
      setSelected(null);
      setConfirmDelete(false);
      setForceNeeded(false);
      toast.success("Image deleted.");
    } catch (e) {
      if (e instanceof ApiError && e.code === "MEDIA_IN_USE") setForceNeeded(true);
      else toast.error(e instanceof ApiError ? e.message : "Could not delete the image");
    } finally {
      setDeleting(false);
    }
  }

  const metaChanged = !!selected && (nameDraft.trim() !== selected.filename || altDraft.trim() !== (selected.altText ?? ""));

  async function saveMeta() {
    if (!selected || !nameDraft.trim()) return;
    setSavingMeta(true);
    try {
      const updated = await api.patch<MediaAsset>(`/media/assets/${selected.id}`, { filename: nameDraft.trim(), altText: altDraft.trim() });
      setSelected(updated);
      await queryClient.invalidateQueries({ queryKey: ["media-assets"] });
      toast.success("Image details saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save the details");
    } finally {
      setSavingMeta(false);
    }
  }

  async function copyUrl() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.url);
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy the link");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Media Library</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            All your uploaded images in one place. Upload once, then pick the image from here whenever a product, category, banner or setting asks for one.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canSync && (
            <button type="button" onClick={sync} disabled={syncing} className="rounded-lg border border-neutral-300 px-3.5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60">
              {syncing ? <LoadingDots>Importing</LoadingDots> : "Import existing images"}
            </button>
          )}
          <button type="button" onClick={() => inputRef.current?.click()} disabled={!!uploading} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {uploading ?? "+ Upload images"}
          </button>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <SearchIcon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search images by name" className="input w-full !pl-9" />
        </div>
        <p className="shrink-0 text-xs text-neutral-400">{total} image{total === 1 ? "" : "s"}</p>
      </div>

      {canDelete && checked.size > 0 && (
        <div className="mt-4 rounded-xl border border-brand-red/30 bg-red-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-neutral-800">{checked.size} selected</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setChecked(new Set(items.map((a) => a.id)))} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                Select all loaded ({items.length})
              </button>
              <button type="button" onClick={clearChecked} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                Clear selection
              </button>
              {!bulkConfirm && (
                <button type="button" onClick={() => setBulkConfirm(true)} className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">
                  <TrashIcon size={13} /> Delete selected
                </button>
              )}
            </div>
          </div>
          {bulkConfirm && (
            <div className="mt-3 rounded-lg bg-white p-3">
              {bulkSkipped.length > 0 ? (
                <>
                  <p className="text-sm font-medium text-red-700">{bulkSkipped.length} image{bulkSkipped.length === 1 ? " is" : "s are"} still in use and {bulkSkipped.length === 1 ? "was" : "were"} not deleted:</p>
                  <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-xs text-neutral-600">
                    {bulkSkipped.map((x) => (
                      <li key={x.id}>
                        <span className="font-medium text-neutral-800">{x.filename}</span>: {x.used.map((u) => u.label).join(", ")}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-neutral-500">Deleting them will leave those places without a picture.</p>
                </>
              ) : (
                <p className="text-sm text-neutral-700">Delete {checked.size} image{checked.size === 1 ? "" : "s"} for good? This cannot be undone. Images that are in use will be skipped and listed for you.</p>
              )}
              <div className="mt-2.5 flex gap-2">
                <button type="button" disabled={bulkBusy} onClick={() => bulkDelete(bulkSkipped.length > 0)} className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">
                  {bulkBusy ? <LoadingDots>Deleting</LoadingDots> : bulkSkipped.length > 0 ? "Delete anyway" : "Delete"}
                </button>
                <button type="button" onClick={() => { setBulkConfirm(false); setBulkSkipped([]); }} className="rounded-lg border border-brand-red bg-white px-3.5 py-1.5 text-xs font-medium text-brand-red">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          {isLoading ? (
            <p className="py-12 text-center text-sm text-neutral-400"><LoadingDots>Loading images</LoadingDots></p>
          ) : items.length === 0 ? (
            <div className="py-14 text-center">
              <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-brand-red">
                <FaPhotoFilm size={26} />
              </span>
              <p className="text-sm text-neutral-500">{debounced ? "No images match your search." : "No images in the library yet."}</p>
              {!debounced && <p className="mt-1 text-xs text-neutral-400">Upload new images, or use &quot;Import existing images&quot; to bring in the ones you uploaded earlier.</p>}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
                {items.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setSelected(a);
                      setConfirmDelete(false);
                      setForceNeeded(false);
                    }}
                    title={a.filename}
                    className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-neutral-100 ${checked.has(a.id) ? "ring-2 ring-brand-red/60" : ""} ${selected?.id === a.id ? "border-brand-red ring-2 ring-brand-red/30" : "border-transparent hover:border-neutral-300"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb(a.url)} alt={a.filename} loading="lazy" className="h-full w-full object-contain" />
                    {canDelete && (
                      <span
                        role="checkbox"
                        aria-checked={checked.has(a.id)}
                        aria-label={`Select ${a.filename}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleChecked(a.id);
                        }}
                        className={`absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border-2 text-[11px] leading-none shadow-sm ${checked.has(a.id) ? "border-brand-red bg-brand-red text-white" : "border-white bg-white/80 text-transparent hover:border-brand-red"}`}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {hasNextPage && (
                <div className="mt-4 text-center">
                  <button type="button" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60">
                    {isFetchingNextPage ? <LoadingDots>Loading</LoadingDots> : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <aside className="h-fit rounded-xl border border-neutral-200 bg-white p-4 lg:sticky lg:top-4">
          {selected ? (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-900">Image details</p>
                <button type="button" onClick={() => setSelected(null)} aria-label="Close details" className="text-neutral-400 hover:text-neutral-700">
                  <CloseIcon size={14} />
                </button>
              </div>
              <div className="mt-3 flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumb(selected.url, 600)} alt={selected.filename} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="mt-3 space-y-2">
                <div>
                  <p className="mb-1 text-[11px] font-medium text-neutral-500">Name</p>
                  <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={200} disabled={!canEdit} className="input w-full text-sm" />
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-medium text-neutral-500">Alt text</p>
                  <textarea
                    value={altDraft}
                    onChange={(e) => setAltDraft(e.target.value)}
                    maxLength={300}
                    rows={2}
                    disabled={!canEdit}
                    placeholder="Describe the picture, e.g. Plate of chicken biryani with raita"
                    className="input w-full resize-none text-sm"
                  />
                  <p className="mt-0.5 text-[10px] text-neutral-400">Helps people using screen readers and search engines understand the image.</p>
                </div>
                {canEdit && metaChanged && (
                  <button type="button" onClick={saveMeta} disabled={savingMeta || !nameDraft.trim()} className="w-full rounded-lg bg-brand-red px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
                    {savingMeta ? <LoadingDots>Saving</LoadingDots> : "Save changes"}
                  </button>
                )}
              </div>
              <dl className="mt-3 space-y-1 text-xs text-neutral-600">
                {selected.width && selected.height && <div className="flex justify-between gap-3"><dt className="text-neutral-400">Size</dt><dd>{selected.width} × {selected.height}</dd></div>}
                {selected.bytes ? <div className="flex justify-between gap-3"><dt className="text-neutral-400">File size</dt><dd>{formatBytes(selected.bytes)}</dd></div> : null}
                {selected.format && <div className="flex justify-between gap-3"><dt className="text-neutral-400">Type</dt><dd className="uppercase">{selected.format}</dd></div>}
                <div className="flex justify-between gap-3"><dt className="text-neutral-400">Uploaded</dt><dd>{new Date(selected.createdAt).toLocaleDateString()}</dd></div>
              </dl>
              <div className="mt-3">
                <p className="mb-1 text-[11px] font-medium text-neutral-500">Link</p>
                <div className="flex gap-2">
                  <input readOnly value={selected.url} onFocus={(e) => e.currentTarget.select()} className="input w-full text-xs" />
                  <button type="button" onClick={copyUrl} className="shrink-0 rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50">Copy</button>
                </div>
              </div>
              <div className="mt-3">
                <p className="mb-1 text-[11px] font-medium text-neutral-500">Used in</p>
                {usage ? (
                  usage.used.length > 0 ? (
                    <ul className="space-y-0.5 text-xs text-neutral-700">
                      {usage.used.map((u) => (
                        <li key={u.label}>{u.label}{u.count > 1 ? ` (${u.count})` : ""}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-neutral-400">Not used anywhere yet.</p>
                  )
                ) : (
                  <p className="text-xs text-neutral-400"><LoadingDots>Checking</LoadingDots></p>
                )}
              </div>
              {canDelete && (
                <div className="mt-4 border-t border-neutral-100 pt-3">
                  {!confirmDelete ? (
                    <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:underline">
                      <TrashIcon size={14} /> Delete image
                    </button>
                  ) : (
                    <div className="rounded-lg bg-red-50 p-3">
                      <p className="text-xs text-red-700">
                        {forceNeeded ? "This image is still used in the places above. Deleting it will leave those spots without a picture." : "Delete this image for good? This cannot be undone."}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={deleting} onClick={() => remove(forceNeeded)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">
                          {deleting ? <LoadingDots>Deleting</LoadingDots> : forceNeeded ? "Delete anyway" : "Delete"}
                        </button>
                        <button type="button" onClick={() => { setConfirmDelete(false); setForceNeeded(false); }} className="rounded-lg border border-brand-red bg-white px-3 py-1.5 text-xs font-medium text-brand-red">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                <FaPhotoFilm size={20} />
              </span>
              <p className="text-sm text-neutral-400">Select an image to see its details.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
