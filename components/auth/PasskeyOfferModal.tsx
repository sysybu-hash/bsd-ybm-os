"use client";

import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";

const STORAGE_KEY = "bsd-passkey-offer-dismissed";

export default function PasskeyOfferModal() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.PublicKeyCredential) return;
    if (localStorage.getItem(STORAGE_KEY) === "1") return;
    const tmr = window.setTimeout(() => setOpen(true), 1200);
    return () => window.clearTimeout(tmr);
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  const register = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const optRes = await fetch("/api/auth/passkey/register-options", { method: "POST" });
      const optData = (await optRes.json()) as {
        options?: Parameters<typeof startRegistration>[0];
      };
      if (!optRes.ok || !optData.options) {
        toast.error(t("auth.hub.passkey.registerFailed"));
        return;
      }
      const reg = await startRegistration(optData.options);
      const verifyRes = await fetch("/api/auth/passkey/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: reg, deviceName: t("auth.hub.passkey.defaultDevice") }),
      });
      if (!verifyRes.ok) {
        toast.error(t("auth.hub.passkey.registerFailed"));
        return;
      }
      toast.success(t("auth.hub.passkey.registerSuccess"));
      dismiss();
    } catch (e) {
      console.error("passkey offer", e);
      toast.error(t("auth.hub.passkey.registerFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2500] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-labelledby="passkey-offer-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-500">
            <Fingerprint size={24} aria-hidden />
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg p-2 text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
            aria-label={t("auth.hub.passkey.dismiss")}
          >
            <X size={18} />
          </button>
        </div>
        <h2 id="passkey-offer-title" className="text-lg font-black">
          {t("auth.hub.passkey.offerTitle")}
        </h2>
        <p className="mt-2 text-sm text-[color:var(--foreground-muted)]">{t("auth.hub.passkey.offerBody")}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={busy}
            onClick={() => void register()}
            className="flex-1 rounded-xl bg-[color:var(--accent)] py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {busy ? "…" : t("auth.hub.passkey.offerEnable")}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-xl border border-[color:var(--border-main)] px-4 py-3 text-sm font-bold"
          >
            {t("auth.hub.passkey.offerLater")}
          </button>
        </div>
      </div>
    </div>
  );
}
