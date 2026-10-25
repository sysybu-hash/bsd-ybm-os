"use client";

import React, { useRef } from "react";
import { Loader2, Upload } from "lucide-react";
import { OsButton } from "@/components/os/ui";

type TFn = (key: string, vars?: Record<string, string>) => string;

/** Step 1: choose one plan file, or a house's several sheets. The file is read as soon as it is chosen. */
export default function StepUpload({
  t,
  busy,
  disabled,
  onFiles,
}: {
  t: TFn;
  busy: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <section className="rounded-xl border border-dashed border-[color:var(--border-main)] px-4 py-8 text-center">
      <input
        ref={ref}
        type="file"
        multiple
        accept=".pdf,.dxf,.dwg,.dwf,.w2d,.png,.jpg,.jpeg,.webp,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      {busy ? (
        <p className="flex items-center justify-center gap-2 text-sm text-[color:var(--foreground-muted)]" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          {t("workspaceWidgets.floorplanViz.wizard.identifying")}
        </p>
      ) : (
        <>
          <p className="text-sm font-bold">{t("workspaceWidgets.floorplanViz.wizard.uploadTitle")}</p>
          <p className="mx-auto mt-1 max-w-md text-[11px] text-[color:var(--foreground-muted)]">
            {t("workspaceWidgets.floorplanViz.wizard.uploadHint")}
          </p>
          <OsButton
            className="mt-4"
            variant="primary"
            size="sm"
            icon={<Upload size={12} aria-hidden />}
            disabled={disabled}
            onClick={() => ref.current?.click()}
          >
            {t("workspaceWidgets.floorplanViz.wizard.chooseFiles")}
          </OsButton>
        </>
      )}
    </section>
  );
}
