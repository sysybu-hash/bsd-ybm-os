"use client";

import AiScannerWidget from "@/components/os/widgets/AiScannerWidget";

type Props = {
  onExpenseSaved?: () => void;
};

/** סורק מוטמע להוצאות משרד — מצלמה, העלאה, אצווה, OCR חשבונית/קבלה */
export default function OfficeExpenseScanPanel({ onExpenseSaved }: Props) {
  return (
    <AiScannerWidget
      embeddedInHub
      officeExpenseMode
      onSaveComplete={onExpenseSaved}
    />
  );
}
