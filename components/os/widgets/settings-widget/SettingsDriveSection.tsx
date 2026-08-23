"use client";

import React from "react";
import { HardDrive, Save } from "lucide-react";
import { OsButton } from "@/components/os/ui";
import { DEFAULT_GOOGLE_DRIVE_FOLDER_NAME } from "@/lib/google-drive-config";
import type { DriveSettings } from "./useSettingsWidget";

type SettingsDriveSectionProps = {
  driveSettings: DriveSettings;
  setDriveSettings: (v: DriveSettings) => void;
  driveSaving: boolean;
  driveFolders: Array<{ id: string; name: string }>;
  driveFoldersLoading: boolean;
  onSave: () => void;
  t: (key: string, vars?: Record<string, string>) => string;
};

const S = "workspaceWidgets.settings";

export function SettingsDriveSection({
  driveSettings, setDriveSettings, driveSaving,
  driveFolders, driveFoldersLoading,
  onSave, t,
}: SettingsDriveSectionProps) {
  const patch = (p: Partial<DriveSettings>) => setDriveSettings({ ...driveSettings, ...p });

  return (
    <section className="pt-6 border-t border-[color:var(--border-main)]/30">
      <div className="flex items-center gap-2 mb-6">
        <HardDrive size={18} className="text-blue-500" />
        <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
          {t(`${S}.driveSection`)}
        </h3>
      </div>
      <p className="text-xs text-[color:var(--foreground-muted)] mb-4 leading-relaxed max-w-xl">
        {t(`${S}.driveIntro`)}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
        <div className="space-y-2">
          <label className="text-xs font-bold text-[color:var(--foreground-muted)] pe-1">
            {t(`${S}.driveFolder`)}
          </label>
          {driveFolders.length > 0 ? (
            <select
              value={driveSettings.driveFolderId ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                const folder = driveFolders.find((f) => f.id === id);
                patch({ driveFolderId: id || null, driveFolderName: folder?.name ?? driveSettings.driveFolderName });
              }}
              className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-[color:var(--foreground-main)]"
            >
              <option value="">{t(`${S}.driveFolderPlaceholder`)}</option>
              {driveFolders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          ) : (
            <input
              value={driveSettings.driveFolderName}
              onChange={(e) => patch({ driveFolderName: e.target.value })}
              className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-[color:var(--foreground-main)]"
              placeholder={DEFAULT_GOOGLE_DRIVE_FOLDER_NAME}
            />
          )}
          {driveFoldersLoading ? (
            <p className="text-[10px] text-[color:var(--foreground-muted)]">{t(`${S}.driveFoldersLoading`)}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3 pb-2">
          <input
            id="drive-sync-enabled"
            type="checkbox"
            checked={driveSettings.driveSyncEnabled}
            onChange={(e) => patch({ driveSyncEnabled: e.target.checked })}
            className="h-4 w-4 rounded border-[color:var(--border-main)]"
          />
          <label htmlFor="drive-sync-enabled" className="text-sm font-semibold text-[color:var(--foreground-main)]">
            {t(`${S}.driveSyncAuto`)}
          </label>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {(
          [
            { key: "driveAutoDecodeOnSync", labelKey: `${S}.driveAutoDecode` },
            { key: "driveAutoSaveAfterDecode", labelKey: `${S}.driveAutoSave` },
            { key: "driveAskBeforeSave", labelKey: `${S}.driveAskBeforeSave` },
          ] as const
        ).map(({ key, labelKey }) => (
          <label key={key} className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={driveSettings[key]}
              onChange={(e) => patch({ [key]: e.target.checked })}
              className="h-4 w-4 rounded border-[color:var(--border-main)]"
            />
            {t(labelKey)}
          </label>
        ))}
      </div>

      {driveSettings.driveFolderId ? (
        <p className="mt-3 text-[10px] font-mono text-[color:var(--foreground-muted)]">
          {t(`${S}.driveFolderId`, { id: driveSettings.driveFolderId })}
          {driveSettings.lastSyncAt
            ? t(`${S}.driveLastSync`, { at: new Date(driveSettings.lastSyncAt).toLocaleString("he-IL") })
            : ""}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <OsButton variant="primary" loading={driveSaving} icon={<Save size={16} aria-hidden />} onClick={onSave}>
          {t(`${S}.saveDriveSettings`)}
        </OsButton>
        <OsButton
          variant="secondary"
          onClick={() => {
            // Route handler that 302s to Google's OAuth consent screen — a
            // cross-origin redirect the Next router cannot follow. Must be a
            // real browser navigation.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign("/api/auth/google-link?callbackUrl=/?w=settings");
          }}
        >
          {t(`${S}.connectGoogleSignIn`)}
        </OsButton>
        {/* Same cross-origin OAuth redirect as above. */}
        <OsButton variant="secondary" onClick={() => {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/api/auth/google-reconnect?callbackUrl=/");
        }}>
          {t(`${S}.reconnectGoogle`)}
        </OsButton>
      </div>
    </section>
  );
}
