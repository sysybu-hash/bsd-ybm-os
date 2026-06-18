"use client";

import React from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  Server,
  Shield,
  Sparkles,
  Wallet,
  XCircle,
} from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { AdminEnvCheck, AdminEnvCheckGroup } from "@/lib/admin/env-status";
import type { AdminServiceStatus } from "@/lib/admin-assistant/system-health";

type HealthTabProps = {
  health: {
    checkedAt?: string;
    statuses?: AdminServiceStatus[];
    envChecks?: AdminEnvCheckGroup[];
  } | null;
  loading: boolean;
  testingEmail: boolean;
  onRefresh: () => void;
  onTestEmail: () => void;
};

const SERVICE_ICONS = {
  database: Server,
  aiEngine: Sparkles,
  email: Mail,
  payments: Wallet,
  auth: Shield,
} as const;

function serviceDetail(
  t: (key: string, vars?: Record<string, string>) => string,
  status: AdminServiceStatus,
): string {
  const meta = status.meta ?? {};
  switch (status.id) {
    case "database":
      return status.ok
        ? t("platformAdmin.health.serviceDetail.databaseConnected")
        : t("platformAdmin.health.serviceDetail.databaseError");
    case "aiEngine":
      return status.ok
        ? t("platformAdmin.health.serviceDetail.aiProviders", { providers: meta.providers ?? "" })
        : t("platformAdmin.health.serviceDetail.aiNone");
    case "auth":
      return status.ok
        ? t("platformAdmin.health.serviceDetail.authOk")
        : t("platformAdmin.health.serviceDetail.authMissing");
    case "email":
      return status.ok
        ? t("platformAdmin.health.serviceDetail.emailOk", {
            transport: meta.transport ?? "",
            domain: meta.fromDomain ? `@${meta.fromDomain.replace(/^@/, "")}` : "—",
          })
        : t("platformAdmin.health.serviceDetail.emailMissing");
    case "payments": {
      const parts = [
        meta.osPaypal === "ok"
          ? t("platformAdmin.health.serviceDetail.paypalConfigured")
          : t("platformAdmin.health.serviceDetail.paypalMissing"),
        meta.payplus === "ok"
          ? t("platformAdmin.health.serviceDetail.payplusOk")
          : t("platformAdmin.health.serviceDetail.payplusMissing"),
      ];
      if (meta.paypalClient === "ok") {
        parts.unshift(t("platformAdmin.health.serviceDetail.paypalClientOk"));
      }
      return parts.join(" · ");
    }
    default:
      return "";
  }
}

function kindLabel(
  t: (key: string, vars?: Record<string, string>) => string,
  kind: AdminEnvCheck["kind"],
): string {
  if (kind === "required") return t("platformAdmin.health.kindRequired");
  if (kind === "recommended") return t("platformAdmin.health.kindRecommended");
  return t("platformAdmin.health.kindOptional");
}

function EnvRow({
  check,
  t,
}: {
  check: AdminEnvCheck;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  const label = t(`platformAdmin.health.env.${check.id}.label`);
  const hint = t(`platformAdmin.health.env.${check.id}.hint`);
  const configured = check.configured;

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg bg-[color:var(--surface-soft)] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs font-bold">{label}</p>
        <p className="mt-0.5 text-[11px] text-[color:var(--foreground-muted)]">{hint}</p>
        {check.meta ? (
          <p className="mt-0.5 truncate text-[11px] text-[color:var(--foreground-muted)]">{check.meta}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-end">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
            configured
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-rose-500/15 text-rose-600 dark:text-rose-300"
          }`}
        >
          {configured ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
          {configured
            ? t("platformAdmin.health.statusConfigured")
            : t("platformAdmin.health.statusMissing")}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--foreground-muted)]">
          {kindLabel(t, check.kind)}
        </span>
      </div>
    </li>
  );
}

export function HealthTab({ health, loading, testingEmail, onRefresh, onTestEmail }: HealthTabProps) {
  const { t } = useI18n();
  const checkedLabel = health?.checkedAt
    ? t("platformAdmin.health.lastChecked", {
        time: new Date(health.checkedAt).toLocaleString(undefined, {
          dateStyle: "short",
          timeStyle: "short",
        }),
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black">{t("platformAdmin.health.title")}</h2>
          <p className="text-xs text-[color:var(--foreground-muted)]">{t("platformAdmin.health.subtitle")}</p>
          {checkedLabel ? (
            <p className="mt-1 text-[11px] text-[color:var(--foreground-muted)]">{checkedLabel}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={onRefresh}
            className="flex items-center gap-2 rounded-xl border border-[color:var(--border-main)] px-4 py-2 text-sm font-bold hover:bg-[color:var(--surface-soft)] disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {t("platformAdmin.health.refresh")}
          </button>
          <button
            type="button"
            disabled={testingEmail || loading}
            onClick={onTestEmail}
            className="rounded-xl bg-[color:var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {testingEmail ? t("platformAdmin.health.sendingTestEmail") : t("platformAdmin.health.sendTestEmail")}
          </button>
        </div>
      </div>

      {loading && !health?.statuses?.length ? (
        <div className="flex items-center gap-2 rounded-xl border border-[color:var(--border-main)] p-4 text-sm text-[color:var(--foreground-muted)]">
          <Loader2 size={16} className="animate-spin" />
          {t("platformAdmin.health.loading")}
        </div>
      ) : null}

      {!loading && !health?.statuses?.length ? (
        <p className="text-sm text-[color:var(--foreground-muted)]">{t("platformAdmin.health.empty")}</p>
      ) : null}

      {health?.statuses?.length ? (
        <section className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">
            {t("platformAdmin.health.servicesTitle")}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {health.statuses.map((status) => {
              const Icon = SERVICE_ICONS[status.id] ?? Activity;
              return (
                <div
                  key={status.id}
                  className={`rounded-xl border p-3 ${
                    status.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        status.ok ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"
                      }`}
                    >
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold">{t(`platformAdmin.health.services.${status.id}.name`)}</p>
                        {status.ok ? (
                          <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
                        ) : (
                          <AlertTriangle size={14} className="shrink-0 text-rose-500" />
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[color:var(--foreground-muted)]">
                        {serviceDetail(t, status)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {health?.envChecks?.length ? (
        <section className="space-y-4">
          <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">
            <Activity size={12} />
            {t("platformAdmin.health.envTitle")}
          </p>
          {health.envChecks.map((group) => (
            <div key={group.id} className="rounded-xl border border-[color:var(--border-main)] p-3">
              <p className="mb-2 text-xs font-bold text-[color:var(--foreground-muted)]">
                {t(`platformAdmin.health.envGroups.${group.id}`)}
              </p>
              <ul className="space-y-1.5">
                {group.checks.map((check) => (
                  <EnvRow key={check.id} check={check} t={t} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
