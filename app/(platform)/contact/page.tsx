"use client";

import React, { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: "contact-page" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) { setErrMsg(json.error ?? "שגיאה"); setState("error"); return; }
      void import("@/lib/analytics/marketing-funnel").then(({ trackFunnelLeadSubmitted }) => {
        trackFunnelLeadSubmitted("contact-page");
      });
      setState("success");
    } catch {
      setErrMsg("שגיאת רשת — נסה שוב"); setState("error");
    }
  };

  if (state === "success") {
    return (
      <main dir="rtl" className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <CheckCircle2 size={52} className="mx-auto mb-4 text-emerald-500" />
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">קיבלנו! תודה.</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">ניצור איתך קשר בקרוב.</p>
        </div>
      </main>
    );
  }

  return (
    <main dir="rtl" className="mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-black text-slate-900 dark:text-white">צור קשר</h1>
      <p className="mb-8 text-slate-600 dark:text-slate-400">
        יש שאלה? רוצה הדגמה? מלא את הטופס ונחזור אליך תוך יום עסקים.
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <label htmlFor="contact-name" className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-300">שם מלא *</label>
          <input id="contact-name" required className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900"
            value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label htmlFor="contact-email" className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-300">אימייל *</label>
          <input id="contact-email" type="email" required className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900"
            value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <div>
          <label htmlFor="contact-phone" className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-300">טלפון</label>
          <input id="contact-phone" type="tel" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900"
            value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </div>
        <div>
          <label htmlFor="contact-message" className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-300">הודעה</label>
          <textarea id="contact-message" rows={4} className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900"
            value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
        </div>

        {state === "error" ? <p className="text-sm text-rose-600">{errMsg}</p> : null}

        <button type="submit" disabled={state === "sending"}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60">
          {state === "sending" ? <Loader2 size={18} className="animate-spin" /> : null}
          שלח הודעה
        </button>

        <p className="text-center text-[11px] text-slate-400">
          בשליחה אתה מסכים לקבל מאיתנו מידע רלוונטי.{" "}
          <a href="/privacy" className="underline">מדיניות פרטיות</a>
        </p>
      </form>
    </main>
  );
}
