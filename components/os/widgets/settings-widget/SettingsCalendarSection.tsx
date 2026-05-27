"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Calendar, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { buildGoogleCalendarConnectUrl } from "@/lib/google-calendar-oauth";

const S = "workspaceWidgets.settings.calendar";

type CalendarListItem = {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string | null;
};

type CalendarSettingsResponse = {
  suggested?: boolean;
  orgCalendarEnabled?: boolean;
  subscriptionActive?: boolean;
  connected?: boolean;
  active?: boolean;
  connectUrl?: string;
  settings?: {
    syncMode: string;
    enabled: boolean;
    consentAt: string | null;
    calendarId: string | null;
    calendarSummary: string | null;
    pushEnabled: boolean;
    reminderMinutesBefore: number;
    lastSyncAt: string | null;
    lastSyncError: string | null;
  };
};

type SettingsCalendarSectionProps = {
  t: (key: string, vars?: Record<string, string>) => string;
};

export function SettingsCalendarSection({ t }: SettingsCalendarSectionProps) {
  const searchParams = useSearchParams();
  const wizardOpen = searchParams.get("calendar") === "wizard" || searchParams.get("calendar_connected") === "1";

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<CalendarSettingsResponse>({});
  const [calendars, setCalendars] = useState<CalendarListItem[]>([]);
  const [wizardStep, setWizardStep] = useState(0);
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [syncMode, setSyncMode] = useState<"READ_ONLY" | "BIDIRECTIONAL">("READ_ONLY");
  const [consentChecked, setConsentChecked] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState(15);
  const [activating, setActivating] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/google-calendar/settings", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as CalendarSettingsResponse;
      setStatus(data);
      if (data.settings?.calendarId) setSelectedCalendarId(data.settings.calendarId);
      if (data.settings?.reminderMinutesBefore) setReminderMinutes(data.settings.reminderMinutesBefore);
      if (data.settings?.pushEnabled) setPushEnabled(data.settings.pushEnabled);
    } catch {
      toast.error(t(`${S}.loadFailed`));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadCalendars = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/google-calendar/calendars", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json()) as { calendars?: CalendarListItem[]; connected?: boolean };
      if (data.connected && data.calendars) {
        setCalendars(data.calendars);
        if (!selectedCalendarId && data.calendars[0]) {
          setSelectedCalendarId(data.calendars[0]!.id);
        }
      }
    } catch {
      setCalendars([]);
    }
  }, [selectedCalendarId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (wizardOpen && status.connected) {
      setWizardStep(0);
      void loadCalendars();
    }
  }, [wizardOpen, status.connected, loadCalendars]);

  const handleConnect = () => {
    window.location.href = buildGoogleCalendarConnectUrl("/?w=settings&calendar=wizard");
  };

  const handleActivate = async () => {
    if (!consentChecked) {
      toast.error(t(`${S}.consentRequired`));
      return;
    }
    if (!selectedCalendarId) {
      toast.error(t(`${S}.calendarRequired`));
      return;
    }
    setActivating(true);
    try {
      const cal = calendars.find((c) => c.id === selectedCalendarId);
      const res = await fetch("/api/integrations/google-calendar/settings/activate", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true,
          syncMode,
          calendarId: selectedCalendarId,
          calendarSummary: cal?.summary,
          calendarColor: cal?.backgroundColor ?? undefined,
          pushEnabled,
          reminderMinutesBefore: reminderMinutes,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? t(`${S}.activateFailed`));
      toast.success(t(`${S}.activateSuccess`));
      setWizardStep(-1);
      await loadStatus();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t(`${S}.activateFailed`));
    } finally {
      setActivating(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/google-calendar/sync", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? t(`${S}.syncFailed`));
      toast.success(t(`${S}.syncSuccess`));
      await loadStatus();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t(`${S}.syncFailed`));
    } finally {
      setSyncing(false);
    }
  };

  const handlePause = async () => {
    try {
      const res = await fetch("/api/integrations/google-calendar/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pause: true }),
      });
      if (!res.ok) throw new Error();
      toast.success(t(`${S}.paused`));
      await loadStatus();
    } catch {
      toast.error(t(`${S}.pauseFailed`));
    }
  };

  if (loading) {
    return (
      <section className="pt-6 border-t border-[color:var(--border-main)]/30 flex justify-center py-8">
        <Loader2 className="animate-spin text-violet-500" size={24} />
      </section>
    );
  }

  const showWizard = wizardStep >= 0 && (wizardOpen || (!status.active && status.connected));

  return (
    <section className="pt-6 border-t border-[color:var(--border-main)]/30">
      <div className="flex items-center gap-2 mb-4">
        <Calendar size={18} className="text-violet-500" />
        <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
          {t(`${S}.sectionTitle`)}
        </h3>
      </div>

      <p className="text-xs text-[color:var(--foreground-muted)] mb-4 leading-relaxed max-w-xl">
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
            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 mb-4">
              <p className="text-sm text-[color:var(--foreground-main)] mb-3">{t(`${S}.suggestBody`)}</p>
              {!status.connected ? (
                <button
                  type="button"
                  onClick={handleConnect}
                  className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-sm font-bold"
                >
                  {t(`${S}.connectCta`)}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setWizardStep(0);
                    void loadCalendars();
                  }}
                  className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-sm font-bold"
                >
                  {t(`${S}.setupCta`)}
                </button>
              )}
            </div>
          ) : null}

          {status.active ? (
            <div className="space-y-3 mb-4">
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {t(`${S}.activeLabel`, {
                  mode:
                    status.settings?.syncMode === "BIDIRECTIONAL"
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
                  {t(`${S}.lastSync`, {
                    at: new Date(status.settings.lastSyncAt).toLocaleString(),
                  })}
                </p>
              ) : null}
              {status.settings?.lastSyncError ? (
                <p className="text-xs text-red-500">{status.settings.lastSyncError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleSyncNow()}
                  disabled={syncing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-[color:var(--border-main)]"
                >
                  {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  {t(`${S}.syncNow`)}
                </button>
                <button
                  type="button"
                  onClick={() => void handlePause()}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]"
                >
                  {t(`${S}.pause`)}
                </button>
              </div>
            </div>
          ) : null}

          {showWizard && status.connected ? (
            <div className="rounded-2xl border border-[color:var(--border-main)] p-4 space-y-4 bg-[color:var(--surface-card)]/30">
              <h4 className="font-bold text-sm">{t(`${S}.wizardTitle`)}</h4>

              {wizardStep === 0 ? (
                <>
                  <label className="text-xs font-bold text-[color:var(--foreground-muted)]">
                    {t(`${S}.pickCalendar`)}
                  </label>
                  <select
                    value={selectedCalendarId}
                    onChange={(e) => setSelectedCalendarId(e.target.value)}
                    className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 py-2 px-3 text-sm"
                  >
                    {calendars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.summary}
                        {c.primary ? ` (${t(`${S}.primary`)})` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    disabled={!selectedCalendarId}
                    className="bg-violet-600 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
                  >
                    {t(`${S}.next`)}
                  </button>
                </>
              ) : null}

              {wizardStep === 1 ? (
                <>
                  <p className="text-xs font-bold text-[color:var(--foreground-muted)]">
                    {t(`${S}.pickSyncMode`)}
                  </p>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="syncMode"
                      checked={syncMode === "READ_ONLY"}
                      onChange={() => setSyncMode("READ_ONLY")}
                      className="mt-1"
                    />
                    <span>
                      <strong>{t(`${S}.modeReadOnly`)}</strong>
                      <br />
                      <span className="text-xs text-[color:var(--foreground-muted)]">
                        {t(`${S}.modeReadOnlyDesc`)}
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="syncMode"
                      checked={syncMode === "BIDIRECTIONAL"}
                      onChange={() => setSyncMode("BIDIRECTIONAL")}
                      className="mt-1"
                    />
                    <span>
                      <strong>{t(`${S}.modeBidirectional`)}</strong>
                      <br />
                      <span className="text-xs text-[color:var(--foreground-muted)]">
                        {t(`${S}.modeBidirectionalDesc`)}
                      </span>
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setWizardStep(0)} className="text-sm font-bold">
                      {t(`${S}.back`)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      className="bg-violet-600 text-white px-4 py-2 rounded-xl text-sm font-bold"
                    >
                      {t(`${S}.next`)}
                    </button>
                  </div>
                </>
              ) : null}

              {wizardStep === 2 ? (
                <>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={consentChecked}
                      onChange={(e) => setConsentChecked(e.target.checked)}
                      className="mt-1"
                    />
                    <span>{t(`${S}.consentText`)}</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pushEnabled}
                      onChange={(e) => setPushEnabled(e.target.checked)}
                    />
                    <span>{t(`${S}.enablePush`)}</span>
                  </label>
                  {pushEnabled ? (
                    <select
                      value={reminderMinutes}
                      onChange={(e) => setReminderMinutes(Number(e.target.value))}
                      className="w-full rounded-xl border border-[color:var(--border-main)] py-2 px-3 text-sm"
                    >
                      {[5, 10, 15, 30, 60].map((m) => (
                        <option key={m} value={m}>
                          {t(`${S}.minutesBefore`, { minutes: String(m) })}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setWizardStep(1)} className="text-sm font-bold">
                      {t(`${S}.back`)}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleActivate()}
                      disabled={activating}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2"
                    >
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
