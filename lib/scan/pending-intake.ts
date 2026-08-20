/** העברת קבצים בין Dropzone/Share לסורק המאוחד (באותו טאב דפדפן) */
let pendingFiles: File[] = [];
let autoScan = false;
let source: string | undefined;

export function stashPendingScanIntake(files: File[], opts?: { autoScan?: boolean; source?: string }) {
  pendingFiles = [...files];
  autoScan = opts?.autoScan ?? false;
  source = opts?.source;
}

export function consumePendingScanIntake(): { files: File[]; autoScan: boolean; source?: string } {
  const out = { files: pendingFiles, autoScan, source };
  pendingFiles = [];
  autoScan = false;
  source = undefined;
  return out;
}

export function hasPendingScanIntake(): boolean {
  return pendingFiles.length > 0;
}
