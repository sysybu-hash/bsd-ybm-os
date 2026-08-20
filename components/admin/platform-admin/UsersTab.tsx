"use client";

import React, { useMemo, useState } from "react";
import { Loader2, Search, Trash2, UserPlus, Users } from "lucide-react";
import type { AdminUserRow } from "@/app/actions/admin-console";
import type { ExecutiveOrgRow } from "@/app/actions/executive-subscriptions";
import type { AdminUserLookup } from "@/components/admin/platform-admin/usePlatformAdminUtils";
import { useI18n } from "@/components/os/system/I18nProvider";
import { osFieldInlineClassName } from "@/components/os/ui/os-field";
import { Section } from "@/components/admin/platform-admin/SettingsControls";

const ROLE_KEYS = [
  { value: "ORG_ADMIN", key: "roleOrgAdmin" },
  { value: "PROJECT_MGR", key: "roleProjectMgr" },
  { value: "EMPLOYEE", key: "roleEmployee" },
  { value: "CLIENT", key: "roleClient" },
] as const;

type UsersTabProps = {
  adminUsers: AdminUserRow[];
  orgs: ExecutiveOrgRow[];
  provisionEmail: string; setProvisionEmail: (v: string) => void;
  provisionName: string; setProvisionName: (v: string) => void;
  provisionOrgId: string; setProvisionOrgId: (v: string) => void;
  provisionRole: string; setProvisionRole: (v: string) => void;
  provisionSendEmail: boolean; setProvisionSendEmail: (v: boolean) => void;
  userEmail: string; setUserEmail: (v: string) => void;
  userLookup: AdminUserLookup | null;
  busyAction: boolean;
  onProvisionUser: () => void;
  onDeleteUser: (email: string) => void;
  onLookupUser: () => void;
};

export function UsersTab({
  adminUsers, orgs,
  provisionEmail, setProvisionEmail, provisionName, setProvisionName,
  provisionOrgId, setProvisionOrgId, provisionRole, setProvisionRole,
  provisionSendEmail, setProvisionSendEmail,
  userEmail, setUserEmail, userLookup,
  busyAction, onProvisionUser, onDeleteUser, onLookupUser,
}: UsersTabProps) {
  const { t } = useI18n();
  const ts = (suffix: string, params?: Record<string, string>) =>
    t(`platformAdmin.users.${suffix}`, params);
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return adminUsers;
    return adminUsers.filter((u) =>
      [u.email, u.name ?? "", u.organizationName ?? "", u.role, u.accountStatus]
        .some((v) => v.toLowerCase().includes(q)),
    );
  }, [adminUsers, filter]);

  const canProvision = provisionEmail.trim() !== "" && provisionOrgId !== "";

  return (
    <div className="space-y-4" dir="auto">
      {/* Provision */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-black">
          <UserPlus size={16} aria-hidden />
          {ts("addTitle")}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="email"
            value={provisionEmail}
            onChange={(e) => setProvisionEmail(e.target.value)}
            placeholder={ts("email")}
            className={osFieldInlineClassName}
          />
          <input
            value={provisionName}
            onChange={(e) => setProvisionName(e.target.value)}
            placeholder={ts("name")}
            className={osFieldInlineClassName}
          />
          <select
            value={provisionOrgId}
            onChange={(e) => setProvisionOrgId(e.target.value)}
            className={`${osFieldInlineClassName} sm:col-span-2`}
          >
            <option value="">{ts("selectOrg")}</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <select
            value={provisionRole}
            onChange={(e) => setProvisionRole(e.target.value)}
            className={osFieldInlineClassName}
          >
            {ROLE_KEYS.map((r) => (
              <option key={r.value} value={r.value}>{ts(r.key)}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              className="h-4 w-4 accent-emerald-600"
              checked={provisionSendEmail}
              onChange={(e) => setProvisionSendEmail(e.target.checked)}
            />
            {ts("sendCredentials")}
          </label>
        </div>
        <button
          type="button"
          disabled={busyAction || !canProvision}
          onClick={onProvisionUser}
          className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busyAction ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <UserPlus size={16} aria-hidden />
          )}
          {ts("addButton")}
        </button>
      </div>

      {/* Directory */}
      <Section icon={<Users size={16} aria-hidden />} title={ts("listTitle")}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="relative min-w-[200px] flex-1">
            <Search
              size={14}
              aria-hidden
              className="pointer-events-none absolute inset-y-0 my-auto start-3 text-[color:var(--foreground-muted)]"
            />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={ts("filterPlaceholder")}
              className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] py-2 pe-3 ps-9 text-sm"
            />
          </span>
          <span className="text-xs font-bold text-[color:var(--foreground-muted)]">
            {ts("countLabel", { shown: String(visible.length), total: String(adminUsers.length) })}
          </span>
        </div>

        {adminUsers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[color:var(--border-main)] p-6 text-center text-sm text-[color:var(--foreground-muted)]">
            {ts("empty")}
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[color:var(--border-main)] p-6 text-center text-sm text-[color:var(--foreground-muted)]">
            {ts("noMatches")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[color:var(--border-main)]">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--surface-soft)] text-[10px] uppercase tracking-widest text-[color:var(--foreground-muted)]">
                <tr>
                  <th className="p-2 text-start">{ts("colEmail")}</th>
                  <th className="p-2 text-start">{ts("colOrg")}</th>
                  <th className="p-2 text-start">{ts("colRole")}</th>
                  <th className="p-2 text-start">{ts("colStatus")}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr key={u.id} className="border-t border-[color:var(--border-main)]">
                    <td className="p-2 font-semibold">{u.email}</td>
                    <td className="p-2 text-xs">{u.organizationName ?? "—"}</td>
                    <td className="p-2 text-xs">{u.role}</td>
                    <td className="p-2 text-xs">{u.accountStatus}</td>
                    <td className="p-2">
                      <button
                        type="button"
                        title={ts("deleteUser")}
                        aria-label={`${ts("deleteUser")} ${u.email}`}
                        onClick={() => onDeleteUser(u.email)}
                        className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Quick lookup */}
      <Section icon={<Search size={16} aria-hidden />} title={ts("lookupTitle")}>
        <div className="flex gap-2">
          <input
            type="email"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onLookupUser();
            }}
            placeholder={ts("lookupPlaceholder")}
            className="flex-1 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] p-3 text-sm"
          />
          <button
            type="button"
            onClick={onLookupUser}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white"
          >
            {ts("lookupButton")}
          </button>
        </div>

        {userLookup?.found ? (
          <div className="mt-3 space-y-2 rounded-xl border border-[color:var(--border-main)] p-3 text-sm">
            <p className="font-bold">{userLookup.user.email}</p>
            <p className="text-xs text-[color:var(--foreground-muted)]">
              {userLookup.user.name ?? "—"} · {userLookup.user.role} · {userLookup.user.accountStatus}
            </p>
            <button
              type="button"
              onClick={() => onDeleteUser(userLookup.user.email)}
              className="flex items-center gap-2 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-bold text-rose-600"
            >
              <Trash2 size={14} aria-hidden />
              {ts("lookupDelete")}
            </button>
          </div>
        ) : userLookup ? (
          <p className="mt-2 text-sm text-[color:var(--foreground-muted)]">{ts("lookupNotFound")}</p>
        ) : null}
      </Section>
    </div>
  );
}
