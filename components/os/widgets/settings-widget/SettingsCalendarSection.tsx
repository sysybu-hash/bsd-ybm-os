"use client";

import React from "react";
import { Calendar, RefreshCw } from "lucide-react";
import WidgetState from "@/components/os/WidgetState";
import { OsButton } from "@/components/os/ui";
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
      <section className="border-t border-[color:var(--border-main)]/30 pt-6">
        <WidgetState variant="loading" />
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
                <OsButton variant="primary" onClick={handleConnect}>
                  {t(`${S}.connectCta`)}
                </OsButton>
              ) : (
                <OsButton variant="primary" onClick={() => { setWizardStep(0); void loadCalendars(); }}>
                  {t(`${S}.setupCta`)}
                </OsButton>
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
                <OsButton variant="secondary" loading={syncing} icon={<RefreshCw size={16} aria-hidden />} onClick={() => void handleSyncNow()}>
                  {t(`${S}.syncNow`)}
                </OsButton>
                <OsButton variant="secondary" onClick={() => void handlePause()}>
                  {t(`${S}.pause`)}
                </OsButton>
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
                  <OsButton variant="primary" disabled={!selectedCalendarId} onClick={() => setWizardStep(1)}>
                    {t(`${S}.next`)}
                  </OsButton>
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
                    <OsButton variant="quiet" onClick={() => setWizardStep(0)}>{t(`${S}.back`)}</OsButton>
                    <OsButton variant="primary" onClick={() => setWizardStep(2)}>
                      {t(`${S}.next`)}
                    </OsButton>
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
                    <OsButton variant="quiet" onClick={() => setWizardStep(1)}>{t(`${S}.back`)}</OsButton>
                    <OsButton variant="primary" loading={activating} onClick={() => void handleActivate()}>
                      {t(`${S}.activate`)}
                    </OsButton>
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
