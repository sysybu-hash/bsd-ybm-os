"use client";

import React, { useCallback, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { OsButton } from "@/components/os/ui";
import {
  floorplanVizStyleThumbSrc,
  listFloorplanVizPresets,
  type CustomStyleAnswers,
  type FloorplanVizAudience,
  type FloorplanVizStyleId,
  type FloorplanVizStyleKit,
} from "@/lib/projects/floorplan-viz-styles";

type TFn = (key: string, vars?: Record<string, string>) => string;

const MOODS = ["light", "dark", "luxury", "developer"] as const;

export type FloorplanVizStylePickerProps = {
  t: TFn;
  styleId: FloorplanVizStyleId;
  onStyleId: (id: FloorplanVizStyleId) => void;
  customKit: FloorplanVizStyleKit | null;
  onCustomKit: (kit: FloorplanVizStyleKit | null) => void;
  disabled?: boolean;
};

export default function FloorplanVizStylePicker({
  t,
  styleId,
  onStyleId,
  customKit,
  onCustomKit,
  disabled,
}: FloorplanVizStylePickerProps) {
  const [customOpen, setCustomOpen] = useState(styleId === "custom");
  const [freeText, setFreeText] = useState("");
  const [audience, setAudience] = useState<FloorplanVizAudience>("general");
  const [mood, setMood] = useState<(typeof MOODS)[number]>("light");
  const [dominantColor, setDominantColor] = useState("#cbb892");
  const [mustHave, setMustHave] = useState("");
  const [mustNot, setMustNot] = useState("");
  const [busy, setBusy] = useState(false);

  const pickPreset = useCallback(
    (id: FloorplanVizStyleId) => {
      onStyleId(id);
      onCustomKit(null);
      setCustomOpen(false);
    },
    [onCustomKit, onStyleId],
  );

  const synthesize = useCallback(async () => {
    setBusy(true);
    try {
      const body: CustomStyleAnswers = {
        freeText,
        audience,
        mood,
        dominantColor,
        mustHave,
        mustNot,
      };
      const res = await fetch("/api/projects/visualize-floorplan/style-kit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { kit?: FloorplanVizStyleKit; error?: string };
      if (!res.ok || !json.kit?.promptBlock) {
        toast.error(typeof json.error === "string" ? json.error : t("workspaceWidgets.floorplanViz.styleKitFailed"));
        return;
      }
      onStyleId("custom");
      onCustomKit(json.kit);
    } catch {
      toast.error(t("workspaceWidgets.floorplanViz.styleKitFailed"));
    } finally {
      setBusy(false);
    }
  }, [audience, dominantColor, freeText, mood, mustHave, mustNot, onCustomKit, onStyleId, t]);

  const presets = listFloorplanVizPresets();
  const preview = styleId === "custom" ? customKit : presets.find((p) => p.id === styleId) ?? null;
  const previewThumb = preview ? floorplanVizStyleThumbSrc(preview.id) : null;

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold">{t("workspaceWidgets.floorplanViz.stylePick")}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {presets.map((kit) => {
          const selected = styleId === kit.id;
          const title = t(`workspaceWidgets.floorplanViz.styles.${kit.id}.title`);
          const thumb = floorplanVizStyleThumbSrc(kit.id);
          return (
            <button
              key={kit.id}
              type="button"
              disabled={disabled}
              onClick={() => pickPreset(kit.id)}
              className={`overflow-hidden rounded-xl border text-start ${
                selected
                  ? "border-violet-500 bg-violet-500/10"
                  : "border-[color:var(--border-main)] bg-[color:var(--background-main)]"
              }`}
            >
              {thumb ? (
                <span className="relative block aspect-[4/3] w-full bg-black/10">
                  <Image
                    src={thumb}
                    alt={t("workspaceWidgets.floorplanViz.styleThumbAlt", { style: title })}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, 180px"
                  />
                </span>
              ) : null}
              <span className="block px-2 py-2">
                <span className="flex gap-1 pb-1.5" aria-hidden>
                  {kit.colors.slice(0, 4).map((c) => (
                    <span key={c} className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: c }} />
                  ))}
                </span>
                <span className="block text-[11px] font-bold">{title}</span>
                <span className="block text-[10px] text-[color:var(--foreground-muted)]">
                  {t(`workspaceWidgets.floorplanViz.styles.${kit.id}.blurb`)}
                </span>
              </span>
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onStyleId("custom");
            setCustomOpen(true);
          }}
          className={`overflow-hidden rounded-xl border text-start ${
            styleId === "custom"
              ? "border-violet-500 bg-violet-500/10"
              : "border-dashed border-[color:var(--border-main)]"
          }`}
        >
          <span
            className="flex aspect-[4/3] w-full items-center justify-center bg-black/10"
            aria-hidden
          >
            <span className="flex gap-1">
              {["#cbb892", "#6b7c6a", "#2f3430", "#f5f0e8"].map((c) => (
                <span key={c} className="h-5 w-5 rounded-full border border-black/10" style={{ background: c }} />
              ))}
            </span>
          </span>
          <span className="block px-2 py-2">
            <span className="block text-[11px] font-bold">{t("workspaceWidgets.floorplanViz.styleCustom")}</span>
            <span className="block text-[10px] text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.floorplanViz.styleFreeText")}
            </span>
          </span>
        </button>
      </div>

      {customOpen || styleId === "custom" ? (
        <div className="space-y-2 rounded-xl border border-[color:var(--border-main)] p-3">
          <label className="block text-[10px] font-semibold">
            {t("workspaceWidgets.floorplanViz.styleFreeText")}
            <textarea
              className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1 text-[11px]"
              rows={2}
              value={freeText}
              disabled={disabled || busy}
              placeholder={t("workspaceWidgets.floorplanViz.styleFreeTextPh")}
              onChange={(e) => setFreeText(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px]">
              {t("workspaceWidgets.floorplanViz.styleAudience")}
              <select
                className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1 text-[11px]"
                value={audience}
                disabled={disabled || busy}
                onChange={(e) => setAudience(e.target.value === "haredi" ? "haredi" : "general")}
              >
                <option value="general">{t("workspaceWidgets.floorplanViz.styleAudienceGeneral")}</option>
                <option value="haredi">{t("workspaceWidgets.floorplanViz.styleAudienceHaredi")}</option>
              </select>
            </label>
            <label className="text-[10px]">
              {t("workspaceWidgets.floorplanViz.styleMood")}
              <select
                className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1 text-[11px]"
                value={mood}
                disabled={disabled || busy}
                onChange={(e) => setMood(e.target.value as (typeof MOODS)[number])}
              >
                {MOODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`workspaceWidgets.floorplanViz.styleMood${m[0]!.toUpperCase()}${m.slice(1)}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px]">
              {t("workspaceWidgets.floorplanViz.styleColor")}
              <input
                type="color"
                className="mt-1 h-8 w-full rounded border border-[color:var(--border-main)]"
                value={dominantColor}
                disabled={disabled || busy}
                onChange={(e) => setDominantColor(e.target.value)}
              />
            </label>
            <label className="text-[10px]">
              {t("workspaceWidgets.floorplanViz.styleMust")}
              <input
                className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1 text-[11px]"
                value={mustHave}
                disabled={disabled || busy}
                onChange={(e) => setMustHave(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-[10px]">
            {t("workspaceWidgets.floorplanViz.styleMustNot")}
            <input
              className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1 text-[11px]"
              value={mustNot}
              disabled={disabled || busy}
              onChange={(e) => setMustNot(e.target.value)}
            />
          </label>
          <OsButton variant="secondary" size="sm" loading={busy} disabled={disabled || busy} onClick={() => void synthesize()}>
            {t("workspaceWidgets.floorplanViz.styleSynthesize")}
          </OsButton>
        </div>
      ) : null}

      {preview ? (
        <div className="rounded-xl border border-[color:var(--border-main)] px-3 py-2">
          <p className="text-[10px] font-bold">{t("workspaceWidgets.floorplanViz.stylePreview")}</p>
          {previewThumb ? (
            <span className="relative mt-1.5 mb-1.5 block aspect-[16/9] w-full overflow-hidden rounded-lg bg-black/10">
              <Image
                src={previewThumb}
                alt={t("workspaceWidgets.floorplanViz.styleThumbAlt", { style: preview.labelHe })}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 420px"
              />
            </span>
          ) : null}
          <p className="text-[11px]">{preview.labelHe}</p>
          {preview.summaryHe ? (
            <p className="text-[10px] text-[color:var(--foreground-muted)]">{preview.summaryHe}</p>
          ) : null}
          {preview.materialsHe ? (
            <p className="text-[10px] text-[color:var(--foreground-muted)]">{preview.materialsHe}</p>
          ) : null}
          <span className="mt-1 flex gap-1" aria-hidden>
            {preview.colors.slice(0, 6).map((c) => (
              <span key={c} className="h-3 w-3 rounded-full border border-black/10" style={{ background: c }} />
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );
}
