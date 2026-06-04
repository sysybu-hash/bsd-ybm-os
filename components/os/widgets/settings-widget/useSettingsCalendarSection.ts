"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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

export type { CalendarListItem, CalendarSettingsResponse };

export function useSettingsCalendarSection(t: (key: string, vars?: Record<string, string>) => string) {
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

  useEffect(() => { void loadStatus(); }, [loadStatus]);
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
    if (!consentChecked) { toast.error(t(`${S}.consentRequired`)); return; }
    if (!selectedCalendarId) { toast.error(t(`${S}.calendarRequired`)); return; }
    setActivating(true);
    try {
      const cal = calendars.find((c) => c.id === selectedCalendarId);
      const res = await fetch("/api/integrations/google-calendar/settings/activate", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true, syncMode, calendarId: selectedCalendarId,
          calendarSummary: cal?.summary,
          calendarColor: cal?.backgroundColor ?? undefined,
          pushEnabled, reminderMinutesBefore: reminderMinutes,
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
        method: "POST", credentials: "include",
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
        method: "PUT", credentials: "include",
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

  const showWizard = wizardStep >= 0 && (wizardOpen || (!status.active && status.connected));

  return {
    S, loading, status, calendars, wizardStep, setWizardStep,
    selectedCalendarId, setSelectedCalendarId,
    syncMode, setSyncMode,
    consentChecked, setConsentChecked,
    pushEnabled, setPushEnabled,
    reminderMinutes, setReminderMinutes,
    activating, syncing, showWizard,
    loadCalendars,
    handleConnect, handleActivate, handleSyncNow, handlePause,
  };
}
