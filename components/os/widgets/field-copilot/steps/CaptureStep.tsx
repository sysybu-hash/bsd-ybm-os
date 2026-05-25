"use client";

import { useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { FieldCopilotDraft } from "@/lib/validation/schemas/field-copilot";
import VoiceCapturePanel from "../capture/VoiceCapturePanel";
import PhotoCaptureGrid from "../capture/PhotoCaptureGrid";
import VideoCapturePanel from "../capture/VideoCapturePanel";

type Props = {
  draft: FieldCopilotDraft | null;
  onUpdate: (patch: Record<string, unknown>) => Promise<void>;
  uploadAsset: (file: Blob, kind: "photo" | "video" | "keyframe", mimeType: string) => Promise<{ id: string }>;
};

export default function CaptureStep({ draft, onUpdate, uploadAsset }: Props) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const photoCount = draft?.capture.photoAssetIds.length ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <VoiceCapturePanel
        transcript={draft?.capture.transcript ?? ""}
        onTranscript={(text) => {
          const prev = draft?.capture.transcript ?? "";
          void onUpdate({ transcript: prev ? `${prev}\n${text}` : text });
        }}
      />
      <PhotoCaptureGrid
        photoCount={photoCount}
        uploading={uploading}
        onPhoto={async (file) => {
          setUploading(true);
          try {
            await uploadAsset(file, "photo", file.type || "image/jpeg");
          } finally {
            setUploading(false);
          }
        }}
      />
      <VideoCapturePanel
        hasVideo={Boolean(draft?.capture.videoAssetId)}
        uploading={uploading}
        onVideo={async (blob) => {
          setUploading(true);
          try {
            await uploadAsset(blob, "video", blob.type || "video/webm");
          } finally {
            setUploading(false);
          }
        }}
      />
      <label className="block text-sm">
        <span className="mb-1 block font-bold">{t("workspaceWidgets.fieldCopilot.notesLabel")}</span>
        <textarea
          className="min-h-[80px] w-full rounded-xl border border-[color:var(--border-main)] p-3"
          value={draft?.capture.userNotes ?? ""}
          onChange={(e) => void onUpdate({ userNotes: e.target.value })}
        />
      </label>
    </div>
  );
}
