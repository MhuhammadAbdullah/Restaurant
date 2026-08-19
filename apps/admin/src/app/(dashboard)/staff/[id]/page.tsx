"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../../lib/api";
import { toast } from "../../../../store/useToastStore";
import { useMe, hasPermission } from "../../../../lib/useMe";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";

type StaffDetail = {
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
type EffectivePermission = {
  key: string;
  module: string;
  action: string;
  description: string;
  granted: boolean;
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** No role, no "inherited" state — a permission is either an explicit grant for this specific
 *  person (Allowed) or it isn't (Denied). Single toggle, nothing to fall back to. */
function PermissionRow({
  perm,
  staged,
  onChange,
}: {
  perm: EffectivePermission;
  staged: boolean | undefined;
  onChange: (granted: boolean) => void;
}) {
  const value = staged !== undefined ? staged : perm.granted;
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-neutral-800">{perm.description}</p>
        <p className="text-[11px] text-neutral-400">{value ? "Allowed" : "Denied"}</p>
      </div>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 shrink-0 accent-brand-red" />
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

  const { data: staff } = useQuery({ queryKey: ["staff-detail", staffId], queryFn: () => api.get<StaffDetail>(`/staff/${staffId}`) });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => api.get<Role[]>("/staff/roles") });
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => api.get<Branch[]>("/branches") });
  const { data: permissions } = useQuery({
    queryKey: ["staff-permissions", staffId],
    queryFn: () => api.get<EffectivePermission[]>(`/staff/${staffId}/permissions`),
  });

  // Discard any staged-but-unsaved edits whenever the underlying permission set is refetched
  // (e.g. after a successful save, or navigating to a different staff member).
  useEffect(() => setStaged({}), [staffId, permissions]);

  const grouped = (permissions ?? []).reduce<Record<string, EffectivePermission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  function toggleModule(module: string) {
    setOpenModules((s) => {
      const next = new Set(s);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  }

  function setOne(key: string, granted: boolean) {
    setStaged((s) => ({ ...s, [key]: granted }));
  }

  function setCategory(module: string, granted: boolean) {
    const keys = grouped[module]?.map((p) => p.key) ?? [];
    setStaged((s) => {
      const next = { ...s };
      for (const key of keys) next[key] = granted;
      return next;
    });
  }

  const dirtyKeys = Object.keys(staged);

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

  if (me && !hasPermission(me, "staff.view")) {
    return <p className="text-neutral-500">You don&apos;t have access to staff management.</p>;
  }

  return (
    <div>
      <button onClick={() => router.push("/staff")} className="text-xs font-medium text-neutral-400 hover:text-brand-red">← Back to Staff</button>

      {staff && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">{staff.name}</h1>
            <p className="mt-0.5 text-sm text-neutral-500">{staff.email} · {staff.role.name}</p>
          </div>
          <button
            onClick={() => updateBasics({ status: staff.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}
            disabled={!canEditStaff}
            className={`rounded-full px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${staff.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
          >
            {staff.status === "ACTIVE" ? "Active — click to deactivate" : "Inactive — click to activate"}
          </button>
        </div>
      )}

      {/* User Info */}
      {staff && (
        <div className="mt-5 rounded-xl border border-neutral-200 p-4">
          <p className="text-sm font-semibold text-neutral-900">User Info</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-neutral-400">Email</p><p>{staff.email}</p></div>
            <div><p className="text-xs text-neutral-400">Phone</p><p>{staff.phone ?? "—"}</p></div>
            <div className="col-span-2">
              <p className="text-xs text-neutral-400">Role</p>
              <Select value={staff.role.id} disabled={!canEditStaff} onValueChange={(v) => updateBasics({ roleId: v })}>
                <SelectTrigger className="mt-1 w-full sm:w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Branch Access */}
      {staff && (
        <div className="mt-4 rounded-xl border border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-900">Branch Access</p>
            <label className="flex items-center gap-1.5 text-xs text-neutral-600">
              <input
                type="checkbox"
                disabled={!canEditStaff}
                checked={staff.allBranchesAccess}
                onChange={(e) => updateBasics(e.target.checked ? { allBranchesAccess: true } : { allBranchesAccess: false, branchIds: [] })}
              />
              All Branches
            </label>
          </div>
          <div className={`mt-2 flex flex-wrap gap-2 ${staff.allBranchesAccess ? "pointer-events-none opacity-40" : ""}`}>
            {branches?.map((b) => {
              const active = staff.branchAssignments.some((a) => a.branch.id === b.id);
              return (
                <button
                  key={b.id}
                  disabled={!canEditStaff || staff.allBranchesAccess}
                  onClick={() => {
                    const ids = staff.branchAssignments.map((a) => a.branch.id);
                    const next = active ? ids.filter((id) => id !== b.id) : [...ids, b.id];
                    updateBasics({ branchIds: next });
                  }}
                  className={`rounded-full border px-3 py-1 text-xs ${active ? "border-brand-red bg-brand-red/10 text-brand-red" : "border-neutral-300"}`}
                >
                  {b.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Permissions accordion */}
      <div className="mt-4 rounded-xl border border-neutral-200 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-neutral-900">Permissions</p>
          {dirtyKeys.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-600">{dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? "" : "s"}</span>
              <button onClick={() => setStaged({})} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium">Discard</button>
              <button
                onClick={savePermissions}
                disabled={savingPermissions || !canManagePermissions}
                className="rounded-lg bg-brand-red px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {savingPermissions ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </div>

        <div className="mt-3 divide-y divide-neutral-100">
          {Object.entries(grouped).map(([module, perms]) => {
            const open = openModules.has(module);
            return (
              <div key={module} className="py-2">
                <button type="button" onClick={() => toggleModule(module)} className="flex w-full items-center justify-between py-1.5 text-left">
                  <span className="text-sm font-medium capitalize text-neutral-800">{module}</span>
                  <span className="flex items-center gap-3">
                    {canManagePermissions && (
                      <span className="flex gap-1 text-[11px]" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => setCategory(module, true)} className="rounded-full border border-neutral-200 px-2 py-0.5 text-green-700 hover:bg-green-50">Enable All</button>
                        <button type="button" onClick={() => setCategory(module, false)} className="rounded-full border border-neutral-200 px-2 py-0.5 text-red-700 hover:bg-red-50">Disable All</button>
                      </span>
                    )}
                    <ChevronIcon open={open} />
                  </span>
                </button>
                {open && (
                  <div className="divide-y divide-neutral-50 pl-1">
                    {perms.map((p) => (
                      <PermissionRow key={p.key} perm={p} staged={staged[p.key]} onChange={canManagePermissions ? (g) => setOne(p.key, g) : () => {}} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {permissions === undefined && <p className="py-4 text-center text-sm text-neutral-400">Loading permissions...</p>}
        </div>
      </div>
    </div>
  );
}
