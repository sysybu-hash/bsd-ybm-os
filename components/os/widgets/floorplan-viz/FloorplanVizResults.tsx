"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileText, FolderDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  inferRoomKind,
  type FloorplanLayout,
  type FloorplanRoom,
  type FloorplanVizImage,
} from "@/lib/projects/floorplan-layout";
import { OsButton } from "@/components/os/ui";
import { createLogger } from "@/lib/logger";
import FloorplanVizLightbox, { fileNameOf, srcOf } from "@/components/os/widgets/floorplan-viz/FloorplanVizLightbox";
import FloorplanVizAttemptCard from "@/components/os/widgets/floorplan-viz/FloorplanVizAttemptCard";
import { rasterizePlanFile } from "@/components/os/widgets/floorplan-viz/plan-source";
import type { FloorplanVizStyleKit } from "@/lib/projects/floorplan-viz-styles";
import type { FloorplanVizEditRegion } from "@/lib/projects/floorplan-viz-edit-region";
import {
  bookletHeroImage,
  groupFloorplanVizAttempts,
  selectedFloorplanVizImages,
  selectedFromAttemptGroup,
} from "@/lib/projects/floorplan-viz-ids";

type TFn = (key: string, vars?: Record<string, string>) => string;

const log = createLogger("floorplan-viz-results");

function sourceLabel(t: TFn, source?: string): string {
  if (source === "ocr_verified") return t("projectDashboard.vizOcrVerified");
  if (source === "consensus") return t("projectDashboard.vizConsensus");
  return t("projectDashboard.vizInferred");
}

function MeasuredPlanSvg({ rooms }: { rooms: FloorplanRoom[] }) {
  const boxed = rooms.filter((r) => r.bbox);
  if (boxed.length === 0) return null;
  const KIND_FILL: Record<string, string> = {
    living: "#fde68a",
    kitchen: "#fdba74",
    bedroom: "#93c5fd",
    mmd: "#c4b5fd",
    bathroom: "#67e8f9",
    balcony: "#86efac",
    circulation: "#cbd5e1",
    utility: "#d6d3d1",
    other: "#e2e8f0",
  };
  return (
    <svg viewBox="0 0 100 70" className="mt-2 h-auto w-full max-h-48 rounded-lg bg-[color:var(--surface-soft)]" role="img">
      {boxed.map((room) => {
        const b = room.bbox!;
        const kind = room.kind ?? inferRoomKind(room.name);
        return (
          <g key={`${room.name}-${room.instanceIndex ?? 0}`}>
            <rect
              x={b.x * 100}
              y={b.y * 70}
              width={Math.max(1, b.w * 100)}
              height={Math.max(1, b.h * 70)}
              fill={KIND_FILL[kind] ?? KIND_FILL.other}
              stroke="#334155"
              strokeWidth="0.4"
            />
            <text
              x={b.x * 100 + (b.w * 100) / 2}
              y={b.y * 70 + (b.h * 70) / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="2.4"
              fill="#0f172a"
            >
              {room.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Gallery({
  title,
  groups,
  offset,
  onOpen,
  t,
  layout,
  planSrc,
  canManage,
  editingKey,
  onEdit,
  onImprove,
  onRescan,
  onDelete,
  onSelect,
}: {
  title: string;
  groups: ReturnType<typeof groupFloorplanVizAttempts>;
  offset: number;
  onOpen: (groupIndex: number, img: FloorplanVizImage) => void;
  t: TFn;
  layout: FloorplanLayout | null;
  planSrc: string | null;
  canManage?: boolean;
  editingKey?: string | null;
  onEdit?: (img: FloorplanVizImage, instruction: string, region?: FloorplanVizEditRegion) => void;
  onImprove?: (img: FloorplanVizImage, failures: string[]) => void;
  onRescan?: (img: FloorplanVizImage) => void;
  onDelete?: (img: FloorplanVizImage) => void;
  onSelect?: (img: FloorplanVizImage) => void;
}) {
  if (groups.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((group, i) => (
            <FloorplanVizAttemptCard
              key={group.key}
              group={group}
              globalIndex={offset + i}
              onOpen={(img) => onOpen(offset + i, img)}
              t={t}
              layout={layout}
              planSrc={planSrc}
              canManage={canManage}
              editing={group.attempts.some((row) => (row.id ?? group.key) === editingKey)}
              onEdit={onEdit}
              onImprove={onImprove}
              onRescan={onRescan}
              onDelete={onDelete}
              onSelect={onSelect}
            />
        ))}
      </div>
    </section>
  );
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || "image/png" });
}

function compressUrlForPdf(url: string, fill = "#ffffff"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const max = 1800;
      const scale = Math.min(1, max / Math.max(image.width, image.height, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas 2d unavailable"));
        return;
      }
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((out) => resolve(out ?? new Blob()), "image/jpeg", 0.82);
    };
    image.onerror = () => reject(new Error("image decode failed"));
    image.src = url;
  });
}

function compressForPdf(img: FloorplanVizImage): Promise<{ blob: Blob }> {
  const mime = img.mimeType || "image/jpeg";
  if (!img.base64 && img.src) {
    return fetch(img.src, { credentials: "include" }).then(async (res) => {
      const blob = await res.blob();
      return { blob };
    });
  }
  const base64 = img.base64;
  if (!base64) return Promise.resolve({ blob: new Blob() });
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const max = 1600;
      const scale = Math.min(1, max / Math.max(image.width, image.height, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ blob: base64ToBlob(base64, mime) });
        return;
      }
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((out) => resolve({ blob: out ?? base64ToBlob(base64, mime) }), "image/jpeg", 0.84);
    };
    image.onerror = () => resolve({ blob: base64ToBlob(base64, mime) });
    image.src = `data:${mime};base64,${base64}`;
  });
}

export default function FloorplanVizResults({
  t,
  loading,
  error,
  layout,
  images,
  enginesUsed,
  ocrEngines,
  visionEngines,
  projectId,
  projectName,
  unitTitle,
  sourceFile,
  styleKit,
  pendingRooms = 0,
  onGenerateRooms,
  loadingLabel,
  runId,
  editingKey,
  onEditStill,
  onImproveStill,
  onRescanStill,
  onDeleteStill,
  onSelectStill,
}: {
  t: TFn;
  loading: boolean;
  error: string | null;
  layout: FloorplanLayout | null;
  images: FloorplanVizImage[];
  enginesUsed: string[];
  ocrEngines: string[];
  visionEngines: string[];
  projectId?: string;
  projectName?: string;
  unitTitle?: string;
  sourceFile?: File | null;
  styleKit?: FloorplanVizStyleKit | null;
  pendingRooms?: number;
  onGenerateRooms?: () => void;
  loadingLabel?: string;
  runId?: string | null;
  editingKey?: string | null;
  onEditStill?: (img: FloorplanVizImage, instruction: string, region?: FloorplanVizEditRegion) => void;
  onImproveStill?: (img: FloorplanVizImage, failures: string[]) => void;
  onRescanStill?: (img: FloorplanVizImage) => void;
  onDeleteStill?: (img: FloorplanVizImage) => void;
  onSelectStill?: (img: FloorplanVizImage) => void;
}) {
  const rooms = useMemo(() => layout?.rooms ?? [], [layout?.rooms]);
  const groups = useMemo(
    () =>
      groupFloorplanVizAttempts(images).filter(
        (group) => !(group.viewId === "overview" && group.roomName === "גיאומטריה"),
      ),
    [images],
  );
  const overviewGroups = useMemo(
    () =>
      groups.filter(
        (group) =>
          (group.viewId === "overview" || group.viewId === "isometric") &&
          group.roomName !== "גיאומטריה",
      ),
    [groups],
  );
  const interiorGroups = useMemo(
    () => groups.filter((group) => group.viewId === "interior"),
    [groups],
  );
  const gallery = useMemo(() => selectedFloorplanVizImages(images), [images]);
  const [preview, setPreview] = useState<{ frames: FloorplanVizImage[]; index: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [planSrc, setPlanSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceFile) {
      setPlanSrc(null);
      return;
    }
    let cancelled = false;
    void rasterizePlanFile(sourceFile)
      .then((url) => {
        if (!cancelled) setPlanSrc(url);
      })
      .catch(() => {
        if (!cancelled) setPlanSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceFile]);

  const downloadAll = useCallback(() => {
    gallery.forEach((img, i) => {
      window.setTimeout(() => {
        const a = document.createElement("a");
        a.href = srcOf(img);
        a.download = fileNameOf(img, i);
        a.click();
      }, i * 180);
    });
  }, [gallery]);

  const saveToProject = useCallback(async () => {
    if (!projectId) {
      toast.error(t("workspaceWidgets.floorplanViz.needProject"));
      return;
    }
    if (gallery.length === 0) return;
    setSaving(true);
    try {
      const folderRes = await fetch(`/api/projects/${encodeURIComponent(projectId)}/drive-folder`, {
        credentials: "include",
      });
      const folderJson = (await folderRes.json()) as { driveFolderId?: string; error?: string };
      if (!folderRes.ok || !folderJson.driveFolderId) {
        throw new Error(
          typeof folderJson.error === "string" ? folderJson.error : t("workspaceWidgets.floorplanViz.saveFailed"),
        );
      }
      for (const [i, img] of gallery.entries()) {
        const file = new File([base64ToBlob(img.base64, img.mimeType)], fileNameOf(img, i), {
          type: img.mimeType || "image/png",
        });
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folderId", folderJson.driveFolderId);
        const up = await fetch("/api/os/google-drive/upload", { method: "POST", credentials: "include", body: fd });
        if (!up.ok) throw new Error(t("workspaceWidgets.floorplanViz.saveFailed"));
      }
      const names = rooms.map((r) => r.name).join(", ");
      await fetch(`/api/projects/${encodeURIComponent(projectId)}/notes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `${t("workspaceWidgets.titles.floorplanViz")} (${gallery.length}): ${names}`.slice(0, 2000),
        }),
      });
      toast.success(t("workspaceWidgets.floorplanViz.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("workspaceWidgets.floorplanViz.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [gallery, projectId, rooms, t]);

  const exportPdf = useCallback(async () => {
    if (!layout || gallery.length === 0) return;
    const hero = bookletHeroImage(gallery);
    if (!hero) return;
    setExportingPdf(true);
    try {
      const fd = new FormData();
      fd.append("layout", JSON.stringify(layout));
      if (projectName) fd.append("projectName", projectName);
      if (unitTitle) fd.append("unitTitle", unitTitle);
      if (sourceFile?.name) fd.append("sourceFileName", sourceFile.name);
      if (styleKit?.labelHe) fd.append("styleLabelHe", styleKit.labelHe);
      if (styleKit?.summaryHe) fd.append("styleSummaryHe", styleKit.summaryHe);
      fd.append(
        "imageMeta",
        JSON.stringify([
          {
            viewId: hero.viewId,
            labelHe: hero.labelHe,
            roomName: hero.roomName,
          },
        ]),
      );
      const packed = await compressForPdf(hero);
      fd.append("images", packed.blob, fileNameOf(hero, 0).replace(/\.\w+$/u, ".jpg"));
      if (runId) fd.append("runId", runId);
      if (
        sourceFile &&
        (sourceFile.type === "application/pdf" || /\.pdf$/i.test(sourceFile.name)) &&
        sourceFile.size > 0 &&
        sourceFile.size <= 6 * 1024 * 1024
      ) {
        fd.append("sourcePdf", sourceFile);
      }
      let sheet = planSrc;
      if (!sheet && sourceFile) {
        try {
          sheet = await rasterizePlanFile(sourceFile);
        } catch (err: unknown) {
          log.warn("sheet raster failed; booklet goes without the sheet page", {
            error: err instanceof Error ? err.message : String(err),
          });
          sheet = null;
        }
      }
      if (sheet) {
        try {
          const planBlob = await compressUrlForPdf(sheet);
          if (planBlob.size > 0) {
            fd.append("planImage", planBlob, "plan.jpg");
          }
        } catch (err: unknown) {
          // The sheet is optional — the booklet falls back to cover + still.
          log.warn("sheet compression failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      const res = await fetch("/api/projects/visualize-floorplan/export-pdf", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof json.error === "string" ? json.error : t("workspaceWidgets.floorplanViz.pdfFailed"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BSD-YBM-viz-${(unitTitle || layout.unitLabel || layout.title || "plan").replace(/\s+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("workspaceWidgets.floorplanViz.pdfReady"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("workspaceWidgets.floorplanViz.pdfFailed"));
    } finally {
      setExportingPdf(false);
    }
  }, [gallery, layout, planSrc, projectName, runId, sourceFile, styleKit, t, unitTitle]);

  return (
    <div className="space-y-4">
      {loading && gallery.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-[color:var(--foreground-muted)]">
          <Loader2 className="animate-spin text-amber-500" aria-hidden />
          {loadingLabel ?? t("workspaceWidgets.floorplanViz.generatingOverview")}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      {gallery.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {layout?.grossAreaM2 ? (
            <span className="rounded-full border border-[color:var(--border-main)] px-2 py-0.5 text-[10px] font-semibold">
              {t("workspaceWidgets.floorplanViz.grossArea")}: {layout.grossAreaM2} {t("workspaceWidgets.floorplanViz.unitM2")}
            </span>
          ) : null}
          {styleKit?.labelHe ? (
            <span className="rounded-full border border-[color:var(--border-main)] px-2 py-0.5 text-[10px]">
              {t("workspaceWidgets.floorplanViz.stylePick")}: {styleKit.labelHe}
            </span>
          ) : null}
          {rooms.length > 0 ? (
            <span className="rounded-full border border-[color:var(--border-main)] px-2 py-0.5 text-[10px]">
              {rooms.length} {t("projectDashboard.vizRooms")}
            </span>
          ) : null}
          <span className="ms-auto flex flex-wrap gap-2">
            <OsButton
              variant="primary"
              size="sm"
              icon={<FileText size={12} aria-hidden />}
              loading={exportingPdf}
              disabled={exportingPdf}
              onClick={() => void exportPdf()}
            >
              {t("workspaceWidgets.floorplanViz.exportPdf")}
            </OsButton>
            <OsButton variant="secondary" size="sm" icon={<Download size={12} aria-hidden />} onClick={downloadAll}>
              {t("workspaceWidgets.floorplanViz.downloadAll")}
            </OsButton>
            <OsButton
              variant="secondary"
              size="sm"
              icon={<FolderDown size={12} aria-hidden />}
              loading={saving}
              disabled={saving}
              onClick={() => void saveToProject()}
            >
              {t("workspaceWidgets.floorplanViz.saveToProject")}
            </OsButton>
          </span>
        </div>
      ) : null}

      <Gallery
        title={t("workspaceWidgets.floorplanViz.wholePlan")}
        groups={overviewGroups}
        offset={0}
        onOpen={(groupIndex, img) => {
          const frames = [...overviewGroups, ...interiorGroups].map((group, i) =>
            i === groupIndex ? img : selectedFromAttemptGroup(group),
          );
          setPreview({ frames, index: groupIndex });
        }}
        t={t}
        layout={layout}
        planSrc={planSrc}
        canManage={Boolean(runId)}
        editingKey={editingKey}
        onEdit={onEditStill}
        onImprove={onImproveStill}
        onRescan={onRescanStill}
        onDelete={onDeleteStill}
        onSelect={onSelectStill}
      />

      {pendingRooms > 0 && onGenerateRooms ? (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-3">
          <p className="text-[11px] font-semibold">{t("workspaceWidgets.floorplanViz.continueRoomsHint")}</p>
          <p className="mt-0.5 text-[10px] text-[color:var(--foreground-muted)]">
            {t("workspaceWidgets.floorplanViz.continueRoomsCount", { n: String(pendingRooms) })}
          </p>
          <OsButton
            className="mt-2"
            variant="primary"
            size="sm"
            loading={loading}
            disabled={loading}
            onClick={onGenerateRooms}
          >
            {t("workspaceWidgets.floorplanViz.continueRooms")}
          </OsButton>
        </div>
      ) : null}

      {loading && gallery.length > 0 && pendingRooms > 0 ? (
        <p className="flex items-center gap-2 text-[11px] text-[color:var(--foreground-muted)]">
          <Loader2 className="animate-spin" size={14} aria-hidden />
          {t("workspaceWidgets.floorplanViz.generatingRooms")}
        </p>
      ) : null}

      <Gallery
        title={t("workspaceWidgets.floorplanViz.perRoom")}
        groups={interiorGroups}
        offset={overviewGroups.length}
        onOpen={(groupIndex, img) => {
          const frames = [...overviewGroups, ...interiorGroups].map((group, i) =>
            i === groupIndex ? img : selectedFromAttemptGroup(group),
          );
          setPreview({ frames, index: groupIndex });
        }}
        t={t}
        layout={layout}
        planSrc={planSrc}
        canManage={Boolean(runId)}
        editingKey={editingKey}
        onEdit={onEditStill}
        onImprove={onImproveStill}
        onRescan={onRescanStill}
        onDelete={onDeleteStill}
        onSelect={onSelectStill}
      />

      {preview?.frames[preview.index] ? (
        <FloorplanVizLightbox
          t={t}
          images={preview.frames}
          index={preview.index}
          onClose={() => setPreview(null)}
          onIndex={(index) => setPreview({ ...preview, index })}
        />
      ) : null}

      {ocrEngines.length === 0 && (layout || images.length > 0) && !loading ? (
        <p className="text-[10px] text-amber-800 dark:text-amber-200">{t("workspaceWidgets.floorplanViz.noOcr")}</p>
      ) : null}

      {layout && !loading ? (
        <details className="rounded-xl border border-[color:var(--border-main)]">
          <summary className="cursor-pointer px-3 py-2 text-[11px] font-bold">
            {t("workspaceWidgets.floorplanViz.roomsDetails")}
          </summary>
          <div className="space-y-3 border-t border-[color:var(--border-main)] p-3">
            <p className="text-[10px] text-[color:var(--foreground-muted)]">{t("projectDashboard.vizAccuracyNote")}</p>
            {enginesUsed.length > 0 || ocrEngines.length > 0 || visionEngines.length > 0 ? (
              <p className="text-[10px] text-[color:var(--foreground-muted)]">
                {t("projectDashboard.vizGrounding")}: {(enginesUsed.length ? enginesUsed : [...ocrEngines, ...visionEngines]).join(" • ")}
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-start text-[11px]">
                <thead>
                  <tr className="text-[color:var(--foreground-muted)]">
                    <th className="px-1 py-1 font-semibold">{t("projectDashboard.colDescription")}</th>
                    <th className="px-1 py-1 font-semibold">{t("workspaceWidgets.floorplanViz.kind")}</th>
                    <th className="px-1 py-1 font-semibold">{t("projectDashboard.vizDims")}</th>
                    <th className="px-1 py-1 font-semibold">{t("projectDashboard.colQuantity")}</th>
                    <th className="px-1 py-1 font-semibold">{t("projectDashboard.vizEvidence")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-1 py-4 text-center text-[color:var(--foreground-muted)]">
                        {t("workspaceWidgets.floorplanViz.noRooms")}
                      </td>
                    </tr>
                  ) : null}
                  {rooms.map((room) => (
                    <tr key={`${room.name}-${room.instanceIndex ?? 0}`} className="border-t border-[color:var(--border-main)]">
                      <td className="px-1 py-1.5 font-semibold">{room.name}</td>
                      <td className="px-1 py-1.5">{t(`workspaceWidgets.floorplanViz.kinds.${room.kind ?? inferRoomKind(room.name)}`)}</td>
                      <td className="px-1 py-1.5">
                        {room.widthM && room.lengthM ? `${room.widthM}×${room.lengthM} ${t("workspaceWidgets.floorplanViz.unitM")}` : "—"}
                      </td>
                      <td className="px-1 py-1.5">{room.areaM2 != null ? `${room.areaM2} ${t("workspaceWidgets.floorplanViz.unitM2")}` : "—"}</td>
                      <td className="px-1 py-1.5">{sourceLabel(t, room.source)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {layout.dimensionStrings.length > 0 ? (
              <p className="text-[10px] text-[color:var(--foreground-muted)]">
                {t("projectDashboard.vizPrintedDims")}: {layout.dimensionStrings.slice(0, 24).join(" · ")}
              </p>
            ) : null}
            <p className="text-[10px] font-bold">{t("workspaceWidgets.floorplanViz.layoutMap")}</p>
            <MeasuredPlanSvg rooms={rooms} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
