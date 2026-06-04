"use client";

import React from "react";
import { Calendar, Loader2, RefreshCw } from "lucide-react";
import { useSettingsCalendarSection } from "./useSettingsCalendarSection";

type SettingsCalendarSectionProps = {
  t: (key: string, vars?: Record<string, string>) => string;
};

export function SettingsCalendarSection({ t }: SettingsCalendarSectionProps) {
  const {
    S, loading, status, calendars, wizardStep, setWizardStep,
    selectedCalendarId, setSelectedCalendarId,
    syncMode, setSyncMode, consentChecked, setConsentChecked,
    pushEnabled, setPushEnabled, reminderMinutes, setReminderMinutes,
    activating, syncing, showWizard, loadCalendars,
    handleConnect, handleActivate, handleSyncNow, handlePause,
  } = useSettingsCalendarSection(t);

  if (loading) {
    return (
      <section className="flex justify-center border-t border-[color:var(--border-main)]/30 py-8 pt-6">
        <Loader2 className="animate-spin text-violet-500" size={24} />
      </section>
    );
  }

  return (
    <section className="border-t border-[color:var(--border-main)]/30 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Calendar size={18} className="text-violet-500" />
        <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
          {t(`${S}.sectionTitle`)}
        </h3>
      </div>

      <p className="mb-4 max-w-xl text-xs leading-relaxed text-[color:var(--foreground-muted)]">
        {t(`${S}.intro`)}
      </p>

      {status.orgCalendarEnabled === false ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">{t(`${S}.orgDisabled`)}</p>
      ) : null}

      {status.orgCalendarEnabled !== false && status.subscriptionActive === false ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">{t(`${S}.subscriptionRequired`)}</p>
      ) : null}

      {status.orgCalendarEnabled !== false && status.subscriptionActive !== false && (
        <>
          {status.suggested && !status.active ? (
            <div className="mb-4 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
              <p className="mb-3 text-sm text-[color:var(--foreground-main)]">{t(`${S}.suggestBody`)}</p>
              {!status.connected ? (
                <button type="button" onClick={handleConnect}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500">
                  {t(`${S}.connectCta`)}
                </button>
              ) : (
                <button type="button" onClick={() => { setWizardStep(0); void loadCalendars(); }}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500">
                  {t(`${S}.setupCta`)}
                </button>
              )}
            </div>
          ) : null}

          {status.active ? (
            <div className="mb-4 space-y-3">
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {t(`${S}.activeLabel`, {
                  mode: status.settings?.syncMode === "BIDIRECTIONAL"
                    ? t(`${S}.modeBidirectional`)
                    : t(`${S}.modeReadOnly`),
                })}
              </p>
              {status.settings?.calendarSummary ? (
                <p className="text-xs text-[color:var(--foreground-muted)]">
                  {t(`${S}.calendarLabel`, { name: status.settings.calendarSummary })}
                </p>
              ) : null}
              {status.settings?.lastSyncAt ? (
                <p className="text-xs text-[color:var(--foreground-muted)]">
                  {t(`${S}.lastSync`, { at: new Date(status.settings.lastSyncAt).toLocaleString() })}
                </p>
              ) : null}
              {status.settings?.lastSyncError ? (
                <p className="text-xs text-red-500">{status.settings.lastSyncError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void handleSyncNow()} disabled={syncing}
                  className="flex items-center gap-2 rounded-xl border border-[color:var(--border-main)] px-4 py-2 text-sm font-bold">
                  {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  {t(`${S}.syncNow`)}
                </button>
                <button type="button" onClick={() => void handlePause()}
                  className="rounded-xl border border-[color:var(--border-main)] px-4 py-2 text-sm font-bold text-[color:var(--foreground-muted)]">
                  {t(`${S}.pause`)}
                </button>
              </div>
            </div>
          ) : null}

          {showWizard && status.connected ? (
            <div className="space-y-4 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/30 p-4">
              <h4 className="text-sm font-bold">{t(`${S}.wizardTitle`)}</h4>

              {wizardStep === 0 ? (
                <>
                  <label className="text-xs font-bold text-[color:var(--foreground-muted)]">{t(`${S}.pickCalendar`)}</label>
                  <select value={selectedCalendarId} onChange={(e) => setSelectedCalendarId(e.target.value)}
                    className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 px-3 py-2 text-sm">
                    {calendars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.summary}{c.primary ? ` (${t(`${S}.primary`)})` : ""}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setWizardStep(1)} disabled={!selectedCalendarId}
                    className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                    {t(`${S}.next`)}
                  </button>
                </>
              ) : null}

              {wizardStep === 1 ? (
                <>
                  <p className="text-xs font-bold text-[color:var(--foreground-muted)]">{t(`${S}.pickSyncMode`)}</p>
                  {(["READ_ONLY", "BIDIRECTIONAL"] as const).map((mode) => (
                    <label key={mode} className="flex cursor-pointer items-start gap-2 text-sm">
                      <input type="radio" name="syncMode" checked={syncMode === mode}
                        onChange={() => setSyncMode(mode)} className="mt-1" />
                      <span>
                        <strong>{t(`${S}.mode${mode === "READ_ONLY" ? "ReadOnly" : "Bidirectional"}`)}</strong>
                        <br />
                        <span className="text-xs text-[color:var(--foreground-muted)]">
                          {t(`${S}.mode${mode === "READ_ONLY" ? "ReadOnly" : "Bidirectional"}Desc`)}
                        </span>
                      </span>
                    </label>
                  ))}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setWizardStep(0)} className="text-sm font-bold">{t(`${S}.back`)}</button>
                    <button type="button" onClick={() => setWizardStep(2)}
                      className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white">
                      {t(`${S}.next`)}
                    </button>
                  </div>
                </>
              ) : null}

              {wizardStep === 2 ? (
                <>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} className="mt-1" />
                    <span>{t(`${S}.consentText`)}</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={pushEnabled} onChange={(e) => setPushEnabled(e.target.checked)} />
                    <span>{t(`${S}.enablePush`)}</span>
                  </label>
                  {pushEnabled ? (
                    <select value={reminderMinutes} onChange={(e) => setReminderMinutes(Number(e.target.value))}
                      className="w-full rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-sm">
                      {[5, 10, 15, 30, 60].map((m) => (
                        <option key={m} value={m}>{t(`${S}.minutesBefore`, { minutes: String(m) })}</option>
                      ))}
                    </select>
                  ) : null}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setWizardStep(1)} className="text-sm font-bold">{t(`${S}.back`)}</button>
                    <button type="button" onClick={() => void handleActivate()} disabled={activating}
                      className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500">
                      {activating ? <Loader2 size={16} className="animate-spin" /> : null}
                      {t(`${S}.activate`)}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
