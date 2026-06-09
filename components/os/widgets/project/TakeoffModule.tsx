"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Ruler,
  Hexagon,
  Upload,
  Save,
  Trash2,
  MousePointer2,
  Undo2,
  Move,
  ZoomIn,
  ZoomOut,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import OsPromptDialog from "@/components/os/OsPromptDialog";

/** נקודה במערכת הקואורדינטות הטבעית של התמונה (לפני zoom/pan) */
type Point = { x: number; y: number };

/** מצב הכלי: מנוחה / כיול / מדידה / הזזה */
type TakeoffMode = "idle" | "calibrate" | "measure" | "pan";

/** דיאלוג קלט פעיל */
type DialogState =
  | { kind: "none" }
  | { kind: "calibrate"; distancePx: number }
  | { kind: "save"; area: number };

/** מדידה מוגמרת המועברת להורה לשמירה ל-BOQ */
export type TakeoffMeasurement = {
  /** שטח במ"ר */
  area: number;
  /** יחידת מידה */
  unit: string;
  /** תיאור השורה */
  description: string;
  /** קנה מידה (פיקסלים-תמונה למטר) */
  ppm: number;
  /** קודקודי הפוליגון בקואורדינטות התמונה */
  points: Point[];
};

export type TakeoffModuleProps = {
  /** נקרא בשמירת מדידה; ההורה כותב ל-API */
  onSaveMeasurement?: (measurement: TakeoffMeasurement) => void | Promise<void>;
  /** שמירה בתהליך — משבית את כפתור השמירה */
  saving?: boolean;
};

const SQM_UNIT = 'מ"ר';
/** רזולוציית רינדור ל-PDF (פי 2 לחדות בזום) */
const PDF_RENDER_SCALE = 2.0;
const MIN_SCALE = 0.1;
const MAX_SCALE = 12;

export default function TakeoffModule({ onSaveMeasurement, saving = false }: TakeoffModuleProps) {
  const { t } = useI18n();

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<TakeoffMode>("idle");
  const [ppm, setPpm] = useState<number | null>(null);

  // zoom / pan
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });

  // ציור
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [measurePoints, setMeasurePoints] = useState<Point[]>([]);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // ── איפוס ────────────────────────────────────────────────────────────────
  const resetMeasurement = () => {
    setCalibrationPoints([]);
    setMeasurePoints([]);
    setMode("idle");
  };

  const resetAll = () => {
    resetMeasurement();
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  /** ממקם את התמונה ממורכזת ומותאמת לגודל אזור העבודה */
  const fitToView = useCallback((w: number, h: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const cw = rect?.width ?? w;
    const ch = rect?.height ?? h;
    const fit = Math.min(cw / w, ch / h, 1);
    setScale(fit);
    setPosition({ x: (cw - w * fit) / 2, y: (ch - h * fit) / 2 });
  }, []);

  // ── העלאת קובץ (תמונה או PDF) ─────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsLoading(true);
    resetAll();
    setImageSrc(null);
    setImageDims(null);

    try {
      if (file.type === "application/pdf") {
        // רינדור העמוד הראשון של ה-PDF לקנבס מוסתר → dataURL
        const pdfjs = await import("pdfjs-dist");
        // worker self-syncing עם הגרסה המותקנת — ללא תלות ב-CDN
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const data = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("canvas 2d context unavailable");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: context, viewport }).promise;
        const url = canvas.toDataURL("image/jpeg", 0.85);
        setImageSrc(url);
        setImageDims({ w: viewport.width, h: viewport.height });
        fitToView(viewport.width, viewport.height);
      } else {
        // תמונה רגילה — קוראים מימדים טבעיים לפני התצוגה
        const url = URL.createObjectURL(file);
        const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => reject(new Error("image decode failed"));
          img.src = url;
        });
        setImageSrc(url);
        setImageDims(dims);
        fitToView(dims.w, dims.h);
      }
    } catch (err: unknown) {
      toast.error(
        `${t("workspaceWidgets.takeoff.pdfError")}${
          err instanceof Error ? ` (${err.message})` : ""
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ── גאומטריה + טרנספורם הפוך ───────────────────────────────────────────────
  /** ממיר קואורדינטות מסך לקואורדינטות התמונה הטבעית (הסרת offset → translate → scale) */
  const getRealCoords = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      return {
        x: (screenX - position.x) / scale,
        y: (screenY - position.y) / scale,
      };
    },
    [position.x, position.y, scale],
  );

  const calculateDistance = (p1: Point, p2: Point): number =>
    Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

  /** נוסחת שרוך הנעל (Shoelace) → פיקסל² מחולק ב-ppm² למ"ר */
  const calculatePolygonArea = useCallback(
    (points: Point[]): number => {
      if (points.length < 3 || !ppm) return 0;
      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i]!.x * points[j]!.y;
        area -= points[j]!.x * points[i]!.y;
      }
      return Math.abs(area / 2) / (ppm * ppm);
    },
    [ppm],
  );

  const currentArea = useMemo(
    () => calculatePolygonArea(measurePoints),
    [calculatePolygonArea, measurePoints],
  );

  // ── עכבר ───────────────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // לחצן אמצעי או מצב הזזה → גרירה
    if (e.button === 1 || mode === "pan") {
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
      return;
    }
    if (e.button !== 0 || mode === "idle") return;

    const coords = getRealCoords(e.clientX, e.clientY);

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
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
      return;
    }
    if (mode === "calibrate" || mode === "measure") {
      setMousePos(getRealCoords(e.clientX, e.clientY));
    }
  };

  const endDrag = () => setIsDragging(false);

  /** זום לכיוון הסמן — משמר את הנקודה שתחת העכבר */
  const applyZoomAtPoint = (factor: number, anchorClientX?: number, anchorClientY?: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const newScale = Math.min(Math.max(MIN_SCALE, scale * factor), MAX_SCALE);
    if (!rect) {
      setScale(newScale);
      return;
    }
    const ax = (anchorClientX ?? rect.left + rect.width / 2) - rect.left;
    const ay = (anchorClientY ?? rect.top + rect.height / 2) - rect.top;
    setPosition({
      x: ax - (ax - position.x) * (newScale / scale),
      y: ay - (ay - position.y) * (newScale / scale),
    });
    setScale(newScale);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!imageSrc) return;
    e.preventDefault();
    const factor = 1 + -e.deltaY * 0.001;
    applyZoomAtPoint(factor, e.clientX, e.clientY);
  };

  const undoLastPoint = () => {
    if (mode === "measure") setMeasurePoints((prev) => prev.slice(0, -1));
  };

  // ── דיאלוגים ───────────────────────────────────────────────────────────────
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
        : mode === "pan"
          ? t("workspaceWidgets.takeoff.statusPan")
          : t("workspaceWidgets.takeoff.statusIdle");

  // עובי קווים/רדיוס קבוע ויזואלית — מתחלק ב-scale
  const sw = (n: number) => n / scale;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]">
      {/* סרגל כלים */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border-main)] bg-[color:var(--surface-elevated)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label
            className={`flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 ${
              isLoading ? "cursor-wait opacity-70" : "cursor-pointer"
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("workspaceWidgets.takeoff.loading")}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                {t("workspaceWidgets.takeoff.uploadDrawing")}
              </>
            )}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => void handleFileUpload(e)}
              disabled={isLoading}
            />
          </label>

          {imageSrc ? (
            <>
              <div className="mx-1 h-6 w-px bg-[color:var(--border-main)]" />

              {/* ניווט */}
              <button
                type="button"
                onClick={() => setMode((m) => (m === "pan" ? "idle" : "pan"))}
                title={t("workspaceWidgets.takeoff.pan")}
                aria-label={t("workspaceWidgets.takeoff.pan")}
                className={`rounded-lg p-2 transition-colors ${
                  mode === "pan"
                    ? "bg-indigo-600 text-white"
                    : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                }`}
              >
                <Move className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => applyZoomAtPoint(1.2)}
                title={t("workspaceWidgets.takeoff.zoomIn")}
                aria-label={t("workspaceWidgets.takeoff.zoomIn")}
                className="rounded-lg p-2 text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-soft)]"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => applyZoomAtPoint(1 / 1.2)}
                title={t("workspaceWidgets.takeoff.zoomOut")}
                aria-label={t("workspaceWidgets.takeoff.zoomOut")}
                className="rounded-lg p-2 text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-soft)]"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="min-w-[3rem] text-center font-mono text-xs text-[color:var(--foreground-muted)]">
                {Math.round(scale * 100)}%
              </span>

              <div className="mx-1 h-6 w-px bg-[color:var(--border-main)]" />

              {/* מדידה */}
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
                title={t("workspaceWidgets.takeoff.undo")}
                aria-label={t("workspaceWidgets.takeoff.undo")}
                className="rounded-lg p-2 text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-soft)] disabled:opacity-40"
              >
                <Undo2 className="h-4 w-4" />
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

      {/* אזור עבודה */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className={`relative flex-1 overflow-hidden bg-[color:var(--surface-soft)] ${
          mode === "pan" || isDragging ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
        }`}
      >
        {!imageSrc ? (
          <div className="flex h-full flex-col items-center justify-center text-[color:var(--foreground-muted)]">
            {isLoading ? (
              <Loader2 className="mb-4 h-12 w-12 animate-spin opacity-60" />
            ) : (
              <MousePointer2 className="mb-4 h-12 w-12 opacity-50" />
            )}
            <p>{t("workspaceWidgets.takeoff.emptyHint")}</p>
          </div>
        ) : (
          <svg
            ref={svgRef}
            className="absolute inset-0 h-full w-full touch-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
          >
            <g transform={`translate(${position.x}, ${position.y}) scale(${scale})`}>
              {imageDims ? (
                <image href={imageSrc} x={0} y={0} width={imageDims.w} height={imageDims.h} />
              ) : null}

              {/* כיול */}
              {calibrationPoints.map((p, i) => (
                <circle key={`cal-${i}`} cx={p.x} cy={p.y} r={sw(4)} fill="#4f46e5" />
              ))}
              {calibrationPoints.length === 1 && mousePos && mode === "calibrate" ? (
                <line
                  x1={calibrationPoints[0]!.x}
                  y1={calibrationPoints[0]!.y}
                  x2={mousePos.x}
                  y2={mousePos.y}
                  stroke="#4f46e5"
                  strokeWidth={sw(2)}
                  strokeDasharray={sw(4)}
                />
              ) : null}
              {calibrationPoints.length === 2 ? (
                <line
                  x1={calibrationPoints[0]!.x}
                  y1={calibrationPoints[0]!.y}
                  x2={calibrationPoints[1]!.x}
                  y2={calibrationPoints[1]!.y}
                  stroke="#4f46e5"
                  strokeWidth={sw(3)}
                />
              ) : null}

              {/* פוליגון */}
              {measurePoints.length > 0 ? (
                <polygon
                  points={measurePoints.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(16, 185, 129, 0.3)"
                  stroke="#10b981"
                  strokeWidth={sw(2)}
                />
              ) : null}
              {measurePoints.map((p, i) => (
                <circle key={`mes-${i}`} cx={p.x} cy={p.y} r={sw(3)} fill="#10b981" />
              ))}
              {mode === "measure" && measurePoints.length > 0 && mousePos ? (
                <line
                  x1={measurePoints[measurePoints.length - 1]!.x}
                  y1={measurePoints[measurePoints.length - 1]!.y}
                  x2={mousePos.x}
                  y2={mousePos.y}
                  stroke="#10b981"
                  strokeWidth={sw(2)}
                  strokeDasharray={sw(4)}
                />
              ) : null}
            </g>
          </svg>
        )}
      </div>

      {/* שורת סטטוס */}
      <div className="flex justify-between border-t border-[color:var(--border-main)] bg-[color:var(--surface-elevated)] p-2 text-xs text-[color:var(--foreground-muted)]">
        <span>{statusText}</span>
        {ppm ? (
          <span>{t("workspaceWidgets.takeoff.scaleInfo").replace("{ppm}", ppm.toFixed(2))}</span>
        ) : null}
      </div>

      {/* דיאלוג כיול */}
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

      {/* דיאלוג שמירה */}
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
