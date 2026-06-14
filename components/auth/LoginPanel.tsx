"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import PasskeyLoginButton from "@/components/auth/PasskeyLoginButton";
import {
  readRememberPreference,
  SESSION_MAX_AGE_DEFAULT_SEC,
  SESSION_MAX_AGE_REMEMBER_SEC,
  writeRememberPreference,
} from "@/lib/auth/remember-preference";
import { loginErrorMessages, loginReasonMessages } from "@/lib/auth/login-messages";
import { AUTH_INPUT, AUTH_BTN_PRIMARY, AUTH_BTN_SECONDARY } from "@/components/auth/auth-ui";

type Props = {
  t: (key: string) => string;
  prefilledEmail?: string;
  onForgotPassword?: () => void;
};

export default function LoginPanel({ t, prefilledEmail = "", onForgotPassword }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [credsLoading, setCredsLoading] = useState(false);
  const [resetToken] = useState(() => params.get("reset")?.trim() ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    setRemember(readRememberPreference());
  }, []);

  useEffect(() => {
    if (prefilledEmail) setEmail(prefilledEmail);
  }, [prefilledEmail]);

  const authError = params.get("error");
  const oauthHint = params.get("hint");
  const reason = params.get("reason") ?? authError;

  const bannerText =
    (oauthHint === "redirect_uri" ? loginErrorMessages.redirect_uri_mismatch : null) ||
    (authError && loginErrorMessages[authError]) ||
    (reason && loginReasonMessages[reason as keyof typeof loginReasonMessages]) ||
    null;

  const handleGoogle = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    writeRememberPreference(remember);
    try {
      await signIn("google", { callbackUrl: "/" });
    } catch {
      setGoogleLoading(false);
    }
  };

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error(t("auth.hub.login.errorEmpty"));
      return;
    }
    setCredsLoading(true);
    writeRememberPreference(remember);
    const maxAge = remember ? SESSION_MAX_AGE_REMEMBER_SEC : SESSION_MAX_AGE_DEFAULT_SEC;
    try {
      const result = await signIn(
        "credentials",
        {
          email: email.trim().toLowerCase(),
          password,
          redirect: false,
          callbackUrl: "/",
        },
        { maxAge: String(maxAge) },
      );
      if (result?.ok) {
        router.push("/");
        return;
      }
      if (result?.error === "CredentialsSignin") {
        toast.error(t("auth.hub.login.errorInvalid"));
      } else {
        toast.error(loginErrorMessages[result?.error ?? ""] ?? loginErrorMessages.Default);
      }
    } finally {
      setCredsLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken || newPassword.length < 12) return;
    setResetBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? data.message ?? t("auth.hub.login.updateError"));
        return;
      }
      toast.success(data.message ?? t("auth.hub.login.updateSuccess"));
      router.replace("/login");
    } finally {
      setResetBusy(false);
    }
  };

  if (resetToken) {
    return (
      <form onSubmit={(e) => void handleReset(e)} className="space-y-4">
        <h3 className="text-lg font-black">{t("auth.hub.reset.title")}</h3>
        <p className="text-sm text-[color:var(--foreground-muted)]">{t("auth.hub.reset.body")}</p>
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={AUTH_INPUT}
          placeholder={t("auth.hub.reset.placeholder")}
        />
        <button
          type="submit"
          disabled={resetBusy || newPassword.length < 12}
          className={AUTH_BTN_PRIMARY}
        >
          {resetBusy ? "…" : t("auth.hub.reset.submit")}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      {bannerText ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-900 dark:text-amber-100">
          {bannerText}
        </p>
      ) : null}

      <PasskeyLoginButton email={email} label={t("auth.hub.login.passkey")} />

      <div className="relative flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-[color:var(--border-main)]" />
        <span className="text-xs font-bold text-[color:var(--foreground-muted)]">{t("auth.login.or")}</span>
        <div className="h-px flex-1 bg-[color:var(--border-main)]" />
      </div>

      <button
        type="button"
        onClick={() => void handleGoogle()}
        disabled={googleLoading}
        className={AUTH_BTN_SECONDARY}
      >
        {googleLoading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
        )}
        {t("auth.loginOs.google")}
      </button>

      <p className="text-center text-xs leading-relaxed text-[color:var(--foreground-muted)]">
        {t("auth.loginOs.googleScopeNote")}{" "}
        <Link href="/privacy" className="font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline">
          {t("auth.loginOs.privacyLink")}
        </Link>
        {" · "}
        <Link href="/terms" className="font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline">
          {t("auth.loginOs.termsLink")}
        </Link>
        {" · "}
        <Link
          href="/integrations/google"
          className="font-semibold text-[color:var(--accent)] underline-offset-2 hover:underline"
        >
          {t("auth.loginOs.googleIntegrationsLink")}
        </Link>
      </p>

      <form onSubmit={(e) => void handleCredentials(e)} className="space-y-3">
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.login.emailPlaceholder")}
          className={AUTH_INPUT}
        />
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("auth.login.passwordPlaceholder")}
          className={AUTH_INPUT}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[color:var(--foreground-muted)]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-[color:var(--border-main)]"
          />
          {t("auth.hub.login.remember")}
        </label>
        <button
          type="submit"
          disabled={credsLoading}
          className={AUTH_BTN_PRIMARY}
        >
          {credsLoading ? "…" : t("auth.login.submit")}
        </button>
      </form>

      {onForgotPassword ? (
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-sm font-bold text-[color:var(--accent)] hover:underline"
        >
          {t("auth.hub.login.forgot")}
        </button>
      ) : null}
    </div>
  );
}
