"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
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
  const { t } = useI18n();

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, opts?: AsyncActionOptions): Promise<T | undefined> => {
      setPending(true);
      try {
        const result = await fn();

        if (isActionResponse(result)) {
          if (!result.success) {
            const detail =
              (result.error ?? "").trim() || opts?.errorToast || t("common.errors.unknown");
            toast.error(`${t("common.errorPrefix")}: ${detail}`);
            return result;
          }
          toast.success(opts?.successToast ?? t("common.actionSucceeded"));
          return result;
        }

        if (isOkResult(result) && result.ok === false) {
          toast.error(result.error?.trim() || opts?.errorToast || t("common.actionFailed"));
          return result;
        }

        if (opts?.successToast) {
          toast.success(opts.successToast);
        }
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(msg || opts?.errorToast || t("common.errorPrefix"));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [t],
  );

  return { pending, run };
}
