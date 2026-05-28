"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  context?: "marketing" | "app";
  className?: string;
  onSuccess?: () => void;
}>;

export default function SiteFeedbackForm({ context = "app", className = "", onSuccess }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const pageUrl = typeof window !== "undefined" ? window.location.href : undefined;
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone: phone.trim() || undefined,
          message,
          pageUrl,
          context,
        }),
      });
      if (!res.ok) {
        toast.error(t("siteFeedback.error"));
        return;
      }
      toast.success(t("siteFeedback.success"));
      setName("");
      setEmail("");
      setPhone("");
      setMessage("");
      onSuccess?.();
    } catch {
      toast.error(t("siteFeedback.error"));
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm text-[color:var(--foreground-main)] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25";

  return (
    <form onSubmit={(e) => void submit(e)} className={`flex flex-col gap-4 ${className}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          <span>{t("siteFeedback.name")}</span>
          <input
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            maxLength={120}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          <span>{t("siteFeedback.email")}</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            maxLength={254}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        <span>{t("siteFeedback.phone")}</span>
        <input
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
          maxLength={40}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        <span>{t("siteFeedback.message")}</span>
        <textarea
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${inputClass} resize-y min-h-[120px]`}
          maxLength={4000}
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-black text-white transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {busy ? t("siteFeedback.sending") : t("siteFeedback.submit")}
      </button>
    </form>
  );
}
