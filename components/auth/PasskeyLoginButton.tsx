"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import {
  readRememberPreference,
  SESSION_MAX_AGE_DEFAULT_SEC,
  SESSION_MAX_AGE_REMEMBER_SEC,
  writeRememberPreference,
} from "@/lib/auth/remember-preference";

export default function PasskeyLoginButton({
  email,
  label,
}: {
  email?: string;
  label: string;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  if (typeof window !== "undefined" && !window.PublicKeyCredential) {
    return null;
  }

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const optRes = await fetch("/api/auth/passkey/auth-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email?.trim() || undefined }),
      });
      const optData = (await optRes.json()) as {
        ok?: boolean;
        options?: Parameters<typeof startAuthentication>[0];
        challengeKey?: string;
        error?: string;
      };
      if (!optRes.ok || !optData.options || !optData.challengeKey) {
        toast.error(optData.error ?? t("auth.hub.passkey.loginUnavailable"));
        return;
      }
      const authResp = await startAuthentication(optData.options);
      const verifyRes = await fetch("/api/auth/passkey/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: authResp,
          challengeKey: optData.challengeKey,
        }),
      });
      const verifyData = (await verifyRes.json()) as {
        signInToken?: string;
        error?: string;
      };
      if (!verifyRes.ok || !verifyData.signInToken) {
        toast.error(verifyData.error ?? t("auth.hub.passkey.verifyFailed"));
        return;
      }
      const remember = readRememberPreference();
      const maxAge = remember ? SESSION_MAX_AGE_REMEMBER_SEC : SESSION_MAX_AGE_DEFAULT_SEC;
      const result = await signIn(
        "credentials",
        {
          signInToken: verifyData.signInToken,
          redirect: false,
          callbackUrl: "/",
        },
        { maxAge: String(maxAge) },
      );
      if (result?.error) {
        toast.error(t("auth.hub.passkey.loginFailed"));
        return;
      }
      writeRememberPreference(remember);
      window.location.href = "/";
    } catch (e) {
      console.error("passkey login", e);
      toast.error(t("auth.hub.passkey.loginCancelled"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void run()}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-5 text-sm font-black text-indigo-700 transition hover:bg-indigo-500/15 disabled:opacity-60 dark:text-indigo-200"
    >
      {busy ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
      ) : (
        <Fingerprint size={18} aria-hidden />
      )}
      {label}
    </button>
  );
}
