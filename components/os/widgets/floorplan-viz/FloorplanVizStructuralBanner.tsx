"use client";

import React from "react";
import { TriangleAlert } from "lucide-react";
import { hebrewFloorplanAuditIssue } from "@/lib/projects/floorplan-viz-ids";
import { structuralAuditFailures } from "@/lib/projects/floorplan-viz-structural";

type TFn = (key: string, vars?: Record<string, string>) => string;

function label(t: TFn, key: string, fallback: string): string {
  const value = t(key);
  return value && value !== key ? value : fallback;
}

/**
 * A still of a different flat, said so plainly.
 *
 * These findings used to sit in the amber "what to fix" list beside a stray
 * screen and a second washer, with a note that the auditor may be wrong — so a
 * still missing a bedroom read like a touch-up. It is not one: it is not this
 * apartment, and it must not reach a client as if it were.
 */
export default function FloorplanVizStructuralBanner({
  issues,
  t,
}: {
  issues: readonly string[] | undefined;
  t: TFn;
}) {
  const structural = structuralAuditFailures(issues);
  if (structural.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-600/40 bg-red-600/10 px-2.5 py-2 text-[11px] text-red-900 dark:text-red-100"
    >
      <p className="mb-1 flex items-center gap-1.5 font-bold">
        <TriangleAlert size={14} aria-hidden />
        {label(t, "workspaceWidgets.floorplanViz.structuralTitle", "ההדמיה לא תואמת את התוכנית")}
      </p>
      <p className="mb-1.5 text-[10px]">
        {label(
          t,
          "workspaceWidgets.floorplanViz.structuralBody",
          "הבקרה מצאה שהתמונה מציגה דירה אחרת. אין למסור אותה ללקוח.",
        )}
      </p>
      <ul className="list-disc space-y-0.5 ps-4">
        {structural.map((issue) => (
          <li key={issue}>{hebrewFloorplanAuditIssue(issue)}</li>
        ))}
      </ul>
    </div>
  );
}
