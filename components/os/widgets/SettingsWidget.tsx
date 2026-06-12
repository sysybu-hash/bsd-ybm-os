"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { Suspense } from "react";
import Image from "next/image";
import { Image as ImageIcon, Loader2, Save, Settings, ShieldCheck, Upload } from "lucide-react";
import ProfessionSettingsPanel from "@/components/os/widgets/settings/ProfessionSettingsPanel";
import PasskeySecuritySection from "@/components/auth/PasskeySecuritySection";
import { useSettingsWidget } from "./settings-widget/useSettingsWidget";
import { SettingsBusinessProfile } from "./settings-widget/SettingsBusinessProfile";
import { SettingsDriveSection } from "./settings-widget/SettingsDriveSection";
import { SettingsCalendarSection } from "./settings-widget/SettingsCalendarSection";
import { SettingsAssignSection } from "./settings-widget/SettingsAssignSection";
import WindowBody from "@/components/os/layout/WindowBody";

const S = "workspaceWidgets.settings";

export default function SettingsWidget() {
  const { dir, t } = useI18n();
  const sw = useSettingsWidget();

  if (sw.loading) {
    return (
      <div className="flex items-center justify-center h-full bg-transparent">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  return (
    <WindowBody
      sticky
      dir={dir}
      className="bg-transparent text-[color:var(--foreground-main)]"
      header={
        <div className="shrink-0 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[color:var(--foreground-muted)]/10 flex items-center justify-center text-[color:var(--foreground-muted)]">
              <Settings size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[color:var(--foreground-main)]">{t(`${S}.title`)}</h2>
              <p className="text-xs text-[color:var(--foreground-muted)]">{t(`${S}.subtitle`)}</p>
            </div>
          </div>
          <button
            onClick={() => void sw.handleSave()}
            disabled={sw.saving}
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
          >
            {sw.saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {t(`${S}.saveChanges`)}
          </button>
        </div>
      }
      scrollClassName="widget-canvas p-4 sm:p-8"
    >
        {/* Narrow window: single comfortable column. Wide window: the sections
            flow into a 2-column masonry that fills the width (kills the empty
            side margins). Driven by window width via container queries. */}
        <div className="mx-auto max-w-3xl space-y-10 @4xl:max-w-none @4xl:columns-2 @4xl:gap-8 @4xl:space-y-0 @4xl:[&>*]:mb-8 @4xl:[&>*]:break-inside-avoid">

          <ProfessionSettingsPanel
            initialIndustry={sw.orgIndustry ?? sw.session?.user?.organizationIndustry}
            initialSpecialization={
              sw.orgSpecialization ??
              (sw.session?.user as { organizationConstructionTrade?: string | null } | undefined)
                ?.organizationConstructionTrade
            }
          />

          <SettingsBusinessProfile
            settings={sw.settings}
            onChange={(patch) => sw.setSettings((prev) => ({ ...prev, ...patch }))}
            t={t}
          />

          {/* Logo & Branding */}
          <section>
            <div className="flex items-center gap-2 mb-6">
              <ImageIcon size={18} className="text-emerald-500" />
              <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
                {t(`${S}.branding`)}
              </h3>
            </div>
            <div className="bg-[color:var(--background-main)]/30 border-2 border-dashed border-[color:var(--border-main)] rounded-[2rem] p-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 bg-[color:var(--surface-card)]/50 rounded-3xl border border-[color:var(--border-main)] flex items-center justify-center mb-4 shadow-xl overflow-hidden relative">
                {sw.settings.logoSvg ? (
                  <Image src={sw.settings.logoSvg} alt="Business Logo" fill className="object-contain p-2" unoptimized />
                ) : (
                  <ImageIcon size={40} className="text-[color:var(--foreground-muted)] opacity-30" />
                )}
              </div>
              <h4 className="font-bold text-[color:var(--foreground-main)] mb-1">{t(`${S}.uploadLogoTitle`)}</h4>
              <p className="text-xs text-[color:var(--foreground-muted)] mb-6 max-w-xs">{t(`${S}.uploadLogoDesc`)}</p>
              <div className="flex gap-3">
                <label className="px-4 py-2 bg-[color:var(--surface-card)]/50 dark:bg-white/10 border border-[color:var(--border-main)] rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-[color:var(--foreground-muted)]/10 text-[color:var(--foreground-main)] transition-all cursor-pointer">
                  <Upload size={14} /> {t(`${S}.chooseFile`)}
                  <input type="file" className="hidden" accept="image/*" onChange={sw.handleLogoUpload} />
                </label>
                <button
                  onClick={() => sw.setSettings((prev) => ({ ...prev, logoSvg: "" }))}
                  className="px-4 py-2 text-rose-500 text-xs font-bold hover:bg-rose-500/5 rounded-xl transition-all"
                >
                  {t(`${S}.removeLogo`)}
                </button>
              </div>
            </div>
          </section>

          <SettingsDriveSection
            driveSettings={sw.driveSettings}
            setDriveSettings={sw.setDriveSettings}
            driveSaving={sw.driveSaving}
            driveFolders={sw.driveFolders}
            driveFoldersLoading={sw.driveFoldersLoading}
            onSave={() => void sw.handleSaveDriveSettings()}
            t={t}
          />

          <Suspense fallback={null}>
            <SettingsCalendarSection t={t} />
          </Suspense>

          {sw.showAssignPanel && (
            <SettingsAssignSection
              assignEmail={sw.assignEmail}
              setAssignEmail={sw.setAssignEmail}
              assignRole={sw.assignRole}
              setAssignRole={sw.setAssignRole}
              assignRoles={sw.assignRoles}
              assigning={sw.assigning}
              onAssign={() => void sw.handleAssignUser()}
              t={t}
            />
          )}

          {/* Security */}
          <section className="pt-6 border-t border-[color:var(--border-main)]/30">
            <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-6">
              <div className="mb-4 flex items-start gap-4">
                <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-500">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-bold text-indigo-900 dark:text-indigo-300">
                    {t(`${S}.securityTitle`)}
                  </h4>
                  <p className="text-xs leading-relaxed text-indigo-700/60 dark:text-indigo-400/60">
                    {t(`${S}.securityDesc`)}
                  </p>
                </div>
              </div>
              <PasskeySecuritySection />
            </div>
          </section>

        </div>
    </WindowBody>
  );
}
