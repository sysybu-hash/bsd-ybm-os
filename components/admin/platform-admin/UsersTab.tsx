"use client";

import React from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import type { AdminUserRow } from "@/app/actions/admin-console";
import type { ExecutiveOrgRow } from "@/app/actions/executive-subscriptions";
import { osFieldInlineClassName } from "@/components/os/ui/os-field";

type UsersTabProps = {
  adminUsers: AdminUserRow[];
  orgs: ExecutiveOrgRow[];
  provisionEmail: string; setProvisionEmail: (v: string) => void;
  provisionName: string; setProvisionName: (v: string) => void;
  provisionOrgId: string; setProvisionOrgId: (v: string) => void;
  provisionRole: string; setProvisionRole: (v: string) => void;
  provisionSendEmail: boolean; setProvisionSendEmail: (v: boolean) => void;
  userEmail: string; setUserEmail: (v: string) => void;
  userLookup: Record<string, unknown> | null;
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
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <h3 className="mb-3 text-sm font-black">הוספת משתמש לארגון</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input type="email" value={provisionEmail} onChange={(e) => setProvisionEmail(e.target.value)} placeholder="אימייל *" className={osFieldInlineClassName} />
          <input value={provisionName} onChange={(e) => setProvisionName(e.target.value)} placeholder="שם" className={osFieldInlineClassName} />
          <select value={provisionOrgId} onChange={(e) => setProvisionOrgId(e.target.value)} className={`${osFieldInlineClassName} sm:col-span-2`}>
            <option value="">בחרו ארגון *</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select value={provisionRole} onChange={(e) => setProvisionRole(e.target.value)} className={osFieldInlineClassName}>
            <option value="ORG_ADMIN">מנהל ארגון</option>
            <option value="PROJECT_MGR">מנהל פרויקטים</option>
            <option value="EMPLOYEE">עובד</option>
            <option value="CLIENT">לקוח</option>
          </select>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={provisionSendEmail} onChange={(e) => setProvisionSendEmail(e.target.checked)} />
            שלח פרטי התחברות במייל
          </label>
        </div>
        <button type="button" disabled={busyAction} onClick={onProvisionUser}
          className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busyAction ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          הוסף משתמש
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[color:var(--border-main)]">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--surface-soft)] text-[10px] uppercase tracking-widest text-[color:var(--foreground-muted)]">
            <tr>
              <th className="p-2 text-start">אימייל</th>
              <th className="p-2 text-start">ארגון</th>
              <th className="p-2 text-start">תפקיד</th>
              <th className="p-2 text-start">סטטוס</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {adminUsers.map((u) => (
              <tr key={u.id} className="border-t border-[color:var(--border-main)]">
                <td className="p-2 font-semibold">{u.email}</td>
                <td className="p-2 text-xs">{u.organizationName ?? "—"}</td>
                <td className="p-2 text-xs">{u.role}</td>
                <td className="p-2 text-xs">{u.accountStatus}</td>
                <td className="p-2">
                  <button type="button" title="מחק משתמש" onClick={() => onDeleteUser(u.email)}
                    className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-500/10">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="max-w-xl rounded-xl border border-[color:var(--border-main)] p-4">
        <p className="mb-2 text-xs font-bold text-[color:var(--foreground-muted)]">חיפוש מהיר</p>
        <div className="flex gap-2">
          <input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="אימייל לחיפוש"
            className="flex-1 rounded-xl border border-[color:var(--border-main)] p-3 text-sm" />
          <button type="button" onClick={onLookupUser} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">חפש</button>
        </div>
        {userLookup && typeof userLookup === "object" && "found" in userLookup && (userLookup as { found: boolean }).found && "user" in userLookup ? (
          <div className="mt-3 space-y-2 text-sm">
            <p>
              <span className="font-bold">{(userLookup as { user: { email: string } }).user.email}</span>{" "}
              · {(userLookup as { user: { role: string } }).user.role}
            </p>
            <button type="button"
              onClick={() => onDeleteUser((userLookup as { user: { email: string } }).user.email)}
              className="flex items-center gap-2 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-bold text-rose-600">
              <Trash2 size={14} /> מחק משתמש זה
            </button>
          </div>
        ) : userLookup && typeof userLookup === "object" && "found" in userLookup ? (
          <p className="mt-2 text-sm text-[color:var(--foreground-muted)]">משתמש לא נמצא</p>
        ) : null}
      </div>
    </div>
  );
}
