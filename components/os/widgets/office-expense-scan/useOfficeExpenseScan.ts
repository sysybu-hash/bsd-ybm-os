"use client";

import { useMemo } from "react";
import { useAiScannerState } from "@/components/os/widgets/ai-scanner/useAiScannerState";
import {
  getOfficeExpenseScanModes,
  OFFICE_EXPENSE_DEFAULT_SCAN_MODE,
} from "@/lib/scan-modes-for-ui";

type Args = {
  onSaveComplete?: () => void;
};

/** מצב סריקה ממוקד להוצאות משרד — ללא פרויקט, יעד שמירה expense בלבד */
export function useOfficeExpenseScan({ onSaveComplete }: Args = {}) {
  const state = useAiScannerState({
    officeExpenseMode: true,
    initialScanModeOverride: OFFICE_EXPENSE_DEFAULT_SCAN_MODE,
    onSaveComplete,
  });

  const officeScanModes = useMemo(
    () => getOfficeExpenseScanModes(state.tr),
    [state.tr],
  );

  return { ...state, officeScanModes };
}
