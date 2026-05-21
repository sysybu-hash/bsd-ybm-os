"use client";

import { useCallback, useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { passwordMeetsRules } from "@/lib/auth/client-password";

type PasskeyRow = {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export default function PasskeySecuritySection() {
  const { t } = useI18n();
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/passkey/list");
      const data = (await res.json()) as { passkeys?: PasskeyRow[] };
      if (res.ok) setPasskeys(data.passkeys ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addPasskey = async () => {
    if (busy || typeof window === "undefined" || !window.PublicKeyCredential) {
      toast.error(t("auth.hub.passkey.unsupported"));
      return;
    }
    setBusy(true);
    try {
      const optRes = await fetch("/api/auth/passkey/register-options", { method: "POST" });
      const optData = (await optRes.json()) as { options?: Parameters<typeof startRegistration>[0] };
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
      await load();
    } catch (e) {
      console.error(e);
      toast.error(t("auth.hub.passkey.registerFailed"));
    } finally {
      setBusy(false);
    }
  };

  const removePasskey = async (id: string) => {
    const res = await fetch(`/api/auth/passkey/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(t("auth.hub.passkey.deleteFailed"));
      return;
    }
    toast.success(t("auth.hub.passkey.deleted"));
    await load();
  };

  const savePassword = async () => {
    if (!passwordMeetsRules(newPassword)) {
      toast.error(t("auth.hub.register.passwordRequirements"));
      return;
    }
    setPwdBusy(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: newPassword,
          currentPassword: currentPassword || undefined,
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? data.message ?? "שגיאה");
        return;
      }
      toast.success(data.message ?? t("auth.hub.security.passwordSaved"));
      setNewPassword("");
      setCurrentPassword("");
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-bold mb-2">{t("auth.hub.security.passwordTitle")}</h4>
        <p className="text-xs text-[color:var(--foreground-muted)] mb-3">{t("auth.hub.security.passwordDesc")}</p>
        <input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder={t("auth.hub.security.currentPassword")}
          className="mb-2 w-full rounded-lg border border-[color:var(--border-main)] bg-transparent p-2.5 text-sm"
        />
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={t("auth.hub.security.newPassword")}
          className="mb-2 w-full rounded-lg border border-[color:var(--border-main)] bg-transparent p-2.5 text-sm"
        />
        <button
          type="button"
          disabled={pwdBusy}
          onClick={() => void savePassword()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
        >
          {pwdBusy ? "…" : t("auth.hub.security.savePassword")}
        </button>
      </div>

      <div className="border-t border-[color:var(--border-main)]/30 pt-4">
        <h4 className="text-sm font-bold mb-2 flex items-center gap-2">
          <Fingerprint size={16} aria-hidden />
          {t("auth.hub.security.passkeyTitle")}
        </h4>
        <p className="text-xs text-[color:var(--foreground-muted)] mb-3">{t("auth.hub.security.passkeyDesc")}</p>
        {loading ? (
          <Loader2 className="animate-spin text-indigo-500" size={20} />
        ) : (
          <ul className="mb-3 space-y-2">
            {passkeys.length === 0 ? (
              <li className="text-xs text-[color:var(--foreground-muted)]">{t("auth.hub.security.noPasskeys")}</li>
            ) : (
              passkeys.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-sm"
                >
                  <span>{p.deviceName ?? t("auth.hub.passkey.defaultDevice")}</span>
                  <button
                    type="button"
                    onClick={() => void removePasskey(p.id)}
                    className="text-rose-600 hover:text-rose-500"
                    aria-label={t("auth.hub.passkey.delete")}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void addPasskey()}
          className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-xs font-bold text-indigo-700 dark:text-indigo-200 disabled:opacity-60"
        >
          {busy ? "…" : t("auth.hub.security.addPasskey")}
        </button>
      </div>
    </div>
  );
}
