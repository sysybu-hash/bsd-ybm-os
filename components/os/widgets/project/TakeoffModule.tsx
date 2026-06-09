"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Ruler, Hexagon, Upload, Save, Trash2, MousePointer2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import OsPromptDialog from "@/components/os/OsPromptDialog";

/** נקודה במערכת קואורדינטות הפיקסלים של ה-SVG מעל השרטוט */
type Point = { x: number; y: number };

/** מצב הכלי: מנוחה / כיול קנה מידה / מדידת פוליגון */
type TakeoffMode = "idle" | "calibrate" | "measure";

/** דיאלוג קלט פעיל — כיול אורך או שם השורה בשמירה */
type DialogState =
  | { kind: "none" }
  | { kind: "calibrate"; distancePx: number }
  | { kind: "save"; area: number };

/** מדידה מוגמרת שמועברת להורה לצורך שמירה ל-BOQ */
export type TakeoffMeasurement = {
  /** שטח במ"ר */
  area: number;
  /** יחידת מידה (ברירת מחדל מ"ר) */
  unit: string;
  /** תיאור השורה שהמשתמש הזין */
  description: string;
  /** קנה המידה ששימש למדידה (פיקסלים למטר) */
  ppm: number;
  /** קודקודי הפוליגון בפיקסלים */
  points: Point[];
};

export type TakeoffModuleProps = {
  /** נקרא כשהמשתמש שומר מדידה; ההורה אחראי לכתיבה ל-API */
  onSaveMeasurement?: (measurement: TakeoffMeasurement) => void | Promise<void>;
  /** האם שמירה בתהליך (משבית את כפתור השמירה) */
  saving?: boolean;
};

const SQM_UNIT = 'מ"ר';

export default function TakeoffModule({ onSaveMeasurement, saving = false }: TakeoffModuleProps) {
  const { t } = useI18n();

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [mode, setMode] = useState<TakeoffMode>("idle");
  const [ppm, setPpm] = useState<number | null>(null);

  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [measurePoints, setMeasurePoints] = useState<Point[]>([]);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });

  const svgRef = useRef<SVGSVGElement | null>(null);

  // ── העלאת שרטוט ─────────────────────────────────────────────────────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setCalibrationPoints([]);
    setMeasurePoints([]);
    setPpm(null);
    setMode("idle");
    e.target.value = "";
  };

  // ── גאומטריה ────────────────────────────────────────────────────────────
  const getMouseCoords = useCallback((e: React.MouseEvent<SVGSVGElement>): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const calculateDistance = (p1: Point, p2: Point): number =>
    Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

  /** נוסחת שרוך הנעל (Shoelace) → שטח בפיקסל², מחולק ב-ppm² למ"ר */
  const calculatePolygonArea = useCallback(
    (points: Point[]): number => {
      if (points.length < 3 || !ppm) return 0;
      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i]!.x * points[j]!.y;
        area -= points[j]!.x * points[i]!.y;
      }
      const pixelArea = Math.abs(area / 2);
      return pixelArea / (ppm * ppm);
    },
    [ppm],
  );

  const currentArea = useMemo(
    () => calculatePolygonArea(measurePoints),
    [calculatePolygonArea, measurePoints],
  );

  // ── אינטראקציה עם השרטוט ─────────────────────────────────────────────────
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (mode === "idle") return;
    const coords = getMouseCoords(e);

    if (mode === "calibrate") {
      const next = [...calibrationPoints, coords];
      setCalibrationPoints(next);
      if (next.length === 2) {
        const distancePx = calculateDistance(next[0]!, next[1]!);
        setDialog({ kind: "calibrate", distancePx });
      }
      return;
    }

    if (mode === "measure") {
      setMeasurePoints((prev) => [...prev, coords]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (mode !== "idle") setMousePos(getMouseCoords(e));
  };

  const undoLastPoint = () => {
    if (mode === "measure") setMeasurePoints((prev) => prev.slice(0, -1));
  };

  const resetMeasurement = () => {
    setMeasurePoints([]);
    setMode("idle");
  };

  // ── דיאלוג כיול ──────────────────────────────────────────────────────────
  const confirmCalibration = (value: string) => {
    if (dialog.kind !== "calibrate") return;
    const realLength = Number(value.replace(",", "."));
    if (!value.trim() || Number.isNaN(realLength) || realLength <= 0) {
      toast.error(t("workspaceWidgets.takeoff.invalidNumber"));
      setCalibrationPoints([]);
      setDialog({ kind: "none" });
      return;
    }
    setPpm(dialog.distancePx / realLength);
    setMode("idle");
    setDialog({ kind: "none" });
    toast.success(t("workspaceWidgets.takeoff.calibrateDone"));
  };

  // ── דיאלוג שמירה ─────────────────────────────────────────────────────────
  const confirmSave = (value: string) => {
    if (dialog.kind !== "save" || !ppm) return;
    const description = value.trim() || t("workspaceWidgets.takeoff.defaultDescription");
    void onSaveMeasurement?.({
      area: Number(dialog.area.toFixed(2)),
      unit: SQM_UNIT,
      description,
      ppm,
      points: measurePoints,
    });
    setDialog({ kind: "none" });
  };

  const statusText =
    mode === "calibrate"
      ? t("workspaceWidgets.takeoff.statusCalibrate")
      : mode === "measure"
        ? t("workspaceWidgets.takeoff.statusMeasure")
        : t("workspaceWidgets.takeoff.statusIdle");

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]">
      {/* סרגל כלים */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border-main)] bg-[color:var(--surface-elevated)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500">
            <Upload className="h-4 w-4" />
            {t("workspaceWidgets.takeoff.uploadDrawing")}
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>

          {imageSrc ? (
            <>
              <div className="mx-1 h-6 w-px bg-[color:var(--border-main)]" />

              <button
                type="button"
                onClick={() => {
                  setMode("calibrate");
                  setCalibrationPoints([]);
                }}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  mode === "calibrate"
                    ? "bg-indigo-600 text-white"
                    : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                }`}
              >
                <Ruler className="h-4 w-4" />
                {t("workspaceWidgets.takeoff.calibrate")}
              </button>

              <button
                type="button"
                onClick={() => setMode("measure")}
                disabled={!ppm}
                title={!ppm ? t("workspaceWidgets.takeoff.needCalibrate") : ""}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  !ppm
                    ? "cursor-not-allowed text-[color:var(--foreground-muted)] opacity-50"
                    : mode === "measure"
                      ? "bg-indigo-600 text-white"
                      : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                }`}
              >
                <Hexagon className="h-4 w-4" />
                {t("workspaceWidgets.takeoff.measurePolygon")}
              </button>

              <button
                type="button"
                onClick={undoLastPoint}
                disabled={mode !== "measure" || measurePoints.length === 0}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-soft)] disabled:opacity-40"
              >
                <Undo2 className="h-4 w-4" />
                {t("workspaceWidgets.takeoff.undo")}
              </button>

              <button
                type="button"
                onClick={resetMeasurement}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-500 transition-colors hover:bg-rose-500/10"
              >
                <Trash2 className="h-4 w-4" />
                {t("workspaceWidgets.takeoff.clear")}
              </button>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {ppm ? (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 font-mono text-emerald-600 dark:text-emerald-400">
              {t("workspaceWidgets.takeoff.areaResult")}{" "}
              <span className="text-lg font-bold">{currentArea.toFixed(2)}</span> {SQM_UNIT}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setDialog({ kind: "save", area: currentArea })}
            disabled={currentArea === 0 || saving}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {t("workspaceWidgets.takeoff.saveToBoq")}
          </button>
        </div>
      </div>

      {/* אזור העבודה */}
      <div className="relative flex min-h-[420px] flex-1 cursor-crosshair justify-center overflow-auto bg-[color:var(--surface-soft)] p-4">
        {!imageSrc ? (
          <div className="flex flex-col items-center justify-center text-[color:var(--foreground-muted)]">
            <MousePointer2 className="mb-4 h-12 w-12 opacity-50" />
            <p>{t("workspaceWidgets.takeoff.emptyHint")}</p>
          </div>
        ) : (
          <div className="relative inline-block border border-[color:var(--border-main)] bg-white shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element -- blueprint blob URL, dimensions unknown */}
            <img src={imageSrc} alt="" className="pointer-events-none block max-w-none" />

            <svg
              ref={svgRef}
              className="absolute inset-0 z-10 h-full w-full"
              onClick={handleSvgClick}
              onMouseMove={handleMouseMove}
            >
              {/* קו כיול */}
              {calibrationPoints.map((p, i) => (
                <circle key={`cal-${i}`} cx={p.x} cy={p.y} r="4" fill="#4f46e5" />
              ))}
              {calibrationPoints.length === 1 && mousePos && mode === "calibrate" ? (
                <line
                  x1={calibrationPoints[0]!.x}
                  y1={calibrationPoints[0]!.y}
                  x2={mousePos.x}
                  y2={mousePos.y}
                  stroke="#4f46e5"
                  strokeWidth="2"
                  strokeDasharray="4"
                />
              ) : null}
              {calibrationPoints.length === 2 ? (
                <line
                  x1={calibrationPoints[0]!.x}
                  y1={calibrationPoints[0]!.y}
                  x2={calibrationPoints[1]!.x}
                  y2={calibrationPoints[1]!.y}
                  stroke="#4f46e5"
                  strokeWidth="3"
                />
              ) : null}

              {/* פוליגון מדידה */}
              {measurePoints.length > 0 ? (
                <polygon
                  points={measurePoints.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(16, 185, 129, 0.3)"
                  stroke="#10b981"
                  strokeWidth="2"
                />
              ) : null}
              {measurePoints.map((p, i) => (
                <circle key={`mes-${i}`} cx={p.x} cy={p.y} r="3" fill="#10b981" />
              ))}
              {mode === "measure" && measurePoints.length > 0 && mousePos ? (
                <line
                  x1={measurePoints[measurePoints.length - 1]!.x}
                  y1={measurePoints[measurePoints.length - 1]!.y}
                  x2={mousePos.x}
                  y2={mousePos.y}
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeDasharray="4"
                />
              ) : null}
            </svg>
          </div>
        )}
      </div>

      {/* שורת סטטוס */}
      <div className="flex justify-between border-t border-[color:var(--border-main)] bg-[color:var(--surface-elevated)] p-2 text-xs text-[color:var(--foreground-muted)]">
        <span>{statusText}</span>
        {ppm ? (
          <span>{t("workspaceWidgets.takeoff.scaleInfo").replace("{ppm}", ppm.toFixed(2))}</span>
        ) : null}
      </div>

      {/* דיאלוג כיול אורך */}
      <OsPromptDialog
        open={dialog.kind === "calibrate"}
        title={t("workspaceWidgets.takeoff.calibrateTitle")}
        label={t("workspaceWidgets.takeoff.calibrateLabel")}
        onConfirm={confirmCalibration}
        onCancel={() => {
          setCalibrationPoints([]);
          setDialog({ kind: "none" });
        }}
      />

      {/* דיאלוג שם שורת BOQ */}
      <OsPromptDialog
        open={dialog.kind === "save"}
        title={t("workspaceWidgets.takeoff.saveTitle")}
        label={t("workspaceWidgets.takeoff.saveLabel")}
        defaultValue={t("workspaceWidgets.takeoff.defaultDescription")}
        onConfirm={confirmSave}
        onCancel={() => setDialog({ kind: "none" })}
      />
    </div>
  );
}
