"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  LogIn,
  RefreshCw,
  Search,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { osFieldClassName } from "@/components/os/ui/os-field";

type PresenceStatus = "online" | "away" | "offline";

type ConnectionRow = {
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

type LoginEventRow = {
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

type LoginLogPayload = {
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

function fmtWhen(
  iso: string | null,
  locale: string,
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(locale, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function statusDot(status: PresenceStatus) {
  if (status === "online") return "bg-emerald-500";
  if (status === "away") return "bg-amber-400";
  return "bg-[color:var(--foreground-muted)]/40";
}

export function LoginLogTab() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<LoginLogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      const res = await fetch(`/api/admin/login-log?${params.toString()}`, {
        credentials: "include",
      });
      const json = (await res.json()) as LoginLogPayload & { error?: string };
      if (!res.ok) throw new Error(json.error || t("platformAdmin.logins.loadFailed"));
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("platformAdmin.logins.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [query, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const statusLabel = (s: PresenceStatus) => {
    if (s === "online") return t("platformAdmin.logins.statusOnline");
    if (s === "away") return t("platformAdmin.logins.statusAway");
    return t("platformAdmin.logins.statusOffline");
  };

  const providerLabel = (p: string | null) => {
    if (!p) return "—";
    if (p === "google") return t("platformAdmin.logins.providerGoogle");
    if (p === "credentials") return t("platformAdmin.logins.providerCredentials");
    if (p === "passkey") return t("platformAdmin.logins.providerPasskey");
    return p;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black">{t("platformAdmin.logins.title")}</h2>
          <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
            {t("platformAdmin.logins.subtitle")}
          </p>
          {data?.checkedAt ? (
            <p className="mt-1 text-[10px] text-[color:var(--foreground-muted)]">
              {t("platformAdmin.logins.lastChecked", {
                time: fmtWhen(data.checkedAt, locale),
              })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(q.trim());
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("platformAdmin.logins.searchPlaceholder")}
              className={`${osFieldClassName} min-w-[12rem] text-xs`}
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold hover:bg-[color:var(--surface-soft)]"
            >
              <Search size={14} />
              {t("platformAdmin.logins.search")}
            </button>
          </form>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold hover:bg-[color:var(--surface-soft)]"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {t("platformAdmin.logins.refresh")}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            key: "online",
            label: t("platformAdmin.logins.summaryOnline"),
            value: data?.summary.online ?? "—",
            icon: Wifi,
            tone: "text-emerald-600",
          },
          {
            key: "away",
            label: t("platformAdmin.logins.summaryAway"),
            value: data?.summary.away ?? "—",
            icon: Wifi,
            tone: "text-amber-600",
          },
          {
            key: "offline",
            label: t("platformAdmin.logins.summaryOffline"),
            value: data?.summary.offline ?? "—",
            icon: WifiOff,
            tone: "text-[color:var(--foreground-muted)]",
          },
          {
            key: "today",
            label: t("platformAdmin.logins.summaryLoginsToday"),
            value: data?.summary.loginsToday ?? "—",
            icon: LogIn,
            tone: "text-blue-600",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--foreground-muted)]">
                  {card.label}
                </p>
                <Icon size={16} className={card.tone} />
              </div>
              <p className={`mt-2 text-2xl font-black ${card.tone}`}>{card.value}</p>
            </div>
          );
        })}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-black">{t("platformAdmin.logins.connectionsTitle")}</h3>
        <p className="text-[11px] text-[color:var(--foreground-muted)]">
          {t("platformAdmin.logins.connectionsHint")}
        </p>
        <div className="overflow-x-auto rounded-2xl border border-[color:var(--border-main)]">
          <table className="min-w-full text-start text-xs">
            <thead className="bg-[color:var(--surface-soft)] text-[color:var(--foreground-muted)]">
              <tr>
                <th className="px-3 py-2 font-bold">{t("platformAdmin.logins.colStatus")}</th>
                <th className="px-3 py-2 font-bold">{t("platformAdmin.logins.colUser")}</th>
                <th className="px-3 py-2 font-bold">{t("platformAdmin.logins.colOrg")}</th>
                <th className="px-3 py-2 font-bold">{t("platformAdmin.logins.colLastSeen")}</th>
                <th className="px-3 py-2 font-bold">{t("platformAdmin.logins.colLastLogin")}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.connections ?? []).slice(0, 80).map((row) => (
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
                  <td className="px-3 py-2 whitespace-nowrap">{fmtWhen(row.lastSeenAt, locale)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtWhen(row.lastLoginAt, locale)}</td>
                </tr>
              ))}
              {!loading && (data?.connections.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-[color:var(--foreground-muted)]">
                    {t("platformAdmin.logins.emptyConnections")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-black">{t("platformAdmin.logins.eventsTitle")}</h3>
        <div className="overflow-x-auto rounded-2xl border border-[color:var(--border-main)]">
          <table className="min-w-full text-start text-xs">
            <thead className="bg-[color:var(--surface-soft)] text-[color:var(--foreground-muted)]">
              <tr>
                <th className="px-3 py-2 font-bold">{t("platformAdmin.logins.colWhen")}</th>
                <th className="px-3 py-2 font-bold">{t("platformAdmin.logins.colUser")}</th>
                <th className="px-3 py-2 font-bold">{t("platformAdmin.logins.colOrg")}</th>
                <th className="px-3 py-2 font-bold">{t("platformAdmin.logins.colProvider")}</th>
                <th className="px-3 py-2 font-bold">{t("platformAdmin.logins.colIp")}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.events ?? []).map((ev) => (
                <tr key={ev.id} className="border-t border-[color:var(--border-main)]">
                  <td className="px-3 py-2 whitespace-nowrap">{fmtWhen(ev.createdAt, locale)}</td>
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
              {!loading && (data?.events.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-[color:var(--foreground-muted)]">
                    {t("platformAdmin.logins.emptyEvents")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
