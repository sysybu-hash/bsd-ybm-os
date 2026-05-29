"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { SITE_FEEDBACK_MESSAGE_MIN } from "@/lib/validation/schemas/site-feedback";

type Props = Readonly<{
  context?: "marketing" | "app";
  className?: string;
  onSuccess?: () => void;
}>;

type FeedbackErrorBody = {
  error?: string;
  issues?: Record<string, string[] | undefined>;
};

function readFeedbackError(body: unknown): FeedbackErrorBody | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const issues =
    record.issues && typeof record.issues === "object"
      ? (record.issues as Record<string, string[] | undefined>)
      : undefined;
  return {
    error: typeof record.error === "string" ? record.error : undefined,
    issues,
  };
}

export default function SiteFeedbackForm({ context = "app", className = "", onSuccess }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const resolveApiError = (status: number, body: FeedbackErrorBody | null): string => {
    if (status === 503 || body?.error === "send_failed") {
      return t("siteFeedback.errorMail");
    }
    if (body?.error === "validation_failed") {
      const messageIssues = body.issues?.message;
      if (messageIssues?.includes("message_too_short")) {
        return t("siteFeedback.messageTooShort", { min: String(SITE_FEEDBACK_MESSAGE_MIN) });
      }
      if (body.issues?.email?.includes("email_invalid")) {
        return t("siteFeedback.emailInvalid");
      }
      if (body.issues?.name?.includes("name_required")) {
        return t("siteFeedback.nameRequired");
      }
    }
    return t("siteFeedback.error");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const trimmedMessage = message.trim();
    if (trimmedMessage.length < SITE_FEEDBACK_MESSAGE_MIN) {
      toast.error(t("siteFeedback.messageTooShort", { min: String(SITE_FEEDBACK_MESSAGE_MIN) }));
      return;
    }

    setBusy(true);
    try {
      const pageUrl = typeof window !== "undefined" ? window.location.href : undefined;
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          message: trimmedMessage,
          pageUrl,
          context,
        }),
      });
      if (!res.ok) {
        const body = readFeedbackError(await res.json().catch(() => null));
        toast.error(resolveApiError(res.status, body));
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
          minLength={SITE_FEEDBACK_MESSAGE_MIN}
          maxLength={4000}
        />
        <span className="text-xs font-normal text-[color:var(--foreground-muted)]">
          {t("siteFeedback.messageHint", { min: String(SITE_FEEDBACK_MESSAGE_MIN) })}
        </span>
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
