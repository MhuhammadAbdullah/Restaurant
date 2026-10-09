"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../lib/api";
import { toast } from "../../../store/useToastStore";
import { useMe, hasPermission } from "../../../lib/useMe";
import { SearchInput } from "../../../components/SearchFilterBar";
import { StatusToggle } from "../../../components/StatusToggle";
import { CloseIcon, EditIcon, TrashIcon } from "../../../components/icons";
import { Avatar, timeAgo, randomPassword } from "../../../lib/staffUi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

type StaffMember = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: "ACTIVE" | "INACTIVE";
  allBranchesAccess: boolean;
  lastLoginAt: string | null;
  createdAt: string;
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

function passwordStrength(p: string): { label: string; color: string; width: string } {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (score <= 2) return { label: "Weak", color: "bg-red-500", width: "w-1/3" };
  if (score <= 3) return { label: "OK", color: "bg-amber-500", width: "w-2/3" };
  return { label: "Strong", color: "bg-green-500", width: "w-full" };
}

function SectionTitle({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-red text-xs font-semibold text-white">{n}</span>
      <div>
        <p className="text-sm font-semibold text-neutral-900">{title}</p>
        <p className="text-xs text-neutral-500">{hint}</p>
      </div>
    </div>
  );
}

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
      ? { name: initial.name, email: initial.email, phone: initial.phone ?? "", password: "", roleId: initial.role.id, branchIds: initial.branchAssignments.map((a) => a.branch.id), allBranchesAccess: initial.allBranchesAccess }
      : EMPTY_FORM,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof StaffFormState>(key: K, value: StaffFormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  function toggleBranch(id: string) {
    setForm((f) => ({ ...f, branchIds: f.branchIds.includes(id) ? f.branchIds.filter((x) => x !== id) : [...f.branchIds, id] }));
  }

  const emailBad = form.email.trim() !== "" && !/^\S+@\S+\.\S+$/.test(form.email.trim());
  const pwBad = form.password !== "" && form.password.length < 8;
  const noBranch = mode === "create" && !form.allBranchesAccess && form.branchIds.length === 0;
  const strength = passwordStrength(form.password);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (emailBad) return toast.error("Enter a valid email address");
    if (mode === "create") {
      if (!form.roleId) return toast.error("Please select a role");
      if (form.password.length < 8) return toast.error("Password must be at least 8 characters");
    } else if (pwBad) {
      return toast.error("New password must be at least 8 characters");
    }
    setSaving(true);
    try {
      if (mode === "create") {
        const created = await api.post<{ id: string }>("/staff", { ...form, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined });
        toast.success("Staff member created. Now choose what they can access.");
        onSaved(created.id);
      } else if (initial) {
        // Role, branch access and permissions are managed from the "Manage access" page; this modal edits contact details and (optionally) resets the password.
        await api.patch(`/staff/${initial.id}`, {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          ...(form.password ? { password: form.password } : {}),
        });
        toast.success(form.password ? "Staff member updated and password reset. They must sign in again." : "Staff member updated.");
        onSaved();
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save staff member");
    } finally {
      setSaving(false);
    }
  }

  const PasswordField = (
    <div>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            type={showPassword ? "text" : "password"}
            placeholder={mode === "create" ? "At least 8 characters" : "Leave empty to keep the current password"}
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            className={`input w-full pr-14 ${pwBad ? "!border-red-400" : ""}`}
            autoComplete="new-password"
            required={mode === "create"}
          />
          <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-500 hover:text-neutral-800">
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            set("password", randomPassword());
            setShowPassword(true);
          }}
          className="shrink-0 rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Generate
        </button>
      </div>
      {form.password && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100"><div className={`h-full rounded-full ${strength.color} ${strength.width}`} /></div>
          <span className="text-[11px] font-medium text-neutral-500">{strength.label}</span>
        </div>
      )}
      {pwBad && <p className="mt-1 text-xs text-red-600">Use at least 8 characters</p>}
      {mode === "create" && <p className="mt-1 text-xs text-neutral-400">Share this password with them securely. They can sign in right away.</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-5 py-4">
          <p className="text-base font-semibold text-neutral-900">{mode === "create" ? "New Staff Member" : `Edit ${initial?.name}`}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"><CloseIcon size={14} /></button>
        </div>

        <form onSubmit={submit} className="modal-scroll min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
            <SectionTitle n={1} title="Personal details" hint="Who this person is." />
            <div>
              <p className="mb-1 text-xs font-medium text-neutral-500">Full name *</p>
              <input placeholder="e.g. Ali Khan" value={form.name} onChange={(e) => set("name", e.target.value)} className="input w-full" required />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Email *</p>
                <input type="email" placeholder="name@restaurant.com" value={form.email} onChange={(e) => set("email", e.target.value)} className={`input w-full ${emailBad ? "!border-red-400" : ""}`} required />
                {emailBad && <p className="mt-1 text-xs text-red-600">Enter a valid email address</p>}
                {!emailBad && <p className="mt-1 text-xs text-neutral-400">This is their login.</p>}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Phone / WhatsApp</p>
                <input type="tel" placeholder="+92 300 1234567" value={form.phone} onChange={(e) => set("phone", e.target.value)} className="input w-full" />
                <p className="mt-1 text-xs text-neutral-400">Riders get delivery alerts here.</p>
              </div>
            </div>
          </section>

          {mode === "create" && (
            <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
              <SectionTitle n={2} title="Role & branch access" hint="Their job title and which branches they can work in." />
              <div>
                <p className="mb-1 text-xs font-medium text-neutral-500">Role *</p>
                <Select value={form.roleId || undefined} onValueChange={(v) => set("roleId", v)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    {roles?.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-neutral-400">The role is a label. What they can actually do is set on the next screen.</p>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-medium text-neutral-500">Branches</p>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-neutral-700">
                    <input type="checkbox" checked={form.allBranchesAccess} onChange={(e) => setForm((f) => ({ ...f, allBranchesAccess: e.target.checked, branchIds: e.target.checked ? [] : f.branchIds }))} className="accent-[#ED2320]" />
                    All branches
                  </label>
                </div>
                <div className={`flex flex-wrap gap-2 ${form.allBranchesAccess ? "pointer-events-none opacity-40" : ""}`}>
                  {branches?.map((b) => (
                    <button type="button" key={b.id} disabled={form.allBranchesAccess} onClick={() => toggleBranch(b.id)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${form.branchIds.includes(b.id) ? "border-brand-red bg-red-50 text-brand-red" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}>
                      {b.name}
                    </button>
                  ))}
                </div>
                {noBranch && <p className="mt-1.5 text-xs text-amber-700">Pick at least one branch, or choose All branches, otherwise they won&apos;t see any data.</p>}
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
            <SectionTitle n={mode === "create" ? 3 : 2} title={mode === "create" ? "Login password" : "Reset password (optional)"} hint={mode === "create" ? "They sign in with their email and this password." : "Only fill this in to set a new password. They will be signed out everywhere."} />
            {PasswordField}
          </section>

          <div className="sticky bottom-[-1.25rem] z-10 -mx-5 -mb-5 flex items-center gap-3 border-t border-neutral-200 bg-white px-5 py-3">
            <button disabled={saving} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {saving ? "Saving..." : mode === "create" ? "Create & set permissions" : "Save Changes"}
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100">Cancel</button>
          </div>
        </form>
      </div>
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
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  // The full list is loaded once; filtering happens in the browser so the stat cards always show real totals.
  const { data: staffList } = useQuery({ queryKey: ["staff-list", "all"], queryFn: () => api.get<StaffMember[]>("/staff") });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => api.get<Role[]>("/staff/roles") });
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => api.get<Branch[]>("/branches") });

  const all = staffList ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((s) => {
      if (q && !`${s.name} ${s.email} ${s.phone ?? ""}`.toLowerCase().includes(q)) return false;
      if (roleFilter && s.role.id !== roleFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      return true;
    });
  }, [all, search, roleFilter, statusFilter]);
  const isFiltering = search.trim() !== "" || roleFilter !== "" || statusFilter !== "";

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["staff-list"] });
  }

  // A brand-new staff member starts with zero permissions, so send the admin straight to their access page.
  async function handleSaved(newStaffId?: string) {
    await refresh();
    if (newStaffId) router.push(`/staff/${newStaffId}`);
  }

  async function toggleStatus(s: StaffMember) {
    try {
      await api.patch(`/staff/${s.id}`, { status: s.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update status");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/staff/${deleteTarget.id}`);
      await refresh();
      toast.success(`${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete staff member");
    } finally {
      setDeleting(false);
    }
  }

  if (me && !hasPermission(me, "staff.view")) {
    return <p className="text-neutral-500">You don&apos;t have access to staff management.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Staff &amp; Access Management</h1>
          <p className="mt-1 text-sm text-neutral-500">Add team members, choose which branches they work in, and control exactly what each person can do.</p>
        </div>
        {canCreate && (
          <button onClick={() => { setEditingStaff(null); setFormOpen(true); }} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white">+ New Staff</button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Team members", all.length],
          ["Active", all.filter((s) => s.status === "ACTIVE").length],
          ["Inactive", all.filter((s) => s.status === "INACTIVE").length],
          ["Never signed in", all.filter((s) => !s.lastLoginAt).length],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
            <p className="text-xs text-neutral-500">{label}</p>
            <p className="text-xl font-semibold text-neutral-900">{n}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, email, phone..." />
        <Select value={roleFilter || "all"} onValueChange={(v) => setRoleFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roles?.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
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
        {isFiltering && (
          <button onClick={() => { setSearch(""); setRoleFilter(""); setStatusFilter(""); }} className="text-sm font-medium text-brand-red hover:underline">Clear filters</button>
        )}
        <span className="ml-auto text-xs text-neutral-400">{filtered.length} of {all.length} shown</span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2.5">Team member</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Branches</th>
              <th className="px-4 py-2.5">Last sign-in</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((s) => {
              const isMe = me?.id === s.id;
              return (
                <tr key={s.id} className={s.status === "INACTIVE" ? "bg-neutral-50/60" : undefined}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={s.name} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium text-neutral-900">
                          <span className="truncate">{s.name}</span>
                          {isMe && <span className="rounded-full bg-neutral-900 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">You</span>}
                        </p>
                        <p className="truncate text-xs text-neutral-500">{s.email}</p>
                        {s.phone && <p className="text-xs text-neutral-400">{s.phone}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">{s.role.name}</span></td>
                  <td className="px-4 py-3">
                    {s.allBranchesAccess ? (
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">All branches</span>
                    ) : s.branchAssignments.length === 0 ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">No branches</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {s.branchAssignments.slice(0, 3).map((a) => (
                          <span key={a.branch.id} title={a.branch.name} className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-neutral-600">{a.branch.code}</span>
                        ))}
                        {s.branchAssignments.length > 3 && <span className="text-[11px] text-neutral-400">+{s.branchAssignments.length - 3}</span>}
                      </div>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-xs ${s.lastLoginAt ? "text-neutral-600" : "text-amber-700"}`} title={s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString() : ""}>{timeAgo(s.lastLoginAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusToggle active={s.status === "ACTIVE"} onClick={() => toggleStatus(s)} disabled={!canEdit || isMe} />
                      <span className={`text-xs ${s.status === "ACTIVE" ? "text-green-700" : "text-neutral-400"}`}>{s.status === "ACTIVE" ? "Active" : "Inactive"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      {canEdit && (
                        <Link href={`/staff/${s.id}`} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-brand-red hover:bg-red-100">Manage access</Link>
                      )}
                      {canEdit && (
                        <button onClick={() => { setEditingStaff(s); setFormOpen(true); }} aria-label="Edit" className="text-neutral-400 hover:text-brand-red"><EditIcon size={15} /></button>
                      )}
                      {canDelete && !isMe && (
                        <button onClick={() => setDeleteTarget(s)} aria-label="Delete" className="text-neutral-400 hover:text-red-600"><TrashIcon size={15} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {staffList && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">{all.length === 0 ? "No staff yet. Add your first team member." : "No staff members match these filters."}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <StaffFormModal mode={editingStaff ? "edit" : "create"} initial={editingStaff} roles={roles} branches={branches} onClose={() => setFormOpen(false)} onSaved={handleSaved} />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <p className="text-base font-semibold text-neutral-900">Delete {deleteTarget.name}</p>
              <button type="button" onClick={() => setDeleteTarget(null)} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-red text-white hover:opacity-90"><CloseIcon size={14} /></button>
            </div>
            <div className="p-5">
              <p className="text-sm text-neutral-600">
                This only works if they have no order or activity history. If they do, <b>deactivate</b> them instead. That blocks sign-in but keeps their history. Deleting cannot be undone.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <button type="button" onClick={confirmDelete} disabled={deleting} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">{deleting ? "Deleting..." : "Delete"}</button>
                <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-brand-red bg-red-50 px-4 py-2 text-sm font-medium text-brand-red hover:bg-red-100">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`.input { border-radius: 0.5rem; border: 1px solid #d4d4d4; padding: 0.5rem 0.75rem; font-size: 0.875rem; }`}</style>
    </div>
  );
}
