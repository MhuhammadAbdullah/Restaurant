"use client";

import { useEffect, useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { toast } from "../../store/useToastStore";
import { useMe, hasPermission } from "../../lib/useMe";
import { StatusToggle } from "../StatusToggle";
import { SearchInput } from "../SearchFilterBar";
import { EditIcon, TrashIcon, CloseIcon } from "../icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

type Branch = { id: string; name: string; code: string; city: string; deliveryEnabled: boolean; status: string };
type AreaCatalogEntry = { id: string; city: string; name: string; isActive: boolean };
type DeliveryAreaLink = { id: string; branchId: string; areaId: string; isActive: boolean; area: AreaCatalogEntry };

const PAGE = 50;
const sameCity = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function ConfirmModal({ title, body, confirmLabel, busy, onConfirm, onClose }: { title: string; body: React.ReactNode; confirmLabel: string; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <p className="text-base font-semibold text-neutral-900">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"><CloseIcon size={14} /></button>
        </div>
        <div className="p-5">
          <div className="text-sm text-neutral-600">{body}</div>
          <div className="mt-5 flex items-center gap-3">
            <button type="button" onClick={onConfirm} disabled={busy} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">{busy ? "Working..." : confirmLabel}</button>
            <button type="button" onClick={onClose} className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Per-area popover: tick the branches (in the area's city) that deliver there. */
function ServedByPicker({
  area,
  cityBranches,
  servingIds,
  busyKey,
  disabled,
  onToggle,
}: {
  area: AreaCatalogEntry;
  cityBranches: Branch[];
  servingIds: Set<string>;
  busyKey: string | null;
  disabled: boolean;
  onToggle: (branch: Branch, on: boolean) => void;
}) {
  const serving = cityBranches.filter((b) => servingIds.has(b.id));
  return (
    <Popover.Root>
      <Popover.Trigger asChild disabled={disabled || cityBranches.length === 0}>
        <button
          type="button"
          className={`group flex max-w-[16rem] flex-wrap items-center gap-1 rounded-lg border px-2 py-1 text-left text-xs transition ${
            serving.length === 0 && area.isActive ? "border-amber-300 bg-amber-50" : "border-neutral-200 hover:border-brand-red hover:bg-red-50"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {serving.length > 0 ? (
            serving.map((b) => (
              <span key={b.id} title={b.name} className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-neutral-700">{b.code}</span>
            ))
          ) : (
            <span className={area.isActive ? "font-medium text-amber-700" : "text-neutral-400"}>{cityBranches.length === 0 ? `No branch in ${area.city}` : area.isActive ? "No branch yet" : "None"}</span>
          )}
          {!disabled && cityBranches.length > 0 && <span className="ml-0.5 text-[10px] text-neutral-400 group-hover:text-brand-red">Edit</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-[60] w-64 rounded-xl border border-neutral-200 bg-white p-2 shadow-xl">
          <p className="px-2 pb-1 pt-1 text-xs font-semibold text-neutral-800">Who delivers to {area.name}?</p>
          <div className="space-y-1">
            {cityBranches.map((b) => {
              const on = servingIds.has(b.id);
              return (
                <label key={b.id} className={`flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-2 text-sm ${on ? "border-brand-red bg-red-50" : "border-neutral-200 hover:bg-neutral-50"}`}>
                  <span className="min-w-0">
                    <span className={`block truncate ${on ? "font-medium text-brand-red" : "text-neutral-700"}`}>{b.name}</span>
                    {!b.deliveryEnabled && <span className="block text-[10px] text-amber-700">Delivery is off for this branch</span>}
                  </span>
                  <input type="checkbox" checked={on} disabled={busyKey === `${area.id}:${b.id}`} onChange={() => onToggle(b, !on)} className="h-4 w-4 accent-[#ED2320]" />
                </label>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function DeliveryAreasTab() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canEdit = hasPermission(me, "branches.edit");
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => api.get<Branch[]>("/branches") });
  const branchList = branches ?? [];
  const cities = useMemo(() => Array.from(new Set(branchList.map((b) => b.city))).sort(), [branchList]);

  const { data: catalog } = useQuery({ queryKey: ["area-catalog", "all", ""], queryFn: () => api.get<AreaCatalogEntry[]>("/branches/area-catalog") });
  const all = catalog ?? [];

  const linkQueries = useQueries({
    queries: branchList.map((b) => ({
      queryKey: ["branch-delivery-areas", b.id],
      queryFn: () => api.get<DeliveryAreaLink[]>(`/branches/${b.id}/delivery-areas`),
    })),
  });
  const linksLoaded = branchList.length > 0 && linkQueries.every((q) => q.isSuccess);
  // areaId -> (branchId -> link)
  const linkMap = useMemo(() => {
    const m = new Map<string, Map<string, DeliveryAreaLink>>();
    branchList.forEach((b, i) => {
      for (const l of linkQueries[i]?.data ?? []) {
        if (!m.has(l.areaId)) m.set(l.areaId, new Map());
        m.get(l.areaId)!.set(b.id, l);
      }
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchList, linkQueries.map((q) => q.dataUpdatedAt).join("|")]);
  const servingIdsOf = (areaId: string) => new Set([...(linkMap.get(areaId)?.entries() ?? [])].filter(([, l]) => l.isActive).map(([bid]) => bid));

  // filters
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [coverFilter, setCoverFilter] = useState("");
  const [limit, setLimit] = useState(PAGE);

  // add form
  const [newCity, setNewCity] = useState("");
  const [newNames, setNewNames] = useState("");

  // row edit / delete / busy
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!newCity && cities.length > 0) setNewCity(cities[0]!);
  }, [cities, newCity]);
  useEffect(() => {
    setLimit(PAGE);
  }, [search, cityFilter, coverFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((a) => {
        if (q && !a.name.toLowerCase().includes(q)) return false;
        if (cityFilter && a.city !== cityFilter) return false;
        if (coverFilter === "hidden" && a.isActive) return false;
        if (coverFilter === "served" || coverFilter === "unserved") {
          if (!a.isActive) return false;
          if (linksLoaded) {
            const served = servingIdsOf(a.id).size > 0;
            if (coverFilter === "served" && !served) return false;
            if (coverFilter === "unserved" && served) return false;
          }
        }
        return true;
      })
      .sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, search, cityFilter, coverFilter, linkMap, linksLoaded]);
  const shown = filtered.slice(0, limit);
  const isFiltering = [search.trim(), cityFilter, coverFilter].some((v) => v !== "");
  const grouped = useMemo(() => {
    const map = new Map<string, AreaCatalogEntry[]>();
    for (const a of shown) map.set(a.city, [...(map.get(a.city) ?? []), a]);
    return Array.from(map.entries());
  }, [shown]);
  const unserved = linksLoaded ? all.filter((a) => a.isActive && servingIdsOf(a.id).size === 0).length : 0;

  const parsedNames = useMemo(() => Array.from(new Set(newNames.split(/[\n,;]+/).map((n) => n.trim()).filter(Boolean))), [newNames]);
  const cityBranchesOf = (city: string) => branchList.filter((b) => sameCity(b.city, city));

  async function refreshCatalog() {
    await queryClient.invalidateQueries({ queryKey: ["area-catalog"] });
  }
  async function refreshLinks() {
    await queryClient.invalidateQueries({ queryKey: ["branch-delivery-areas"] });
    await queryClient.invalidateQueries({ queryKey: ["branches"] });
  }

  async function addAreas(e: React.FormEvent) {
    e.preventDefault();
    if (!newCity.trim() || parsedNames.length === 0) return;
    setBusy(true);
    try {
      const results = await Promise.allSettled(parsedNames.map((name) => api.post("/branches/area-catalog", { city: newCity.trim(), name })));
      const failed = parsedNames.filter((_, i) => results[i]!.status === "rejected");
      const ok = parsedNames.length - failed.length;
      if (ok > 0) toast.success(`${ok} area${ok === 1 ? "" : "s"} added to ${newCity.trim()}.`);
      if (failed.length > 0) toast.error(`Not added (already exist?): ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "..." : ""}`);
      setNewNames(failed.join("\n"));
      await refreshCatalog();
    } finally {
      setBusy(false);
    }
  }

  async function setVisible(ids: string[], on: boolean) {
    const targets = all.filter((a) => ids.includes(a.id) && a.isActive !== on);
    if (targets.length === 0) return;
    setBusy(true);
    try {
      const res = await Promise.allSettled(targets.map((a) => api.patch(`/branches/area-catalog/${a.id}`, { isActive: on })));
      const failed = res.filter((r) => r.status === "rejected").length;
      await refreshCatalog();
      if (failed) toast.error(`${failed} could not be updated.`);
      else if (targets.length > 1) toast.success(`${targets.length} areas ${on ? "shown to" : "hidden from"} customers.`);
    } finally {
      setBusy(false);
    }
  }

  async function saveRename(area: AreaCatalogEntry) {
    if (!editingName.trim() || editingName.trim() === area.name) return setEditingId(null);
    setBusy(true);
    try {
      await api.patch(`/branches/area-catalog/${area.id}`, { name: editingName.trim() });
      setEditingId(null);
      await refreshCatalog();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not rename area");
    } finally {
      setBusy(false);
    }
  }

  async function setServed(area: AreaCatalogEntry, branch: Branch, on: boolean) {
    const link = linkMap.get(area.id)?.get(branch.id);
    if (link ? link.isActive === on : !on) return;
    if (link) await api.patch(`/branches/${branch.id}/delivery-areas/${link.id}`, { isActive: on });
    else await api.post(`/branches/${branch.id}/delivery-areas`, { areaId: area.id });
  }

  async function toggleServed(area: AreaCatalogEntry, branch: Branch, on: boolean) {
    setBusyKey(`${area.id}:${branch.id}`);
    try {
      await setServed(area, branch, on);
      await refreshLinks();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update delivery area");
    } finally {
      setBusyKey(null);
    }
  }

  async function confirmDelete() {
    if (!deleteIds) return;
    setBusy(true);
    try {
      const res = await Promise.allSettled(deleteIds.map((id) => api.delete(`/branches/area-catalog/${id}`)));
      const failed = res.filter((r) => r.status === "rejected").length;
      await queryClient.invalidateQueries({ queryKey: ["branch-delivery-areas"] });
      await refreshCatalog();
      setDeleteIds(null);
      if (failed) toast.error(`${failed} could not be deleted.`);
      else toast.success(`${deleteIds.length} area${deleteIds.length === 1 ? "" : "s"} deleted.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Areas", all.length],
          ["Visible to customers", all.filter((a) => a.isActive).length],
          ["Cities", new Set(all.map((a) => a.city)).size],
          ["Not delivered by any branch", linksLoaded ? unserved : "—"],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
            <p className="text-xs text-neutral-500">{label}</p>
            <p className="text-xl font-semibold text-neutral-900">{n}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm text-neutral-500">
        The neighbourhoods customers can pick when ordering delivery. An area works when it is <b>visible</b> and at least one branch <b>delivers</b> there. Click “Delivered by” on an area to choose its branches.
      </p>

      {canEdit && (
        <form onSubmit={addAreas} className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-white p-4">
          <p className="text-sm font-semibold text-neutral-900">Add areas</p>
          <p className="text-xs text-neutral-500">Type one area, or paste many separated by commas or new lines.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr_auto]">
            <div>
              <input list="area-cities" value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="City" className="input w-full" required />
              <datalist id="area-cities">
                {cities.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <textarea value={newNames} onChange={(e) => setNewNames(e.target.value)} rows={2} placeholder="e.g. Clifton, DHA Phase 5, Gulshan-e-Iqbal" className="input w-full" />
            <button disabled={busy || !newCity.trim() || parsedNames.length === 0} className="self-start rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {parsedNames.length > 1 ? `+ Add ${parsedNames.length} areas` : "+ Add area"}
            </button>
          </div>
          {parsedNames.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {parsedNames.map((n) => (
                <span key={n} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-600">{n}</span>
              ))}
            </div>
          )}
          {cityBranchesOf(newCity).length === 0 && newCity.trim() && <p className="mt-2 text-xs text-amber-700">There is no branch in “{newCity.trim()}” yet, so nobody will deliver to these areas until you add one.</p>}
        </form>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search areas..." />
        {all.length > 0 && (
          <Select value={cityFilter || "all"} onValueChange={(v) => setCityFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cities</SelectItem>
              {Array.from(new Set(all.map((a) => a.city))).sort().map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={coverFilter || "all"} onValueChange={(v) => setCoverFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            <SelectItem value="unserved">Nobody delivers here</SelectItem>
            <SelectItem value="served">Delivered by a branch</SelectItem>
            <SelectItem value="hidden">Hidden from customers</SelectItem>
          </SelectContent>
        </Select>
        {isFiltering && <button onClick={() => { setSearch(""); setCityFilter(""); setCoverFilter(""); }} className="text-sm font-medium text-brand-red hover:underline">Clear filters</button>}
        <span className="ml-auto text-xs text-neutral-400">{filtered.length} of {all.length} areas</span>
      </div>

      <div className="mt-3 space-y-5">
        {catalog && all.length === 0 && <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">No delivery areas yet. Add some above.</p>}
        {all.length > 0 && filtered.length === 0 && <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">No areas match your filters.</p>}
        {grouped.map(([city, areas]) => (
          <div key={city}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {city} <span className="ml-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium normal-case text-neutral-500">{areas.length}</span>
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {areas.map((a) => {
                const serving = servingIdsOf(a.id);
                const orphan = linksLoaded && a.isActive && serving.size === 0;
                return (
                  <div key={a.id} className={`rounded-lg border bg-white p-3 ${orphan ? "border-amber-300" : "border-neutral-200"} ${a.isActive ? "" : "opacity-60"}`}>
                    <div className="flex items-center justify-between gap-2">
                      {editingId === a.id ? (
                        <input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void saveRename(a);
                            }
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="input min-w-0 flex-1 py-1"
                          autoFocus
                        />
                      ) : (
                        <p className="min-w-0 truncate text-sm font-medium text-neutral-900" title={a.name}>{a.name}</p>
                      )}
                      {canEdit && (
                        <div className="flex shrink-0 items-center gap-2.5">
                          {editingId === a.id ? (
                            <>
                              <button onClick={() => saveRename(a)} disabled={busy} className="text-xs font-medium text-brand-red">Save</button>
                              <button onClick={() => setEditingId(null)} aria-label="Cancel" className="text-neutral-400 hover:text-neutral-600"><CloseIcon size={13} /></button>
                            </>
                          ) : (
                            <>
                              <StatusToggle active={a.isActive} onClick={() => setVisible([a.id], !a.isActive)} disabled={busy} onLabel="Visible: click to hide" offLabel="Hidden: click to show" />
                              <button onClick={() => { setEditingId(a.id); setEditingName(a.name); }} aria-label="Rename" className="text-neutral-400 hover:text-brand-red"><EditIcon size={14} /></button>
                              <button onClick={() => setDeleteIds([a.id])} aria-label="Delete" className="text-neutral-400 hover:text-red-600"><TrashIcon size={14} /></button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="shrink-0 text-[11px] text-neutral-400">Delivered by</span>
                      {linksLoaded ? (
                        <ServedByPicker area={a} cityBranches={cityBranchesOf(a.city)} servingIds={serving} busyKey={busyKey} disabled={!canEdit} onToggle={(b, on) => toggleServed(a, b, on)} />
                      ) : (
                        <span className="text-xs text-neutral-300">…</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {filtered.length > shown.length && (
          <div className="text-center">
            <button onClick={() => setLimit((l) => l + PAGE)} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
              Show {Math.min(PAGE, filtered.length - shown.length)} more ({filtered.length - shown.length} remaining)
            </button>
          </div>
        )}
      </div>

      {deleteIds && (
        <ConfirmModal
          title={`Delete ${deleteIds.length === 1 ? "area" : `${deleteIds.length} areas`}`}
          body={<>{deleteIds.length === 1 ? "This area is" : "These areas are"} removed from every branch that delivers there. To only stop customers choosing {deleteIds.length === 1 ? "it" : "them"}, use <b>Hide</b> instead.</>}
          confirmLabel="Delete"
          busy={busy}
          onConfirm={confirmDelete}
          onClose={() => setDeleteIds(null)}
        />
      )}
    </div>
  );
}
