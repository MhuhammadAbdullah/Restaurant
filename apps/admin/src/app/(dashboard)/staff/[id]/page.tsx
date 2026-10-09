"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../../lib/api";
import { toast } from "../../../../store/useToastStore";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { Avatar, timeAgo, randomPassword } from "../../../../lib/staffUi";
import { StatusToggle } from "../../../../components/StatusToggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";

type StaffDetail = {
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
type EffectivePermission = { key: string; module: string; action: string; description: string; granted: boolean };

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** One-click starting points. They only stage changes; nothing is saved until "Save changes". */
const PRESETS: { id: string; label: string; hint: string; allows: (key: string) => boolean }[] = [
  { id: "cashier", label: "Cashier", hint: "POS, orders, customers", allows: (k) => ["pos.access", "pos.discount", "orders.view", "orders.create", "orders.edit", "customers.view", "customers.create", "tables.view", "riders.view"].includes(k) },
  { id: "kitchen", label: "Kitchen", hint: "Kitchen board only", allows: (k) => ["kitchen.access", "kitchen.updateStatus", "orders.view"].includes(k) },
  { id: "rider", label: "Rider", hint: "Delivery updates", allows: (k) => ["orders.view", "orders.updateDeliveryStatus"].includes(k) },
  { id: "manager", label: "Manager", hint: "Everything except staff & settings", allows: (k) => !/^(staff|roles|permissions|settings|cms)\./.test(k) },
  { id: "readonly", label: "View only", hint: "Can look, can't change", allows: (k) => k.endsWith(".view") },
  { id: "all", label: "Full access", hint: "Every permission", allows: () => true },
  { id: "none", label: "No access", hint: "Remove everything", allows: () => false },
];

function PermissionRow({ perm, staged, disabled, onChange }: { perm: EffectivePermission; staged: boolean | undefined; disabled: boolean; onChange: (granted: boolean) => void }) {
  const value = staged !== undefined ? staged : perm.granted;
  const changed = staged !== undefined && staged !== perm.granted;
  return (
    <label className={`flex items-center justify-between gap-3 rounded-lg px-2 py-2 ${disabled ? "" : "cursor-pointer hover:bg-neutral-50"} ${changed ? "bg-amber-50/60" : ""}`}>
      <div className="min-w-0">
        <p className="truncate text-sm text-neutral-800">{perm.description}</p>
        <p className="font-mono text-[10px] text-neutral-400">{perm.key}{changed ? " · changed" : ""}</p>
      </div>
      <StatusToggle active={value} onClick={() => !disabled && onChange(!value)} disabled={disabled} onLabel="Allowed" offLabel="Denied" />
    </label>
  );
}

export default function StaffAccessPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const staffId = params.id;
  const { data: me } = useMe();
  const canManagePermissions = hasPermission(me, "permissions.manage");
  const canEditStaff = hasPermission(me, "staff.edit");

  const [openModules, setOpenModules] = useState<Set<string>>(new Set());
  const [staged, setStaged] = useState<Record<string, boolean>>({});
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [permSearch, setPermSearch] = useState("");
  const [pwOpen, setPwOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const { data: staff } = useQuery({ queryKey: ["staff-detail", staffId], queryFn: () => api.get<StaffDetail>(`/staff/${staffId}`) });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => api.get<Role[]>("/staff/roles") });
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => api.get<Branch[]>("/branches") });
  const { data: permissions } = useQuery({
    queryKey: ["staff-permissions", staffId],
    queryFn: () => api.get<EffectivePermission[]>(`/staff/${staffId}/permissions`),
  });

  // Discard any staged-but-unsaved edits whenever the underlying permission set is refetched.
  useEffect(() => setStaged({}), [staffId, permissions]);

  const isMe = me?.id === staffId;
  const perms = permissions ?? [];
  const valueOf = (p: EffectivePermission) => (staged[p.key] !== undefined ? staged[p.key]! : p.granted);

  const grouped = useMemo(() => {
    const q = permSearch.trim().toLowerCase();
    return perms
      .filter((p) => !q || `${p.description} ${p.key} ${p.module}`.toLowerCase().includes(q))
      .reduce<Record<string, EffectivePermission[]>>((acc, p) => {
        (acc[p.module] ??= []).push(p);
        return acc;
      }, {});
  }, [perms, permSearch]);

  const allowedCount = perms.filter(valueOf).length;
  // Only keys that actually differ from what's saved count as changes.
  const dirtyKeys = Object.keys(staged).filter((k) => perms.find((p) => p.key === k)?.granted !== staged[k]);

  function toggleModule(module: string) {
    setOpenModules((s) => {
      const next = new Set(s);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  }
  const setOne = (key: string, granted: boolean) => setStaged((s) => ({ ...s, [key]: granted }));
  function setCategory(module: string, granted: boolean) {
    const keys = perms.filter((p) => p.module === module).map((p) => p.key);
    setStaged((s) => {
      const next = { ...s };
      for (const key of keys) next[key] = granted;
      return next;
    });
  }
  function applyPreset(allows: (key: string) => boolean) {
    const next: Record<string, boolean> = {};
    for (const p of perms) next[p.key] = allows(p.key);
    setStaged(next);
  }

  async function savePermissions() {
    if (dirtyKeys.length === 0) return;
    setSavingPermissions(true);
    try {
      await api.patch(`/staff/${staffId}/permissions`, { overrides: dirtyKeys.map((key) => ({ key, granted: staged[key] })) });
      await queryClient.invalidateQueries({ queryKey: ["staff-permissions", staffId] });
      toast.success("Permissions updated");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update permissions");
    } finally {
      setSavingPermissions(false);
    }
  }

  async function updateBasics(patch: Record<string, unknown>) {
    try {
      await api.patch(`/staff/${staffId}`, patch);
      await queryClient.invalidateQueries({ queryKey: ["staff-detail", staffId] });
      await queryClient.invalidateQueries({ queryKey: ["staff-list"] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update staff member");
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters");
    setPwSaving(true);
    try {
      await api.patch(`/staff/${staffId}`, { password: newPassword });
      toast.success("Password reset. They have been signed out and must use the new password.");
      setNewPassword("");
      setPwOpen(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not reset password");
    } finally {
      setPwSaving(false);
    }
  }

  if (me && !hasPermission(me, "staff.view")) {
    return <p className="text-neutral-500">You don&apos;t have access to staff management.</p>;
  }

  return (
    <div className="pb-20">
      <button onClick={() => router.push("/staff")} className="text-xs font-medium text-neutral-400 hover:text-brand-red">← Back to Staff</button>

      {staff && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-4">
            <Avatar name={staff.name} size="h-14 w-14" />
            <div>
              <h1 className="flex items-center gap-2 text-xl font-semibold text-neutral-900">
                {staff.name}
                {isMe && <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">You</span>}
              </h1>
              <p className="text-sm text-neutral-500">{staff.email}{staff.phone ? ` · ${staff.phone}` : ""}</p>
              <p className="mt-1 text-xs text-neutral-400">
                Last sign-in: <span className={staff.lastLoginAt ? "text-neutral-600" : "text-amber-700"}>{timeAgo(staff.lastLoginAt)}</span> · Added {new Date(staff.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${staff.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>{staff.status === "ACTIVE" ? "Active" : "Inactive"}</span>
            <StatusToggle active={staff.status === "ACTIVE"} onClick={() => updateBasics({ status: staff.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })} disabled={!canEditStaff || isMe} onLabel="Active: click to deactivate" offLabel="Inactive: click to activate" />
          </div>
        </div>
      )}

      {staff && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-red text-xs font-semibold text-white">1</span>
              <div>
                <p className="text-sm font-semibold text-neutral-900">Role</p>
                <p className="text-xs text-neutral-500">Their job title. Permissions are set separately below.</p>
              </div>
            </div>
            <Select value={staff.role.id} disabled={!canEditStaff || isMe} onValueChange={(v) => updateBasics({ roleId: v })}>
              <SelectTrigger className="mt-3 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canEditStaff && (
              <div className="mt-4 border-t border-neutral-100 pt-4">
                {!pwOpen ? (
                  <button type="button" onClick={() => setPwOpen(true)} className="text-sm font-medium text-brand-red hover:underline">Reset password</button>
                ) : (
                  <form onSubmit={resetPassword} className="space-y-2">
                    <p className="text-xs font-medium text-neutral-500">New password</p>
                    <div className="flex gap-2">
                      <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" className="input min-w-0 flex-1 font-mono" autoComplete="new-password" />
                      <button type="button" onClick={() => setNewPassword(randomPassword())} className="shrink-0 rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50">Generate</button>
                    </div>
                    <p className="text-xs text-neutral-400">They will be signed out everywhere. Share the new password with them securely.</p>
                    <div className="flex gap-2">
                      <button disabled={pwSaving || newPassword.length < 8} className="rounded-lg bg-brand-red px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{pwSaving ? "Saving..." : "Set new password"}</button>
                      <button type="button" onClick={() => { setPwOpen(false); setNewPassword(""); }} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium">Cancel</button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-red text-xs font-semibold text-white">2</span>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Branch access</p>
                  <p className="text-xs text-neutral-500">Which branches&apos; data they can see and work on.</p>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-neutral-700">
                <input
                  type="checkbox"
                  disabled={!canEditStaff}
                  checked={staff.allBranchesAccess}
                  onChange={(e) => updateBasics(e.target.checked ? { allBranchesAccess: true } : { allBranchesAccess: false, branchIds: [] })}
                  className="accent-[#ED2320]"
                />
                All branches
              </label>
            </div>
            <div className={`mt-3 flex flex-wrap gap-2 ${staff.allBranchesAccess ? "pointer-events-none opacity-40" : ""}`}>
              {branches?.map((b) => {
                const active = staff.branchAssignments.some((a) => a.branch.id === b.id);
                return (
                  <button
                    key={b.id}
                    disabled={!canEditStaff || staff.allBranchesAccess}
                    onClick={() => {
                      const ids = staff.branchAssignments.map((a) => a.branch.id);
                      updateBasics({ branchIds: active ? ids.filter((id) => id !== b.id) : [...ids, b.id] });
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${active ? "border-brand-red bg-red-50 text-brand-red" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
            {!staff.allBranchesAccess && staff.branchAssignments.length === 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">No branch selected, so this person can&apos;t see any orders or data. Pick at least one branch.</p>
            )}
            <p className="mt-3 text-xs text-neutral-400">Saves instantly. Changing role or branches signs them out so the change applies on their next login.</p>
          </section>
        </div>
      )}

      <section className="mt-4 rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-red text-xs font-semibold text-white">3</span>
            <div>
              <p className="text-sm font-semibold text-neutral-900">Permissions</p>
              <p className="text-xs text-neutral-500">{permissions ? `${allowedCount} of ${perms.length} allowed` : "Loading..."}. Turn on only what this person needs.</p>
            </div>
          </div>
          <input value={permSearch} onChange={(e) => setPermSearch(e.target.value)} placeholder="Search permissions..." className="input w-full sm:w-60" />
        </div>

        {canManagePermissions && permissions && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-neutral-500">Quick start: apply a ready-made set, then fine-tune below</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((pr) => (
                <button key={pr.id} type="button" onClick={() => applyPreset(pr.allows)} title={pr.hint} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-left text-xs hover:border-brand-red hover:bg-red-50">
                  <span className="block font-semibold text-neutral-800">{pr.label}</span>
                  <span className="block text-[10px] text-neutral-400">{pr.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!canManagePermissions && permissions && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">You can view permissions but not change them.</p>}

        <div className="mt-4 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {Object.entries(grouped).map(([module, list]) => {
            const open = openModules.has(module) || permSearch.trim() !== "";
            const total = perms.filter((p) => p.module === module);
            const on = total.filter(valueOf).length;
            return (
              <div key={module}>
                <button type="button" onClick={() => toggleModule(module)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-neutral-50">
                  <span className="flex items-center gap-3">
                    <span className="text-sm font-semibold capitalize text-neutral-800">{module}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${on === 0 ? "bg-neutral-100 text-neutral-400" : on === total.length ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>{on}/{total.length}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {canManagePermissions && (
                      <span className="flex gap-1 text-[11px]" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => setCategory(module, true)} className="rounded-full border border-neutral-200 px-2 py-0.5 text-green-700 hover:bg-green-50">Allow all</button>
                        <button type="button" onClick={() => setCategory(module, false)} className="rounded-full border border-neutral-200 px-2 py-0.5 text-red-700 hover:bg-red-50">Deny all</button>
                      </span>
                    )}
                    <ChevronIcon open={open} />
                  </span>
                </button>
                {open && (
                  <div className="space-y-0.5 border-t border-neutral-100 bg-neutral-50/40 px-3 py-2">
                    {list.map((p) => (
                      <PermissionRow key={p.key} perm={p} staged={staged[p.key]} disabled={!canManagePermissions} onChange={(g) => setOne(p.key, g)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {permissions === undefined && <p className="py-6 text-center text-sm text-neutral-400">Loading permissions...</p>}
          {permissions && Object.keys(grouped).length === 0 && <p className="py-6 text-center text-sm text-neutral-400">No permissions match “{permSearch}”.</p>}
        </div>
      </section>

      {dirtyKeys.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur sm:px-6 lg:left-64">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <button onClick={savePermissions} disabled={savingPermissions || !canManagePermissions} className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {savingPermissions ? "Saving..." : `Save ${dirtyKeys.length} change${dirtyKeys.length === 1 ? "" : "s"}`}
            </button>
            <button onClick={() => setStaged({})} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Discard</button>
            <span className="text-xs font-medium text-amber-600">You have unsaved permission changes</span>
          </div>
        </div>
      )}

      <style jsx global>{`.input { border-radius: 0.5rem; border: 1px solid #d4d4d4; padding: 0.5rem 0.75rem; font-size: 0.875rem; }`}</style>
    </div>
  );
}
