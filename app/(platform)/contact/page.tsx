"use client";

import React, { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import PublicPageShell from "@/components/landing/marketing/PublicPageShell";
import { useI18n } from "@/components/os/system/I18nProvider";

const FIELD_CLS =
  "w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-4 py-2.5 text-sm shadow-sm focus:border-[color:var(--brand-accent,#4f46e5)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-accent,#4f46e5)]/20";

export default function ContactPage() {
  const { t } = useI18n();
  const tc = (suffix: string) => t(`marketingHome.contactPage.${suffix}`);
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  const handleSubmit = async () => {
    setState("sending");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: "contact-page" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErrMsg(json.error ?? tc("genericError"));
        setState("error");
        return;
      }
      void import("@/lib/analytics/marketing-funnel").then(({ trackFunnelLeadSubmitted }) => {
        trackFunnelLeadSubmitted("contact-page");
      });
      setState("success");
    } catch {
      setErrMsg(tc("networkError"));
      setState("error");
    }
  };

  return (
    <PublicPageShell
      heroTitle={tc("title")}
      heroSubtitle={state === "success" ? undefined : tc("subtitle")}
    >
      {state === "success" ? (
        <div className="flex min-h-[40vh] items-center justify-center px-4">
          <div className="text-center">
            <CheckCircle2 size={52} className="mx-auto mb-4 text-emerald-500" aria-hidden />
            <h2 className="text-2xl font-black">{tc("successTitle")}</h2>
            <p className="mt-2 text-[color:var(--foreground-muted)]">{tc("successBody")}</p>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-xl px-4 py-10">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="space-y-4"
          >
            <div>
              <label htmlFor="contact-name" className="mb-1 block text-sm font-bold">
                {tc("nameLabel")}
              </label>
              <input
                id="contact-name"
                required
                className={FIELD_CLS}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="contact-email" className="mb-1 block text-sm font-bold">
                {tc("emailLabel")}
              </label>
              <input
                id="contact-email"
                type="email"
                required
                className={FIELD_CLS}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="contact-phone" className="mb-1 block text-sm font-bold">
                {tc("phoneLabel")}
              </label>
              <input
                id="contact-phone"
                type="tel"
                className={FIELD_CLS}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="contact-message" className="mb-1 block text-sm font-bold">
                {tc("messageLabel")}
              </label>
              <textarea
                id="contact-message"
                rows={4}
                className={`${FIELD_CLS} resize-none`}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              />
            </div>

            {state === "error" ? <p className="text-sm text-rose-600">{errMsg}</p> : null}

            <button
              type="submit"
              disabled={state === "sending"}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--brand-accent,#4f46e5)] py-3 font-bold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {state === "sending" ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
              {tc("submit")}
            </button>

            <p className="text-center text-[11px] text-[color:var(--foreground-muted)]">
              {tc("consent")}{" "}
              <a href="/privacy" className="underline">
                {tc("privacyLink")}
              </a>
            </p>
          </form>
        </div>
      )}
    </PublicPageShell>
  );
}
