"use client";

import { isOfficeMime, scanPreviewKind } from "@/lib/scan-preview";

type ScanFilePreviewProps = {
  url: string | null;
  mime: string | null;
  fileName: string;
  emptyLabel: string;
  textContent?: string | null;
  noPreviewHint?: string;
  openInWorkspaceLabel?: string;
  onOpenInWorkspace?: () => void;
};

export default function ScanFilePreview({
  url,
  mime,
  fileName,
  emptyLabel,
  textContent,
  noPreviewHint,
  openInWorkspaceLabel,
  onOpenInWorkspace,
}: ScanFilePreviewProps) {
  if (!url || !mime) {
    return <p className="text-sm text-[color:var(--foreground-muted)]">{emptyLabel}</p>;
  }

  const kind = scanPreviewKind(mime);

  if (kind === "image") {
    return (
      <img
        src={url}
        alt={fileName}
        className="mx-auto max-h-[min(60dvh,560px)] w-full rounded-lg border border-[color:var(--border-main)] object-contain"
      />
    );
  }

  if (kind === "pdf") {
    return (
      <iframe
        src={url}
        title={fileName}
        className="h-[min(60dvh,560px)] w-full rounded-lg border border-[color:var(--border-main)] bg-white"
      />
    );
  }

  if (kind === "text" && textContent != null) {
    return (
      <pre className="custom-scrollbar max-h-[min(50dvh,480px)] overflow-auto rounded-lg border border-[color:var(--border-main)] bg-black/20 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-[color:var(--foreground-main)]">
        {textContent.slice(0, 120_000)}
      </pre>
    );
  }

  const hint =
    noPreviewHint ??
    (isOfficeMime(mime)
      ? "תצוגה מקדימה אינה זמינה לקבצי Office בדפדפן."
      : emptyLabel);

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[color:var(--border-main)] bg-[color:var(--surface-card)]/40 px-4 py-6 text-center">
      <p className="text-sm text-[color:var(--foreground-muted)]">{hint}</p>
      <PreviewFallbackActions
        url={url}
        fileName={fileName}
        openInWorkspaceLabel={openInWorkspaceLabel}
        onOpenInWorkspace={onOpenInWorkspace}
      />
    </div>
  );
}

function PreviewFallbackActions({
  url,
  fileName,
  openInWorkspaceLabel,
  onOpenInWorkspace,
}: {
  url: string;
  fileName: string;
  openInWorkspaceLabel?: string;
  onOpenInWorkspace?: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {onOpenInWorkspace && openInWorkspaceLabel ? (
        <button
          type="button"
          onClick={onOpenInWorkspace}
          className="rounded-lg border border-[color:var(--border-main)] px-3 py-1.5 text-[11px] font-bold text-[color:var(--foreground-main)] hover:bg-[color:var(--surface-card)]"
        >
          {openInWorkspaceLabel}
        </button>
      ) : null}
      <a
        href={url}
        download={fileName}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-500"
      >
        הורדה
      </a>
    </div>
  );
}
