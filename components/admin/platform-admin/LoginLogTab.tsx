"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, LogIn, RefreshCw, Search, Wifi, WifiOff } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { osFieldClassName } from "@/components/os/ui/os-field";
import {
  ConnectionsTable,
  EventsTable,
  fmtWhen,
  type LoginLogPayload,
  type PresenceStatus,
} from "@/components/admin/platform-admin/LoginLogTables";

export function LoginLogTab() {
  const { t, locale } = useI18n();
  const ts = useCallback(
    (suffix: string, params?: Record<string, string>) => t(`platformAdmin.logins.${suffix}`, params),
    [t],
  );
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
      if (!res.ok) throw new Error(json.error || ts("loadFailed"));
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : ts("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [query, ts]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const statusLabel = (s: PresenceStatus) => {
    if (s === "online") return ts("statusOnline");
    if (s === "away") return ts("statusAway");
    return ts("statusOffline");
  };

  const providerLabel = (p: string | null) => {
    if (!p) return "—";
    if (p === "google") return ts("providerGoogle");
    if (p === "credentials") return ts("providerCredentials");
    if (p === "passkey") return ts("providerPasskey");
    return p;
  };

  const summaryCards = [
    { key: "online", label: ts("summaryOnline"), value: data?.summary.online, icon: Wifi, tone: "text-emerald-600" },
    { key: "away", label: ts("summaryAway"), value: data?.summary.away, icon: Wifi, tone: "text-amber-600" },
    { key: "offline", label: ts("summaryOffline"), value: data?.summary.offline, icon: WifiOff, tone: "text-[color:var(--foreground-muted)]" },
    { key: "today", label: ts("summaryLoginsToday"), value: data?.summary.loginsToday, icon: LogIn, tone: "text-blue-600" },
  ] as const;

  return (
    <div className="space-y-5" dir="auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black">{ts("title")}</h2>
          <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">{ts("subtitle")}</p>
          {data?.checkedAt ? (
            <p className="mt-1 text-[10px] text-[color:var(--foreground-muted)]">
              {ts("lastChecked", { time: fmtWhen(data.checkedAt, locale) })}
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
              placeholder={ts("searchPlaceholder")}
              className={`${osFieldClassName} min-w-[12rem] text-xs`}
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold hover:bg-[color:var(--surface-soft)]"
            >
              <Search size={14} aria-hidden />
              {ts("search")}
            </button>
          </form>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold hover:bg-[color:var(--surface-soft)]"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <RefreshCw size={14} aria-hidden />
            )}
            {ts("refresh")}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => {
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
                <Icon size={16} className={card.tone} aria-hidden />
              </div>
              <p className={`mt-2 text-2xl font-black ${card.tone}`}>{card.value ?? "—"}</p>
            </div>
          );
        })}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-black">{ts("connectionsTitle")}</h3>
        <p className="text-[11px] text-[color:var(--foreground-muted)]">{ts("connectionsHint")}</p>
        <ConnectionsTable
          rows={data?.connections ?? []}
          loading={loading}
          locale={locale}
          statusLabel={statusLabel}
          ts={ts}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-black">{ts("eventsTitle")}</h3>
        <EventsTable
          rows={data?.events ?? []}
          loading={loading}
          locale={locale}
          providerLabel={providerLabel}
          ts={ts}
        />
      </section>
    </div>
  );
}
