"use client";

import { useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { FieldCopilotDraft } from "@/lib/validation/schemas/field-copilot";
import VoiceCapturePanel from "../capture/VoiceCapturePanel";
import PhotoCaptureGrid from "../capture/PhotoCaptureGrid";
import VideoCapturePanel from "../capture/VideoCapturePanel";
import { VoiceActivityLogger } from "../capture/VoiceActivityLogger";

type Props = {
  draft: FieldCopilotDraft | null;
  onUpdate: (patch: Record<string, unknown>) => Promise<void>;
  uploadAsset: (file: Blob, kind: "photo" | "video" | "keyframe", mimeType: string) => Promise<{ id: string }>;
  deleteAsset: (id: string) => Promise<void>;
};

export default function CaptureStep({ draft, onUpdate, uploadAsset, deleteAsset }: Props) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);

  const photoAssetIds = draft?.capture.photoAssetIds ?? [];

  const handleTranscriptSet = (text: string) => {
    void onUpdate({ transcript: text });
  };

  const handleTranscriptAppend = (text: string) => {
    const prev = draft?.capture.transcript ?? "";
    void onUpdate({ transcript: prev ? `${prev}\n${text}` : text });
  };

  const projectId = draft?.projectId;
  const projectName = draft?.projectName;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto overscroll-y-contain p-4">
      {projectId ? (
        <VoiceActivityLogger
          apiBase={`/api/projects/${projectId}`}
          projectName={projectName}
        />
      ) : null}
      <VoiceCapturePanel
        transcript={draft?.capture.transcript ?? ""}
        onTranscript={handleTranscriptSet}
        onAppendTranscript={handleTranscriptAppend}
        onClearTranscript={() => void onUpdate({ transcript: "" })}
      />

      <PhotoCaptureGrid
        photoAssetIds={photoAssetIds}
        uploading={uploading}
        onPhoto={async (file) => {
          setUploading(true);
          try {
            await uploadAsset(file, "photo", file.type || "image/jpeg");
          } finally {
            setUploading(false);
          }
        }}
        onDeletePhoto={deleteAsset}
      />

      <VideoCapturePanel
        hasVideo={Boolean(draft?.capture.videoAssetId)}
        videoAssetId={draft?.capture.videoAssetId}
        uploading={uploading}
        onVideo={async (blob) => {
          setUploading(true);
          try {
            await uploadAsset(blob, "video", blob.type || "video/webm");
          } finally {
            setUploading(false);
          }
        }}
        onDeleteVideo={() => deleteAsset(draft?.capture.videoAssetId ?? "")}
      />

      <label className="block text-sm">
        <span className="mb-1 block font-bold">{t("workspaceWidgets.fieldCopilot.notesLabel")}</span>
        <textarea
          className="min-h-[80px] w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          value={draft?.capture.userNotes ?? ""}
          onChange={(e) => void onUpdate({ userNotes: e.target.value })}
          dir="auto"
        />
      </label>
    </div>
  );
}
