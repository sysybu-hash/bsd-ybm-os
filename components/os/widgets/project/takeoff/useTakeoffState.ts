"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { DialogState, Point, TakeoffMeasurement, TakeoffMode } from "./types";
import { SQM_UNIT } from "./types";

/** רזולוציית רינדור ל-PDF (פי 2 לחדות בזום) */
const PDF_RENDER_SCALE = 2.0;
const MIN_SCALE = 0.1;
const MAX_SCALE = 12;

type UseTakeoffStateParams = {
  onSaveMeasurement?: (measurement: TakeoffMeasurement) => void | Promise<void>;
};

/** כל מצב וכללי המדידה של ה-Takeoff — טעינה, גאומטריה, עכבר ודיאלוגים */
export function useTakeoffState({ onSaveMeasurement }: UseTakeoffStateParams) {
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

  return {
    t,
    imageSrc,
    imageDims,
    isLoading,
    mode,
    setMode,
    ppm,
    scale,
    position,
    isDragging,
    calibrationPoints,
    setCalibrationPoints,
    measurePoints,
    mousePos,
    dialog,
    setDialog,
    containerRef,
    svgRef,
    resetMeasurement,
    handleFileUpload,
    currentArea,
    handleMouseDown,
    handleMouseMove,
    endDrag,
    applyZoomAtPoint,
    handleWheel,
    undoLastPoint,
    confirmCalibration,
    confirmSave,
    statusText,
  };
}

export type TakeoffState = ReturnType<typeof useTakeoffState>;
