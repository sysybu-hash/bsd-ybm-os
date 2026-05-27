"use client";

import { Calendar, Settings, Sparkles } from "lucide-react";
import type { OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";

type CalendarEmptyPanelProps = {
  dir: "rtl" | "ltr";
  suggested: boolean;
  title: string;
  suggestBody: string;
  inactiveBody: string;
  openSettingsLabel: string;
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
};

export function CalendarEmptyPanel({
  dir,
  suggested,
  title,
  suggestBody,
  inactiveBody,
  openSettingsLabel,
  openWorkspaceWidget,
}: CalendarEmptyPanelProps) {
  const openWizard = () => {
    openWorkspaceWidget?.("settings", null);
    const u = new URL(window.location.href);
    u.searchParams.set("w", "settings");
    u.searchParams.set("calendar", "wizard");
    window.history.replaceState({}, "", `${u.pathname}${u.search}`);
  };

  return (
    <div
      className="relative flex flex-col items-center justify-center h-full min-h-[320px] p-8 text-center overflow-hidden"
      dir={dir}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(139,92,246,0.25), transparent 70%)",
        }}
      />
      <div className="relative flex flex-col items-center gap-5 max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shadow-lg shadow-violet-900/10">
          <Calendar size={32} className="text-violet-500" strokeWidth={1.5} />
        </div>
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400">
            <Sparkles size={12} />
            Google Calendar
          </div>
          <h3 className="text-xl font-black text-[color:var(--foreground-main)] tracking-tight">
            {title}
          </h3>
          <p className="text-sm text-[color:var(--foreground-muted)] leading-relaxed">
            {suggested ? suggestBody : inactiveBody}
          </p>
        </div>
        {openWorkspaceWidget ? (
          <button
            type="button"
            onClick={openWizard}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-violet-900/25 transition-colors"
          >
            <Settings size={18} />
            {openSettingsLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
