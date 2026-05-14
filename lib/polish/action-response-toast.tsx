"use client";

import { toast } from "sonner";
import type { ActionResponse } from "@/lib/polish/action-response";

const DEFAULT_SUCCESS_HE = "הפעולה בוצעה בהצלחה";

function errorLine(message: string) {
  return `שגיאה: ${message}`;
}

type LegacyOk = { ok: boolean; error?: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function extractSuccess(r: unknown): boolean {
  if (!isRecord(r)) return false;
  if ("success" in r) return Boolean(r.success);
  if ("ok" in r) return Boolean(r.ok);
  return false;
}

function extractError(r: unknown): string | undefined {
  if (!isRecord(r)) return undefined;
  if (typeof r.error === "string") return r.error;
  if ("success" in r && r.success === false) {
    const e = (r as ActionResponse<unknown>).error;
    return typeof e === "string" ? e : undefined;
  }
  return undefined;
}

export type ToastFeedbackOpts = {
  successMessage?: string;
  loadingMessage?: string;
};

/**
 * תוצאת Server Action בפורמט `ActionResponse`.
 */
export async function toastActionResult<T>(
  promise: Promise<ActionResponse<T>>,
  options?: ToastFeedbackOpts,
): Promise<ActionResponse<T>> {
  const id = toast.loading(options?.loadingMessage ?? "מבצע…");
  try {
    const r = await promise;
    toast.dismiss(id);
    if (r.success) {
      toast.success(options?.successMessage ?? DEFAULT_SUCCESS_HE);
    } else {
      toast.error(errorLine((r.error ?? "").trim() || "לא ידוע"));
    }
    return r;
  } catch (e) {
    toast.dismiss(id);
    const msg = e instanceof Error ? e.message : String(e);
    toast.error(errorLine(msg));
    throw e;
  }
}

/**
 * פעולות ישנות (`{ ok, error }`) או `ActionResponse` — טוסטים עם מיקרו־קופי בעברית.
 */
export async function toastClientActionFeedback<T>(
  work: () => Promise<ActionResponse<T> | LegacyOk>,
  opts: {
    successMessage: string;
    loadingMessage?: string;
    errorFallback?: string;
  },
): Promise<ActionResponse<T> | LegacyOk | undefined> {
  const id = toast.loading(opts.loadingMessage ?? "מבצע…");
  try {
    const r = await work();
    toast.dismiss(id);
    if (extractSuccess(r)) {
      toast.success(opts.successMessage);
      return r;
    }
    toast.error(errorLine((extractError(r) ?? "").trim() || opts.errorFallback || "לא ידוע"));
    return r;
  } catch (e) {
    toast.dismiss(id);
    const msg = e instanceof Error ? e.message : String(e);
    toast.error(errorLine(msg));
    return undefined;
  }
}

/**
 * גרסת `toast.promise` ל־`ActionResponse`.
 */
export function toastActionPromise<T>(
  promise: Promise<ActionResponse<T>>,
  loadingMessage = "מבצע…",
  successMessage?: string,
) {
  return toast.promise(promise, {
    loading: loadingMessage,
    success: (data) => {
      if (!data.success) {
        throw new Error(data.error?.trim() || "שגיאה");
      }
      return successMessage ?? DEFAULT_SUCCESS_HE;
    },
    error: (err) => errorLine(err instanceof Error ? err.message : String(err)),
  });
}
