"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  Library,
  Link2,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Save,
  Share2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  defaultNotebookLMSettings,
  loadNotebookLMSettings,
  NOTEBOOKLM_APP_URL,
  type NotebookLMSettings,
  saveNotebookLMSettings,
} from "@/lib/notebooklm-settings";

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/40 p-3 transition hover:bg-[color:var(--surface-card)]/70">
      <span className="min-w-0">
        <span className="block text-xs font-black text-[color:var(--foreground-main)]">{label}</span>
        {description ? <span className="mt-0.5 block text-[10px] font-semibold text-[color:var(--foreground-muted)]">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 rounded border-[color:var(--border-main)] text-amber-600 focus:ring-amber-500/40"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export default function NotebookLMWidget() {
  const [settings, setSettings] = useState<NotebookLMSettings>(defaultNotebookLMSettings);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(loadNotebookLMSettings());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: NotebookLMSettings) => {
    setSettings(next);
    saveNotebookLMSettings(next);
  }, []);

  const handleSave = () => {
    saveNotebookLMSettings(settings);
    toast.success("הגדרות NotebookLM נשמרו במכשיר זה");
  };

  const handleReset = () => {
    const fresh = defaultNotebookLMSettings();
    persist(fresh);
    toast.message("אופסו הגדרות ברירת המחדל");
  };

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center bg-[color:var(--background-main)] text-[color:var(--foreground-muted)]" dir="rtl">
        <RefreshCw className="h-8 w-8 animate-spin opacity-40" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden bg-[color:var(--background-main)] text-[color:var(--foreground-main)]" dir="rtl">
      <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/90 px-3 py-3 backdrop-blur-md sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 sm:h-11 sm:w-11">
            <Library size={20} aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black tracking-wide text-[color:var(--foreground-main)]">NotebookLM</h3>
            <p className="text-[10px] font-bold text-[color:var(--foreground-muted)]">העדפות מקומיות · פתיחה ב-Google</p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          <a
            href={NOTEBOOKLM_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2.5 text-[11px] font-black text-white shadow-md shadow-amber-900/20 transition hover:bg-amber-500 sm:col-span-1 sm:px-4"
          >
            <ExternalLink size={14} aria-hidden />
            פתח ב-Google
          </a>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2.5 text-[11px] font-black transition hover:bg-[color:var(--surface-soft)]"
          >
            <Save size={14} aria-hidden />
            שמור
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[color:var(--border-main)] px-3 py-2.5 text-[11px] font-bold text-[color:var(--foreground-muted)] transition hover:bg-rose-500/10 hover:text-rose-300"
          >
            <RotateCcw size={14} aria-hidden />
            איפוס
          </button>
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-4">
        <div className="mx-auto max-w-3xl space-y-5 pb-4">
          <section className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/30 p-3 sm:p-4">
            <div className="mb-2 flex items-center gap-2 text-[color:var(--foreground-muted)]">
              <BookOpen size={15} aria-hidden />
              <h4 className="text-[11px] font-black uppercase tracking-widest">מחברת</h4>
            </div>
            <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">שם (תצוגה ב-OS בלבד)</label>
            <input
              type="text"
              value={settings.notebookTitle}
              onChange={(e) => persist({ ...settings, notebookTitle: e.target.value })}
              placeholder="למשל: תקציב 2026..."
              className="mb-3 w-full min-w-0 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-3 py-2.5 text-sm text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
            <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">הערות פנימיות</label>
            <textarea
              value={settings.notebookNotes}
              onChange={(e) => persist({ ...settings, notebookNotes: e.target.value })}
              rows={3}
              placeholder="קישורים, הקשר..."
              className="w-full min-w-0 resize-y rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-3 py-2 text-sm text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </section>

          <section className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/30 p-3 sm:p-4">
            <div className="mb-2 flex min-w-0 items-center gap-2 text-[color:var(--foreground-muted)]">
              <Link2 size={15} aria-hidden />
              <h4 className="min-w-0 truncate text-[11px] font-black uppercase tracking-widest">סוגי מקורות</h4>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleRow label="PDF" checked={settings.sources.pdf} onChange={(v) => persist({ ...settings, sources: { ...settings.sources, pdf: v } })} />
              <ToggleRow label="Google Docs" checked={settings.sources.googleDocs} onChange={(v) => persist({ ...settings, sources: { ...settings.sources, googleDocs: v } })} />
              <ToggleRow label="Google Slides" checked={settings.sources.googleSlides} onChange={(v) => persist({ ...settings, sources: { ...settings.sources, googleSlides: v } })} />
              <ToggleRow label="אתרים" description="URL" checked={settings.sources.websites} onChange={(v) => persist({ ...settings, sources: { ...settings.sources, websites: v } })} />
              <ToggleRow label="YouTube" checked={settings.sources.youtube} onChange={(v) => persist({ ...settings, sources: { ...settings.sources, youtube: v } })} />
              <ToggleRow label="Google Drive" checked={settings.sources.googleDrive} onChange={(v) => persist({ ...settings, sources: { ...settings.sources, googleDrive: v } })} />
              <ToggleRow label="מאגרי קוד" checked={settings.sources.codeRepos} onChange={(v) => persist({ ...settings, sources: { ...settings.sources, codeRepos: v } })} />
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/30 p-3 sm:p-4">
            <div className="mb-2 flex items-center gap-2 text-[color:var(--foreground-muted)]">
              <Sparkles size={15} aria-hidden />
              <h4 className="text-[11px] font-black uppercase tracking-widest">Studio</h4>
            </div>
            <p className="mb-2 text-[10px] font-semibold leading-relaxed text-[color:var(--foreground-muted)]">תזכורת בעת עבודה; יצירה ב-Google.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleRow label="סקירה קולית" description="Audio Overview" checked={settings.studio.audioOverview} onChange={(v) => persist({ ...settings, studio: { ...settings.studio, audioOverview: v } })} />
              <ToggleRow label="סקירה בווידאו" description="Video Overview" checked={settings.studio.videoOverview} onChange={(v) => persist({ ...settings, studio: { ...settings.studio, videoOverview: v } })} />
              <ToggleRow label="מפת חשיבה" checked={settings.studio.mindMap} onChange={(v) => persist({ ...settings, studio: { ...settings.studio, mindMap: v } })} />
              <ToggleRow label="דוח מחקר" checked={settings.studio.researchReport} onChange={(v) => persist({ ...settings, studio: { ...settings.studio, researchReport: v } })} />
              <ToggleRow label="בוחן" checked={settings.studio.quiz} onChange={(v) => persist({ ...settings, studio: { ...settings.studio, quiz: v } })} />
              <ToggleRow label="כרטיסיות לימוד" checked={settings.studio.flashcards} onChange={(v) => persist({ ...settings, studio: { ...settings.studio, flashcards: v } })} />
              <ToggleRow label="מסמך תקציר" checked={settings.studio.briefingDoc} onChange={(v) => persist({ ...settings, studio: { ...settings.studio, briefingDoc: v } })} />
              <ToggleRow label="טבלת נתונים" checked={settings.studio.dataTable} onChange={(v) => persist({ ...settings, studio: { ...settings.studio, dataTable: v } })} />
            </div>
          </section>

          <details className="group rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/20 open:bg-[color:var(--surface-card)]/35">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-3 text-sm font-black text-[color:var(--foreground-main)] sm:px-4 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-2">
                <SlidersHorizontal size={16} className="shrink-0 text-[color:var(--foreground-muted)]" aria-hidden />
                <span className="truncate">הרחבה: התאמה אישית, צ׳אט ושיתוף</span>
              </span>
              <ChevronDown size={18} className="shrink-0 text-[color:var(--foreground-muted)] transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-4 border-t border-[color:var(--border-main)]/60 px-3 py-4 sm:px-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">הנחיות מותאמות</label>
                <textarea
                  value={settings.customInstructions}
                  onChange={(e) => persist({ ...settings, customInstructions: e.target.value })}
                  rows={3}
                  placeholder="למשל: התמקד בנתונים פיננסיים..."
                  className="w-full min-w-0 resize-y rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-3 py-2 text-sm text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">סגנון תשובה</label>
                  <select
                    value={settings.responseStyle}
                    onChange={(e) => persist({ ...settings, responseStyle: e.target.value as NotebookLMSettings["responseStyle"] })}
                    className="w-full min-w-0 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-2 text-xs font-bold text-[color:var(--foreground-main)]"
                  >
                    <option value="sources">מבוסס מקורות</option>
                    <option value="balanced">מאוזן</option>
                    <option value="creative">יצירתי יותר</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">אורך תשובה</label>
                  <select
                    value={settings.responseLength}
                    onChange={(e) => persist({ ...settings, responseLength: e.target.value as NotebookLMSettings["responseLength"] })}
                    className="w-full min-w-0 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-2 text-xs font-bold text-[color:var(--foreground-main)]"
                  >
                    <option value="short">קצר</option>
                    <option value="medium">בינוני</option>
                    <option value="long">מפורט</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">שפת צ׳אט</label>
                  <select
                    value={settings.chatLanguage}
                    onChange={(e) => persist({ ...settings, chatLanguage: e.target.value as NotebookLMSettings["chatLanguage"] })}
                    className="w-full min-w-0 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-2 text-xs font-bold text-[color:var(--foreground-main)]"
                  >
                    <option value="he">עברית</option>
                    <option value="en">English</option>
                    <option value="auto">אוטומטי</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-[color:var(--foreground-muted)]">
                  <MessageSquare size={15} aria-hidden />
                  <h4 className="text-[11px] font-black uppercase tracking-widest">צ׳אט עם מקורות</h4>
                </div>
                <div className="space-y-2">
                  <ToggleRow label="עיגון במקורות" checked={settings.sourceGroundingInChat} onChange={(v) => persist({ ...settings, sourceGroundingInChat: v })} />
                  <ToggleRow label="ציטוטים" checked={settings.showCitations} onChange={(v) => persist({ ...settings, showCitations: v })} />
                  <ToggleRow label="רענון אחרי שינוי מקורות" checked={settings.autoRefreshSources} onChange={(v) => persist({ ...settings, autoRefreshSources: v })} />
                </div>
                <label className="mb-1.5 mt-3 block text-[10px] font-bold text-[color:var(--foreground-muted)]">תזכורת: מקס׳ מקורות (Google)</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={settings.maxSourcesReminder}
                  onChange={(e) => persist({ ...settings, maxSourcesReminder: Math.min(500, Math.max(1, Number(e.target.value) || 50)) })}
                  className="w-full max-w-xs rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-3 py-2 text-sm font-mono text-[color:var(--foreground-main)]"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-[color:var(--foreground-muted)]">
                  <Share2 size={15} aria-hidden />
                  <h4 className="text-[11px] font-black uppercase tracking-widest">שיתוף</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { value: "private" as const, label: "פרטי" },
                      { value: "workspace" as const, label: "צוות / ארגון" },
                      { value: "link" as const, label: "קישור" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => persist({ ...settings, shareLevel: opt.value })}
                      className={`rounded-xl px-3 py-2 text-[11px] font-black transition ${settings.shareLevel === opt.value ? "bg-amber-600 text-white shadow-md" : "border border-[color:var(--border-main)] bg-[color:var(--background-main)] text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </details>

          <p className="text-center text-[10px] font-semibold leading-relaxed text-[color:var(--foreground-muted)]">
            NotebookLM הוא שירות Google. ההגדרות נשמרות מקומית; ליצירת מחברת אמיתית — «פתח ב-Google».
          </p>
        </div>
      </div>
    </div>
  );
}
