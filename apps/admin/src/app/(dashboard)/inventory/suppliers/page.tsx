"use client";

import { LoadingDots } from "../../../../components/LoadingDots";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../../lib/api";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { toast } from "../../../../store/useToastStore";
import { confirmDialog } from "../../../../store/useConfirmStore";
import { Field, INPUT, Modal } from "../../../../components/inventory/shared";
import { Th, ThFilter } from "../../../../components/inventory/ThFilter";
import { BulkBar, CheckTd, CheckTh, bulkDelete, useSelection } from "../../../../components/inventory/bulk";
import { EditIcon, TrashIcon } from "../../../../components/icons";

type Supplier = { id: string; name: string; contactName: string; phone: string; email: string; address: string; notes: string; status: "ACTIVE" | "INACTIVE" };
const EMPTY = { name: "", contactName: "", phone: "", email: "", address: "", notes: "", status: "ACTIVE" as "ACTIVE" | "INACTIVE" };

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "inventorySuppliers.create");
  const canEdit = hasPermission(me, "inventorySuppliers.edit");
  const canDelete = hasPermission(me, "inventorySuppliers.delete");
  const { data, isLoading } = useQuery({ queryKey: ["inventory-suppliers"], queryFn: () => api.get<Supplier[]>("/inventory/suppliers?includeInactive=true") });
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["inventory-suppliers"] });

  // header filters
  const [fName, setFName] = useState("");
  const [fPerson, setFPerson] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fStatus, setFStatus] = useState("");
  const filtered = fName !== "" || fPerson !== "" || fPhone !== "" || fEmail !== "" || fAddress !== "" || fStatus !== "";
  const rows = useMemo(() => {
    const has = (text: string, q: string) => text.toLowerCase().includes(q.trim().toLowerCase());
    return (data ?? []).filter(
      (s) =>
        (!fName.trim() || has(s.name, fName)) &&
        (!fPerson.trim() || has(s.contactName, fPerson)) &&
        (!fPhone.trim() || has(s.phone, fPhone)) &&
        (!fEmail.trim() || has(s.email, fEmail)) &&
        (!fAddress.trim() || has(s.address, fAddress)) &&
        (!fStatus || s.status === fStatus),
    );
  }, [data, fName, fPerson, fPhone, fEmail, fAddress, fStatus]);

  const sel = useSelection(rows.map((r) => r.id));
  const [bulkBusy, setBulkBusy] = useState(false);
  async function removeSelected() {
    setBulkBusy(true);
    try {
      const reload = await bulkDelete({ path: "/inventory/suppliers/bulk-delete", ids: sel.selected, noun: "supplier", message: "They are removed. A supplier that already has purchase orders is only switched off, so those orders stay correct.", deactivatedText: "switched off (they have orders)" });
      if (reload) { sel.clear(); await refresh(); }
    } finally {
      setBulkBusy(false);
    }
  }

  function open(s: Supplier | "new") {
    setForm(s === "new" ? EMPTY : { name: s.name, contactName: s.contactName, phone: s.phone, email: s.email, address: s.address, notes: s.notes, status: s.status });
    setEditing(s);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Give the supplier a name");
    setSaving(true);
    try {
      if (editing === "new") await api.post("/inventory/suppliers", form);
      else if (editing) await api.patch(`/inventory/suppliers/${editing.id}`, form);
      await refresh();
      toast.success("Saved.");
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the supplier");
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: Supplier) {
    if (!(await confirmDialog({ title: "Remove this supplier?", message: `"${s.name}" is removed. If it has purchase orders it is only switched off.`, confirmLabel: "Remove", tone: "danger" }))) return;
    try {
      const r = await api.delete<{ deactivated: boolean }>(`/inventory/suppliers/${s.id}`);
      toast.success(r.deactivated ? "Supplier switched off (it has orders)." : "Supplier removed.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not remove the supplier");
    }
  }

  function clearFilters() {
    setFName("");
    setFPerson("");
    setFPhone("");
    setFEmail("");
    setFAddress("");
    setFStatus("");
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          The people and shops you buy ingredients from.
          {data && data.length > 0 && <span className="ml-1 text-neutral-400">Showing {rows.length} of {data.length}.</span>}
        </p>
        <div className="flex items-center gap-2">
          {filtered && (
            <button type="button" onClick={clearFilters} className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50">Clear filters</button>
          )}
          {canCreate && (
            <button type="button" onClick={() => open("new")} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Add supplier</button>
          )}
        </div>
      </div>

      {canDelete && <BulkBar count={sel.selected.length} noun="supplier" busy={bulkBusy} onDelete={() => void removeSelected()} onClear={sel.clear} />}

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              {canDelete && <CheckTh checked={sel.allChecked} indeterminate={sel.someChecked} onChange={sel.toggleAll} />}
              <ThFilter label="Supplier" value={fName} onChange={setFName} placeholder="Supplier name" />
              <ThFilter label="Contact person" value={fPerson} onChange={setFPerson} placeholder="Contact person" />
              <ThFilter label="Phone" value={fPhone} onChange={setFPhone} placeholder="Phone number" />
              <ThFilter label="Email" value={fEmail} onChange={setFEmail} placeholder="Email address" />
              <ThFilter label="Address" value={fAddress} onChange={setFAddress} placeholder="Address" />
              <ThFilter label="Status" value={fStatus} onChange={setFStatus} options={[{ value: "ACTIVE", label: "In use" }, { value: "INACTIVE", label: "Switched off" }]} />
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {isLoading ? (
              <tr><td colSpan={8} className="p-6 text-center text-neutral-400"><LoadingDots>Loading</LoadingDots></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-neutral-500">{(data ?? []).length === 0 ? "No suppliers yet." : "No suppliers match the filters."}</td></tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id} className={`transition hover:bg-neutral-50/60 ${s.status === "INACTIVE" ? "opacity-60" : ""}`}>
                  {canDelete && <CheckTd checked={sel.has(s.id)} onChange={() => sel.toggle(s.id)} label={s.name} />}
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900">{s.name}</p>
                    {s.notes && <p className="max-w-[240px] truncate text-xs text-neutral-400">{s.notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{s.contactName || <span className="text-neutral-300">-</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-700">{s.phone || <span className="text-neutral-300">-</span>}</td>
                  <td className="px-4 py-3 text-neutral-700">{s.email || <span className="text-neutral-300">-</span>}</td>
                  <td className="max-w-[260px] px-4 py-3 text-neutral-600">{s.address || <span className="text-neutral-300">-</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>{s.status === "ACTIVE" ? "In use" : "Switched off"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <button type="button" onClick={() => open(s)} title="Edit" aria-label="Edit" className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-red hover:bg-red-50"><EditIcon size={14} /></button>
                      )}
                      {canDelete && (
                        <button type="button" onClick={() => void remove(s)} title="Remove" aria-label="Remove" className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600"><TrashIcon size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === "new" ? "Add supplier" : "Edit supplier"} onClose={() => setEditing(null)} busy={saving}>
          <form onSubmit={save} className="space-y-3">
            <Field label="Name *"><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={INPUT} maxLength={120} autoFocus /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact person"><input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} className={INPUT} /></Field>
              <Field label="Phone"><input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={INPUT} /></Field>
            </div>
            <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={INPUT} /></Field>
            <Field label="Address"><input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className={INPUT} /></Field>
            <Field label="Notes"><textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className={INPUT} /></Field>
            {editing !== "new" && (
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" checked={form.status === "ACTIVE"} onChange={(e) => setForm((f) => ({ ...f, status: e.target.checked ? "ACTIVE" : "INACTIVE" }))} className="accent-[#ED2320]" /> Supplier is in use
              </label>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditing(null)} disabled={saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
              <button disabled={saving} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? <LoadingDots>Saving</LoadingDots> : "Save"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
