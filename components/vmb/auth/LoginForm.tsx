"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useVmbBase, vmbPath } from "@/components/vmb/VmbLink";

export type LoginLabels = {
  google: string;
  googleOff: string;
  or: string;
  tabLogin: string;
  tabRegister: string;
  name: string;
  email: string;
  password: string;
  passwordHint: string;
  submit: string;
  submitRegister: string;
  busy: string;
  errors: Record<string, string>;
};

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.1 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z" />
    </svg>
  );
}

const FIELD =
  "mt-2 block w-full rounded-2xl border border-[color:var(--vmb-line-strong)] bg-white/[.03] px-4 py-3.5 text-sm outline-none transition focus:border-[color:var(--vmb-accent)] focus:ring-4 focus:ring-[color:var(--vmb-accent-soft)]";

/** Google first; email + password as the second way in, with a sign-in / sign-up switch. */
export function LoginForm({ labels, googleEnabled, initialError }: { labels: LoginLabels; googleEnabled: boolean; initialError?: string }) {
  const router = useRouter();
  const base = useVmbBase();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ? (labels.errors[initialError] ?? labels.errors.server ?? null) : null);
  const next = vmbPath(base, "/app");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const body = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      ...(mode === "register" && form.get("name") ? { name: String(form.get("name")) } : {}),
    };
    try {
      const res = await fetch(`/api/vmb/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.replace(next);
        router.refresh();
        return;
      }
      const code = res.status === 429 ? "rate" : ((await res.json().catch(() => null)) as { code?: string } | null)?.code;
      setError(labels.errors[code ?? "server"] ?? labels.errors.server ?? null);
    } catch {
      setError(labels.errors.server ?? null);
    }
    setBusy(false);
  };

  return (
    <div>
      {googleEnabled ? (
        <a
          href={`/api/vmb/auth/google?next=${encodeURIComponent(next)}`}
          className="mt-10 flex w-full items-center justify-center gap-3 rounded-full bg-white px-4 py-4 text-sm font-medium text-black transition hover:bg-white/90"
        >
          <GoogleG />
          {labels.google}
        </a>
      ) : (
        <>
          <button
            type="button"
            disabled
            aria-describedby="vmb-google-off"
            className="mt-10 flex w-full cursor-not-allowed items-center justify-center gap-3 rounded-full bg-white px-4 py-4 text-sm font-medium text-black opacity-70"
          >
            <GoogleG />
            {labels.google}
          </button>
          <p id="vmb-google-off" className="mt-3 text-xs text-[color:var(--vmb-warn)]">
            {labels.googleOff}
          </p>
        </>
      )}
      <div className="my-8 flex items-center gap-4 text-xs text-[color:var(--vmb-muted)]">
        <span className="h-px flex-1 bg-[color:var(--vmb-line)]" />
        {labels.or}
        <span className="h-px flex-1 bg-[color:var(--vmb-line)]" />
      </div>
      <div className="mb-6 flex rounded-full bg-white/[.05] p-1 text-sm" role="tablist">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 rounded-full py-2 transition ${mode === m ? "bg-white/10 font-medium" : "text-[color:var(--vmb-muted)]"}`}
          >
            {m === "login" ? labels.tabLogin : labels.tabRegister}
          </button>
        ))}
      </div>
      <form className="space-y-5" onSubmit={submit}>
        {mode === "register" ? (
          <label className="block text-sm text-[color:var(--vmb-ink-soft)]">
            {labels.name}
            <input type="text" name="name" autoComplete="name" className={FIELD} maxLength={120} />
          </label>
        ) : null}
        <label className="block text-sm text-[color:var(--vmb-ink-soft)]">
          {labels.email}
          <input type="email" name="email" autoComplete="email" dir="ltr" className={FIELD} required />
        </label>
        <label className="block text-sm text-[color:var(--vmb-ink-soft)]">
          {labels.password}
          <input
            type="password"
            name="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            dir="ltr"
            className={FIELD}
            required
            minLength={mode === "register" ? 12 : 1}
          />
          {mode === "register" ? <span className="mt-2 block text-xs text-[color:var(--vmb-muted)]">{labels.passwordHint}</span> : null}
        </label>
        {error ? (
          <p role="alert" className="rounded-xl bg-[color:var(--vmb-fail)]/10 px-4 py-3 text-sm text-[color:var(--vmb-fail)]">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-[color:var(--vmb-accent)] px-4 py-4 text-sm font-medium text-[color:var(--vmb-accent-ink)] transition-transform hover:-translate-y-px disabled:opacity-60"
        >
          {busy ? labels.busy : mode === "login" ? labels.submit : labels.submitRegister}
        </button>
      </form>
    </div>
  );
}
