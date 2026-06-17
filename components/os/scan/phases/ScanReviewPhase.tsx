"use client";

import React from "react";
import { ScanFullEditor } from "@/components/os/widgets/ai-scanner/ScanFullEditor";
import type { DocumentAnalysis } from "@/components/os/widgets/ai-scanner/types";

type ScanReviewPhaseProps = {
  analysis: DocumentAnalysis;
  onChange: (a: DocumentAnalysis) => void;
  onClose: () => void;
  onContinueToSave: () => void;
  tr: (key: string, fallback: string) => string;
  embeddedInScrollParent?: boolean;
};

/** עורך V5 מלא — משותף לסורק ולקופיילוט שטח */
export function ScanReviewPhase({
  analysis,
  onChange,
  onClose,
  onContinueToSave,
  tr,
  embeddedInScrollParent,
}: ScanReviewPhaseProps) {
  return (
    <ScanFullEditor
      analysis={analysis}
      onChange={onChange}
      onClose={onClose}
      onConfirm={onContinueToSave}
      tr={tr}
      embeddedInScrollParent={embeddedInScrollParent}
      confirmLabel={tr("workspaceWidgets.documentScan.continueToSave", "המשך לשמירה")}
    />
  );
}
