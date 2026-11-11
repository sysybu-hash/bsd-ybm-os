import { vmbScanCountsSchema, vmbScanUnreadSchema } from "@/lib/validation/schemas/vmb-projects";
import type { Holds, ScanCount, ScanKind } from "@/lib/vmb/scan";

/** One file's scan as the project page shows it: its latest round, how many rounds ran, and what is still unread. */
export type ScanView = {
  fileName: string;
  round: number;
  counts: Record<ScanKind, ScanCount>;
  /** Entities read over entities there, 0..1; null for an empty sheet. */
  share: number | null;
  inkCoverage: number | null;
  unread: Array<{ name: string; count: number; reason: string; holds?: Holds }>;
  scannedAt: string;
};

type Row = { fileName: string; round: number; counts: unknown; inkCoverage: number | null; unread: unknown; createdAt: Date };

/** The latest round per file, in file order; a row whose stored JSON no longer parses is left out rather than shown wrong. */
export function toScanViews(rows: Row[]): ScanView[] {
  const latest = new Map<string, Row>();
  for (const r of rows) {
    const had = latest.get(r.fileName);
    if (!had || r.round > had.round) latest.set(r.fileName, r);
  }
  const out: ScanView[] = [];
  for (const r of [...latest.values()].sort((a, b) => a.fileName.localeCompare(b.fileName))) {
    const counts = vmbScanCountsSchema.safeParse(r.counts);
    const unread = vmbScanUnreadSchema.safeParse(r.unread);
    if (!counts.success || !unread.success) continue;
    const e = counts.data.entities;
    out.push({
      fileName: r.fileName,
      round: r.round,
      counts: counts.data,
      share: e.total ? e.read / e.total : null,
      inkCoverage: r.inkCoverage,
      unread: unread.data,
      scannedAt: r.createdAt.toISOString(),
    });
  }
  return out;
}
