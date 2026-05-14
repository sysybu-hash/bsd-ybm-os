"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { ActionResponse } from "@/lib/polish/action-response";

export type AsyncActionOptions = {
  /** מוצג רק כשהפעולה הצליחה (ללא אובייקט { ok: false }) */
  successToast?: string;
  /** טקסט גיבוי כשהשרת מחזיר ok: false בלי error */
  errorToast?: string;
};

function isOkResult(value: unknown): value is { ok: boolean; error?: string } {
  return typeof value === "object" && value !== null && "ok" in value;
}

function isActionResponse(value: unknown): value is ActionResponse {
  return typeof value === "object" && value !== null && "success" in value;
}

/**
 * עטיפה מערכתית לפעולות async (במיוחד Server Actions): מצב טעינה + Sonner.
 */
export function useAsyncAction() {
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, opts?: AsyncActionOptions): Promise<T | undefined> => {
      setPending(true);
      try {
        const result = await fn();

        if (isActionResponse(result)) {
          if (!result.success) {
            toast.error(`שגיאה: ${(result.error ?? "").trim() || opts?.errorToast || "לא ידוע"}`);
            return result;
          }
          toast.success(opts?.successToast ?? "הפעולה בוצעה בהצלחה");
          return result;
        }

        if (isOkResult(result) && result.ok === false) {
          toast.error(result.error?.trim() || opts?.errorToast || "הפעולה נכשלה");
          return result;
        }

        if (opts?.successToast) {
          toast.success(opts.successToast);
        }
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(msg || opts?.errorToast || "שגיאה");
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  return { pending, run };
}
