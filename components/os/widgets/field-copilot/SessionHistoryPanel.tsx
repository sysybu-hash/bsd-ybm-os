"use client";

import { ClipboardList, Loader2, Plus, RefreshCw } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { FieldCopilotDraft } from "@/lib/validation/schemas/field-copilot";

const PREFIX = "workspaceWidgets.fieldCopilot.history";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "text-[color:var(--foreground-muted)] bg-[color:var(--surface-soft)] border-[color:var(--border-main)]",
  ANALYZING: "text-amber-700 bg-amber-500/10 border-amber-500/30 dark:text-amber-300",
  READY: "text-emerald-700 bg-emerald-500/10 border-emerald-500/30 dark:text-emerald-300",
  HANDED_OFF: "text-indigo-700 bg-indigo-500/10 border-indigo-500/30 dark:text-indigo-300",
  ARCHIVED: "text-[color:var(--foreground-muted)] bg-[color:var(--surface-soft)] border-[color:var(--border-main)]",
};

type Props = {
  sessions: FieldCopilotDraft[];
  loading: boolean;
  loadingSessionId: string | null;
  onLoad: (sessionId: string) => void;
  onNew: () => void;
  onRefresh: () => void;
};

export default function SessionHistoryPanel({
  sessions,
  loading,
  loadingSessionId,
  onLoad,
  onNew,
  onRefresh,
}: Props) {
  const { t, locale } = useI18n();

  const formatDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return "";
    try {
      return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(dateStr));
    } catch {
      return "";
    }
  };

  const statusLabel = (status: string | undefined) => {
    if (status === "DRAFT") return t(`${PREFIX}.statusDraft` as Parameters<typeof t>[0]);
    if (status === "READY" || status === "ANALYZING") return t(`${PREFIX}.statusReady` as Parameters<typeof t>[0]);
    if (status === "HANDED_OFF") return t(`${PREFIX}.statusHandedOff` as Parameters<typeof t>[0]);
    return status ?? "";
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-black text-[color:var(--foreground-main)]">
            {t(`${PREFIX}.title` as Parameters<typeof t>[0])}
          </h2>
          <p className="mt-0.5 text-[11px] text-[color:var(--foreground-muted)]">
            {t(`${PREFIX}.subtitle` as Parameters<typeof t>[0])}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onNew}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-indigo-600 transition hover:bg-indigo-500/10 dark:text-indigo-300"
          >
            <Plus size={14} aria-hidden />
            {t(`${PREFIX}.newSession` as Parameters<typeof t>[0])}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label={t(`${PREFIX}.refresh` as Parameters<typeof t>[0])}
            className="inline-flex items-center rounded-lg px-2 py-1.5 text-xs text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)] disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} aria-hidden />
          </button>
        </div>
      </div>

      {/* List */}
      {loading && sessions.length === 0 ? (
        <div className="flex items-center gap-2 py-6 text-sm text-[color:var(--foreground-muted)]">
          <Loader2 size={16} className="animate-spin" />
          {t(`${PREFIX}.loading` as Parameters<typeof t>[0])}
        </div>
      ) : sessions.length === 0 ? (
        <p className="py-6 text-center text-sm text-[color:var(--foreground-muted)]">
          {t(`${PREFIX}.empty` as Parameters<typeof t>[0])}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sessions.map((s) => {
            const isLoading = loadingSessionId === s.id;
            const statusColor = STATUS_COLORS[s.status ?? "DRAFT"] ?? STATUS_COLORS["DRAFT"]!;
            const clientLabel = s.contactName ?? s.projectName ?? t(`${PREFIX}.unknownClient` as Parameters<typeof t>[0]);
            // createdAt comes from the assets array via mapSessionToDraft — use id as fallback date
            const dateLabel = formatDate((s as unknown as Record<string, unknown>).createdAt as string | undefined);

            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onLoad(s.id)}
                  disabled={isLoading}
                  className="flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-start transition hover:border-[color:var(--border-main)] hover:bg-[color:var(--surface-soft)] disabled:opacity-60"
                >
                  {isLoading ? (
                    <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-indigo-400" aria-hidden />
                  ) : (
                    <ClipboardList size={18} className="mt-0.5 shrink-0 text-indigo-400" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[color:var(--foreground-main)]">
                      {clientLabel}
                    </span>
                    {s.projectName && s.contactName ? (
                      <span className="block truncate text-[11px] text-[color:var(--foreground-muted)]">
                        {s.projectName}
                      </span>
                    ) : null}
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold ${statusColor}`}>
                        {statusLabel(s.status)}
                      </span>
                      {dateLabel ? (
                        <span className="text-[10px] text-[color:var(--foreground-muted)]">{dateLabel}</span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
