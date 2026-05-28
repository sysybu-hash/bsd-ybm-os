"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { toast } from "sonner";

/** User lookup, broadcast notification, and test-email — independent of org/subscription state. */
export function usePlatformAdminUtils(loadHealth: () => Promise<void>) {
  const { t } = useI18n();
  const [userEmail, setUserEmail] = useState("");
  const [userLookup, setUserLookup] = useState<Record<string, unknown> | null>(null);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);

  const handleLookupUser = useCallback(async () => {
    const email = userEmail.trim().toLowerCase();
    if (!email) return;
    const res = await fetch(`/api/admin/check-user?email=${encodeURIComponent(email)}`, { credentials: "include" });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? t("platformAdmin.searchFailed")); return; }
    setUserLookup(data);
  }, [userEmail]);

  const handleBroadcast = useCallback(async () => {
    const res = await fetch("/api/admin/broadcast-notification", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: broadcastTitle, body: broadcastBody }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? t("platformAdmin.broadcastFailed")); return; }
    toast.success(t("platformAdmin.broadcastSentN").replace("{n}", String(data.count ?? 0)));
    setBroadcastTitle("");
    setBroadcastBody("");
  }, [broadcastTitle, broadcastBody]);

  const handleTestEmail = useCallback(async () => {
    setTestingEmail(true);
    try {
      const res = await fetch("/api/admin/test-email", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = (await res.json()) as { ok?: boolean; to?: string; error?: string };
      if (j.ok) toast.success(t("platformAdmin.testEmailSentTo"));
      else toast.error(j.error ?? t("platformAdmin.testEmailFailed"));
      void loadHealth();
    } finally {
      setTestingEmail(false);
    }
  }, [loadHealth]);

  return {
    userEmail, setUserEmail, userLookup, setUserLookup,
    broadcastTitle, setBroadcastTitle, broadcastBody, setBroadcastBody,
    testingEmail,
    handleLookupUser, handleBroadcast, handleTestEmail,
  };
}
