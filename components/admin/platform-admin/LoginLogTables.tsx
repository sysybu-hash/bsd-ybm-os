"use client";

import React from "react";

export type PresenceStatus = "online" | "away" | "offline";

export type ConnectionRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  status: PresenceStatus;
  organization: {
    id: string;
    name: string;
    subscriptionStatus: string;
    subscriptionTier: string;
  } | null;
};

export type LoginEventRow = {
  id: string;
  email: string;
  name: string | null;
  provider: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  organizationName: string | null;
  subscriptionStatus: string | null;
};

export type LoginLogPayload = {
  checkedAt: string;
  summary: {
    online: number;
    away: number;
    offline: number;
    loginsToday: number;
    activeUsers: number;
  };
  connections: ConnectionRow[];
  events: LoginEventRow[];
};

/** Localized short date-time, or an em dash for missing/invalid values. */
export function fmtWhen(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
}

export function statusDot(status: PresenceStatus): string {
  if (status === "online") return "bg-emerald-500";
  if (status === "away") return "bg-amber-400";
  return "bg-[color:var(--foreground-muted)]/40";
}

/** Scoped translator receiving a key under `platformAdmin.logins`. */
type Tr = (suffix: string, params?: Record<string, string>) => string;

const TH = "px-3 py-2 font-bold";
const HEAD = "bg-[color:var(--surface-soft)] text-[color:var(--foreground-muted)]";

export function ConnectionsTable({
  rows,
  loading,
  locale,
  statusLabel,
  ts,
}: {
  rows: ConnectionRow[];
  loading: boolean;
  locale: string;
  statusLabel: (s: PresenceStatus) => string;
  ts: Tr;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[color:var(--border-main)]">
      <table className="min-w-full text-start text-xs">
        <thead className={HEAD}>
          <tr>
            <th className={TH}>{ts("colStatus")}</th>
            <th className={TH}>{ts("colUser")}</th>
            <th className={TH}>{ts("colOrg")}</th>
            <th className={TH}>{ts("colLastSeen")}</th>
            <th className={TH}>{ts("colLastLogin")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 80).map((row) => (
            <tr key={row.id} className="border-t border-[color:var(--border-main)]">
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5 font-bold">
                  <span className={`h-2 w-2 rounded-full ${statusDot(row.status)}`} />
                  {statusLabel(row.status)}
                </span>
              </td>
              <td className="px-3 py-2">
                <div className="font-bold">{row.name || row.email}</div>
                <div className="text-[10px] text-[color:var(--foreground-muted)]">{row.email}</div>
              </td>
              <td className="px-3 py-2">
                {row.organization ? (
                  <>
                    <div className="font-bold">{row.organization.name}</div>
                    <div className="text-[10px] text-[color:var(--foreground-muted)]">
                      {row.organization.subscriptionTier} · {row.organization.subscriptionStatus}
                    </div>
                  </>
                ) : (
                  <span className="text-[color:var(--foreground-muted)]">—</span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2">{fmtWhen(row.lastSeenAt, locale)}</td>
              <td className="whitespace-nowrap px-3 py-2">{fmtWhen(row.lastLoginAt, locale)}</td>
            </tr>
          ))}
          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-[color:var(--foreground-muted)]">
                {ts("emptyConnections")}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export function EventsTable({
  rows,
  loading,
  locale,
  providerLabel,
  ts,
}: {
  rows: LoginEventRow[];
  loading: boolean;
  locale: string;
  providerLabel: (p: string | null) => string;
  ts: Tr;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[color:var(--border-main)]">
      <table className="min-w-full text-start text-xs">
        <thead className={HEAD}>
          <tr>
            <th className={TH}>{ts("colWhen")}</th>
            <th className={TH}>{ts("colUser")}</th>
            <th className={TH}>{ts("colOrg")}</th>
            <th className={TH}>{ts("colProvider")}</th>
            <th className={TH}>{ts("colIp")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((ev) => (
            <tr key={ev.id} className="border-t border-[color:var(--border-main)]">
              <td className="whitespace-nowrap px-3 py-2">{fmtWhen(ev.createdAt, locale)}</td>
              <td className="px-3 py-2">
                <div className="font-bold">{ev.name || ev.email}</div>
                <div className="text-[10px] text-[color:var(--foreground-muted)]">{ev.email}</div>
              </td>
              <td className="px-3 py-2">
                {ev.organizationName ? (
                  <>
                    <div className="font-bold">{ev.organizationName}</div>
                    {ev.subscriptionStatus ? (
                      <div className="text-[10px] text-[color:var(--foreground-muted)]">
                        {ev.subscriptionStatus}
                      </div>
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2">{providerLabel(ev.provider)}</td>
              <td className="px-3 py-2 font-mono text-[10px]">{ev.ip || "—"}</td>
            </tr>
          ))}
          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-[color:var(--foreground-muted)]">
                {ts("emptyEvents")}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
