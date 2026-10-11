"use client";

import { SearchInput } from "../../../../components/SearchFilterBar";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../../lib/api";
import { toast } from "../../../../store/useToastStore";
import { confirmDialog } from "../../../../store/useConfirmStore";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { Avatar, timeAgo, randomPassword } from "../../../../lib/staffUi";
import { StatusToggle } from "../../../../components/StatusToggle";
import { BranchAccessPicker } from "../../../../components/BranchAccessPicker";
import { NAV_GROUPS } from "../../../../components/Sidebar";
import { PERMISSION_SECTIONS } from "../../../../lib/permissionLayout";
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
  { id: "cashier", label: "Cashier", hint: "POS, receipts, tables and customers", allows: (k) => ["pos.access", "pos.discount", "orders.view", "orders.create", "customers.view", "customers.create", "tables.view"].includes(k) },
  { id: "kitchen", label: "Kitchen", hint: "Kitchen board and ticket printing", allows: (k) => ["kitchen.access", "kitchen.updateStatus"].includes(k) },
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

  // The list shown on screen: same sections and page names as the sidebar, built from whatever the search left in `grouped`.
  const sectionsView = useMemo(() => {
    const shown = Object.values(grouped).flat();
    const used = new Set<string>();
    const sections = PERMISSION_SECTIONS.map((sec) => ({
      label: sec.label,
      items: sec.items
        .map((it) => {
          it.modules.forEach((m) => used.add(m));
          return { ...it, list: shown.filter((x) => it.modules.includes(x.module)), all: perms.filter((x) => it.modules.includes(x.module)) };
        })
        .filter((it) => it.list.length > 0),
    })).filter((sec) => sec.items.length > 0);
    // anything the layout does not know about yet still gets a row, so no permission can be hidden
    const otherModules = Array.from(new Set(perms.map((x) => x.module))).filter((m) => !used.has(m));
    const other = otherModules
      .map((m) => ({ id: m, label: m.charAt(0).toUpperCase() + m.slice(1), modules: [m], covers: undefined as string | undefined, list: shown.filter((x) => x.module === m), all: perms.filter((x) => x.module === m) }))
      .filter((it) => it.list.length > 0);
    return other.length > 0 ? [...sections, { label: "Other", items: other }] : sections;
  }, [grouped, perms]);

  // A ready-made set counts as "active" when it describes exactly what this person has right now (saved plus unsaved changes).
  const activePresetId = perms.length > 0 ? PRESETS.find((pr) => perms.every((x) => valueOf(x) === pr.allows(x.key)))?.id ?? null : null;

  const allowedCount = perms.filter(valueOf).length;

  // What this person will actually be able to open, and obvious gaps (e.g. "Refund orders" but not "View orders").
  const allowedKeys = new Set(perms.filter(valueOf).map((p) => p.key));
  const isOwnerRole = staff?.role.name === "Owner";
  const openablePages = NAV_GROUPS.flatMap((g) => g.items).filter((i) => !i.permission || allowedKeys.has(i.permission));
  const allKeys = new Set(perms.map((p) => p.key));
  const missingView = Array.from(
    new Set(
      perms
        .filter((p) => valueOf(p) && p.action !== "view" && allKeys.has(`${p.module}.view`) && !allowedKeys.has(`${p.module}.view`))
        .map((p) => p.module),
    ),
  );
  // Only keys that actually differ from what's saved count as changes.
  const dirtyKeys = Object.keys(staged).filter((k) => perms.find((p) => p.key === k)?.granted !== staged[k]);

  const changeSummary = {
    allowed: dirtyKeys.filter((k) => staged[k]).length,
    denied: dirtyKeys.filter((k) => !staged[k]).length,
  };

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
  function setMany(keys: string[], granted: boolean) {
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

  async function updateBasics(patch: Record<string, unknown>): Promise<boolean> {
    try {
      await api.patch(`/staff/${staffId}`, patch);
      await queryClient.invalidateQueries({ queryKey: ["staff-detail", staffId] });
      await queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not update staff member");
      return false;
    }
  }

  // Anyone with "Edit staff" can change any role. The only block is the Owner changing their own (the API refuses it).
  const roleLockReason = !canEditStaff ? "You need the “Edit staff” permission to change roles." : isMe && me?.isOwner ? "The Owner's own role can't be changed." : null;
  async function changeRole(roleId: string) {
    if (!staff || roleId === staff.role.id) return;
    const next = roles?.find((r) => r.id === roleId)?.name ?? "this role";
    const who = isMe ? "your own role" : `${staff.name}'s role`;
    if (!(await confirmDialog({ title: "Change role?", message: `Change ${who} from ${staff.role.name} to ${next}? ${isMe ? "You" : "They"} will be signed out and must log in again for it to apply.`, confirmLabel: "Change role", tone: "warning" }))) return;
    if (await updateBasics({ roleId })) toast.success(`Role changed to ${next}.`);
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
    <div>
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
            <Select value={staff.role.id} disabled={!!roleLockReason} onValueChange={changeRole}>
              <SelectTrigger className="mt-3 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {roleLockReason ? (
              <p className="mt-2 text-xs text-amber-700">{roleLockReason}</p>
            ) : (
              <p className="mt-2 text-xs text-neutral-400">Changing the role signs {isMe ? "you" : "them"} out so it applies on the next login.</p>
            )}
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
            </div>
            <div className="mt-3">
              <BranchAccessPicker
                branches={branches ?? []}
                allBranches={staff.allBranchesAccess}
                selectedIds={staff.branchAssignments.map((x) => x.branch.id)}
                disabled={!canEditStaff}
                onSave={(next) => updateBasics(next)}
              />
            </div>
            {!staff.allBranchesAccess && staff.branchAssignments.length === 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">No branch selected, so this person can&apos;t see any orders or data. Pick at least one branch.</p>
            )}
            <p className="mt-3 text-xs text-neutral-400">Saves when you close the dropdown. Changing role or branches signs them out so the change applies on their next login.</p>
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
          <SearchInput value={permSearch} onChange={setPermSearch} placeholder="Search permissions..." widthClass="w-full sm:w-64" />
        </div>

        {permissions && !isOwnerRole && (
          <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">With these permissions, {staff?.name.split(" ")[0] ?? "this person"} can open</p>
            {openablePages.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-400">No pages yet. Pick a ready-made set below, or turn permissions on.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {openablePages.map((i) => {
                  const Icon = i.icon;
                  return (
                    <span key={i.href} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700">
                      <Icon size={11} className="text-brand-red" /> {i.label}
                    </span>
                  );
                })}
              </div>
            )}
            {missingView.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span>
                  Some actions are on without the matching <b>View</b> permission ({missingView.join(", ")}), so the page may open empty.
                </span>
                {canManagePermissions && (
                  <button type="button" onClick={() => setMany(missingView.map((m) => `${m}.view`), true)} className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 font-semibold hover:bg-amber-100">
                    Allow View for these
                  </button>
                )}
              </div>
            )}
            <p className="mt-3 text-[11px] text-neutral-400">Kitchen staff can print kitchen tickets and cashiers can print receipts with just their own permission, no &ldquo;View orders&rdquo; needed.</p>
          </div>
        )}

        {canManagePermissions && permissions && (
          <div className="mt-4">
            <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-neutral-500">
              Quick start: apply a ready-made set, then fine-tune below
              {!activePresetId && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Custom set</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((pr) => {
                const active = activePresetId === pr.id;
                return (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => applyPreset(pr.allows)}
                    title={pr.hint}
                    aria-pressed={active}
                    className={`relative rounded-lg border px-3 py-1.5 text-left text-xs transition ${active ? "border-brand-red bg-red-50 ring-1 ring-brand-red" : "border-neutral-300 hover:border-brand-red hover:bg-red-50"}`}
                  >
                    <span className={`block font-semibold ${active ? "text-brand-red" : "text-neutral-800"}`}>{pr.label}</span>
                    <span className={`block text-[10px] ${active ? "text-brand-red/70" : "text-neutral-400"}`}>{pr.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!canManagePermissions && permissions && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">You can view permissions but not change them.</p>}

        {canManagePermissions && permissions && Object.keys(grouped).length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-50 px-4 py-2.5">
            <span className="text-xs text-neutral-500">{permSearch.trim() ? "Applies to the permissions shown below" : "Applies to every permission"}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMany(Object.values(grouped).flat().map((x) => x.key), true)} className="rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50">Allow all</button>
              <button type="button" onClick={() => setMany(Object.values(grouped).flat().map((x) => x.key), false)} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">Deny all</button>
            </div>
          </div>
        )}

        <div className="mt-3 space-y-5">
          {sectionsView.map((sec) => (
            <div key={sec.label}>
              <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{sec.label}</p>
              <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                {sec.items.map((item) => {
                  const open = openModules.has(item.id) || permSearch.trim() !== "";
                  const total = item.all;
                  const on = total.filter(valueOf).length;
                  const keys = total.map((x) => x.key);
                  return (
                    <div key={item.id}>
                      <div className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-neutral-50">
                        <button type="button" onClick={() => toggleModule(item.id)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left">
                          <ChevronIcon open={open} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-neutral-800">{item.label}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${on === 0 ? "bg-neutral-100 text-neutral-400" : on === total.length ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>{on}/{total.length}</span>
                            </span>
                            {item.covers && <span className="mt-0.5 block text-[11px] leading-snug text-neutral-400">{item.covers}</span>}
                          </span>
                        </button>
                        {canManagePermissions && (
                          <div role="group" aria-label={`Set all ${item.label} permissions`} className="flex shrink-0 overflow-hidden rounded-lg border border-neutral-300 text-xs font-medium">
                            <button type="button" onClick={() => setMany(keys, true)} aria-pressed={on === total.length} className={`px-3 py-1.5 transition ${on === total.length ? "bg-green-600 text-white" : "bg-white text-green-700 hover:bg-green-50"}`}>
                              Allow all
                            </button>
                            <button type="button" onClick={() => setMany(keys, false)} aria-pressed={on === 0} className={`border-l border-neutral-300 px-3 py-1.5 transition ${on === 0 ? "bg-red-600 text-white" : "bg-white text-red-700 hover:bg-red-50"}`}>
                              Deny all
                            </button>
                          </div>
                        )}
                      </div>
                      {open && (
                        <div className="space-y-0.5 border-t border-neutral-100 bg-neutral-50/40 px-3 py-2">
                          {item.list.map((x) => (
                            <PermissionRow key={x.key} perm={x} staged={staged[x.key]} disabled={!canManagePermissions} onChange={(g) => setOne(x.key, g)} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {permissions === undefined && <p className="py-6 text-center text-sm text-neutral-400">Loading permissions...</p>}
          {permissions && Object.keys(grouped).length === 0 && <p className="py-6 text-center text-sm text-neutral-400">No permissions match “{permSearch}”.</p>}
        </div>
      </section>

      {dirtyKeys.length > 0 && (
        <div className="sticky bottom-3 z-30 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-xl ring-1 ring-black/5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700">{dirtyKeys.length}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900">Unsaved permission change{dirtyKeys.length === 1 ? "" : "s"}</p>
              <p className="text-xs text-neutral-500">
                {changeSummary.allowed > 0 && <span className="font-medium text-green-700">{changeSummary.allowed} will be allowed</span>}
                {changeSummary.allowed > 0 && changeSummary.denied > 0 && " · "}
                {changeSummary.denied > 0 && <span className="font-medium text-red-700">{changeSummary.denied} will be denied</span>}
                <span> · {staff ? `for ${staff.name}` : ""}</span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => setStaged({})} disabled={savingPermissions} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">Discard</button>
            <button onClick={savePermissions} disabled={savingPermissions || !canManagePermissions} className="rounded-lg bg-brand-red px-5 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50">
              {savingPermissions ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`.input { border-radius: 0.5rem; border: 1px solid #d4d4d4; padding: 0.5rem 0.75rem; font-size: 0.875rem; }`}</style>
    </div>
  );
}
