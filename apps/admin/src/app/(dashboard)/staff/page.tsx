"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { useMe, hasPermission } from "../../../lib/useMe";
import { CloseIcon, EditIcon, TrashIcon } from "../../../components/icons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

type StaffMember = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: "ACTIVE" | "INACTIVE";
  allBranchesAccess: boolean;
  role: { id: string; name: string };
  branchAssignments: { branch: { id: string; name: string; code: string } }[];
};
type Role = { id: string; name: string };
type Branch = { id: string; name: string; code: string };

type StaffFormState = {
  name: string;
  email: string;
  phone: string;
  password: string;
  roleId: string;
  branchIds: string[];
  allBranchesAccess: boolean;
};

const EMPTY_FORM: StaffFormState = { name: "", email: "", phone: "", password: "", roleId: "", branchIds: [], allBranchesAccess: false };

function StaffFormModal({
  mode,
  initial,
  roles,
  branches,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial: StaffMember | null;
  roles: Role[] | undefined;
  branches: Branch[] | undefined;
  onClose: () => void;
  onSaved: (newStaffId?: string) => void;
}) {
  const [form, setForm] = useState<StaffFormState>(
    initial
      ? {
          name: initial.name,
          email: initial.email,
          phone: initial.phone ?? "",
          password: "",
          roleId: initial.role.id,
          branchIds: initial.branchAssignments.map((a) => a.branch.id),
          allBranchesAccess: initial.allBranchesAccess,
        }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);

  function toggleBranch(id: string) {
    setForm((f) => ({ ...f, branchIds: f.branchIds.includes(id) ? f.branchIds.filter((x) => x !== id) : [...f.branchIds, id] }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "create" && !form.roleId) {
      toast.error("Please select a role");
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        const created = await api.post<{ id: string }>("/staff", form);
        toast.success("Staff member created.");
        onSaved(created.id);
      } else if (initial) {
        // Role, branch access, and permissions are managed from the "Manage Access" detail page —
        // this modal only touches basic contact details for an existing staff member.
        await api.patch(`/staff/${initial.id}`, {
          name: form.name,
          email: form.email,
          phone: form.phone,
        });
        toast.success("Staff member updated.");
        onSaved();
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save staff member");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-neutral-900">{mode === "create" ? "New Staff Member" : `Edit ${initial?.name}`}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200"><CloseIcon size={14} /></button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <input placeholder="Full name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input col-span-2" required />
          <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="input" required />
          <input placeholder="Phone / WhatsApp number" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="input" />
          {mode === "create" && (
            <>
              <input type="password" placeholder="Password (min 8 chars)" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="input col-span-2" required />
              <Select value={form.roleId || undefined} onValueChange={(v) => setForm((f) => ({ ...f, roleId: v }))}>
                <SelectTrigger className="col-span-2 w-full"><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {roles?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="col-span-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-neutral-500">Branch access</p>
                  <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                    <input
                      type="checkbox"
                      checked={form.allBranchesAccess}
                      onChange={(e) => setForm((f) => ({ ...f, allBranchesAccess: e.target.checked, branchIds: e.target.checked ? [] : f.branchIds }))}
                    />
                    All Branches
                  </label>
                </div>
                <p className="text-[11px] text-neutral-400">Rider-role WhatsApp messages go to the phone number above, so keep it current.</p>
                <div className={`mt-1.5 flex flex-wrap gap-2 ${form.allBranchesAccess ? "pointer-events-none opacity-40" : ""}`}>
                  {branches?.map((b) => (
                    <button type="button" key={b.id} disabled={form.allBranchesAccess} onClick={() => toggleBranch(b.id)} className={`rounded-full border px-3 py-1 text-xs ${form.branchIds.includes(b.id) ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-neutral-300"}`}>
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="col-span-2 flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-neutral-300 py-2 text-sm font-medium">Cancel</button>
            <button disabled={saving} className="flex-1 rounded-lg bg-brand-red py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Saving..." : mode === "create" ? "Create Staff Member" : "Save Changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function StaffPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: me } = useMe();
  const canCreate = hasPermission(me, "staff.create");
  const canEdit = hasPermission(me, "staff.edit");
  const canDelete = hasPermission(me, "staff.delete");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ACTIVE" | "INACTIVE">("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  const { data: staffList } = useQuery({
    queryKey: ["staff-list", search, roleFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (roleFilter) params.set("roleId", roleFilter);
      if (statusFilter) params.set("status", statusFilter);
      const qs = params.toString();
      return api.get<StaffMember[]>(`/staff${qs ? `?${qs}` : ""}`);
    },
  });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => api.get<Role[]>("/staff/roles") });
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => api.get<Branch[]>("/branches") });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["staff-list"] });
  }

  // A brand-new staff member starts with zero permissions (no role default to fall back on) —
  // send Owner straight to the Permissions accordion for the person they just created, since
  // that's the necessary next step, not just a nice-to-have.
  async function handleSaved(newStaffId?: string) {
    await refresh();
    if (newStaffId) router.push(`/staff/${newStaffId}`);
  }

  function openCreate() {
    setEditingStaff(null);
    setFormOpen(true);
  }

  function openEdit(s: StaffMember) {
    setEditingStaff(s);
    setFormOpen(true);
  }

  async function toggleStatus(s: StaffMember) {
    try {
      await api.patch(`/staff/${s.id}`, { status: s.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update status");
    }
  }

  async function removeStaff(s: StaffMember) {
    if (!confirm(`Delete ${s.name}? This only works if they have no order/activity history; otherwise deactivate them instead.`)) return;
    try {
      await api.delete(`/staff/${s.id}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete staff member");
    }
  }

  if (me && !hasPermission(me, "staff.view")) {
    return <p className="text-neutral-500">You don&apos;t have access to staff management.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Staff &amp; Access Management</h1>
        {canCreate && (
          <button onClick={openCreate} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">+ New Staff</button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input placeholder="Search name, email, phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="input w-64" />
        <Select value={roleFilter || "all"} onValueChange={(v) => setRoleFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roles?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : (v as "ACTIVE" | "INACTIVE"))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Phone / WhatsApp</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Branches</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {staffList?.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2 font-medium">{s.name}</td>
                <td className="px-4 py-2">{s.email}</td>
                <td className="px-4 py-2">{s.phone ?? "—"}</td>
                <td className="px-4 py-2">{s.role.name}</td>
                <td className="px-4 py-2 text-xs">
                  {s.allBranchesAccess ? "All Branches" : s.branchAssignments.map((a) => a.branch.code).join(", ") || "No branches"}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => toggleStatus(s)}
                    disabled={!canEdit}
                    aria-label={s.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    title={s.status === "ACTIVE" ? "Active: click to deactivate" : "Inactive: click to activate"}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${s.status === "ACTIVE" ? "bg-green-500" : "bg-neutral-300"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${s.status === "ACTIVE" ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <Link href={`/staff/${s.id}`} className="text-xs font-medium text-neutral-400 hover:text-brand-red">Manage Access</Link>
                    )}
                    {canEdit && (
                      <button onClick={() => openEdit(s)} aria-label="Edit" className="text-neutral-400 hover:text-brand-red"><EditIcon size={14} /></button>
                    )}
                    {canDelete && (
                      <button onClick={() => removeStaff(s)} aria-label="Delete" className="text-neutral-400 hover:text-red-600"><TrashIcon size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {staffList?.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-neutral-400">No staff members match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <StaffFormModal
          mode={editingStaff ? "edit" : "create"}
          initial={editingStaff}
          roles={roles}
          branches={branches}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}

      <style jsx global>{`.input { border-radius: 0.5rem; border: 1px solid #d4d4d4; padding: 0.5rem 0.75rem; font-size: 0.875rem; }`}</style>
    </div>
  );
}
