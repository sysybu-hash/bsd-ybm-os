"use client";



import { Square, Video, VideoOff } from "lucide-react";

import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/components/os/system/I18nProvider";

import { pickVideoRecorderMime, useCameraStream } from "@/hooks/useCameraStream";

import CameraPreviewFrame from "./CameraPreviewFrame";



const MAX_SEC = 90;



type Props = {

  hasVideo: boolean;

  onVideo: (blob: Blob) => Promise<void>;

  uploading: boolean;

};



export default function VideoCapturePanel({ hasVideo, onVideo, uploading }: Props) {

  const { t } = useI18n();

  const { videoRef, streamRef, active, opening, previewOpen, error, setError, start, stop, flip } =
    useCameraStream({
      audio: true,
    });

  const [recording, setRecording] = useState(false);

  const [elapsedSec, setElapsedSec] = useState(0);

  const recRef = useRef<MediaRecorder | null>(null);

  const chunksRef = useRef<Blob[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  const clearTimers = useCallback(() => {

    if (timerRef.current) clearInterval(timerRef.current);

    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);

    timerRef.current = null;

    maxTimerRef.current = null;

  }, []);



  const stopRecording = useCallback(() => {

    clearTimers();

    recRef.current?.stop();

    recRef.current = null;

    setRecording(false);

    setElapsedSec(0);

  }, [clearTimers]);



  const closeCamera = useCallback(() => {

    stopRecording();

    stop();

  }, [stop, stopRecording]);



  const startRecording = useCallback(async () => {

    setError(null);

    try {

      if (!active) await start();

      const stream = streamRef.current;

      if (!stream) throw new Error("no stream");



      const mime = pickVideoRecorderMime();

      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);

      chunksRef.current = [];

      rec.ondataavailable = (e) => {

        if (e.data.size > 0) chunksRef.current.push(e.data);

      };

      rec.onstop = () => {

        const type = rec.mimeType || mime || "video/webm";

        const blob = new Blob(chunksRef.current, { type });

        stop();

        void onVideo(blob);

      };

      recRef.current = rec;

      rec.start(1000);

      setRecording(true);

      setElapsedSec(0);

      timerRef.current = setInterval(() => {

        setElapsedSec((s) => s + 1);

      }, 1000);

      maxTimerRef.current = setTimeout(() => stopRecording(), MAX_SEC * 1000);

    } catch {

      stopRecording();

      setError(t("workspaceWidgets.fieldCopilot.cameraError"));

    }

  }, [active, onVideo, setError, start, stop, stopRecording, streamRef, t]);



  const openPreview = useCallback(async () => {

    setError(null);

    try {

      await start();

    } catch {

      setError(t("workspaceWidgets.fieldCopilot.cameraError"));

    }

  }, [setError, start, t]);



  useEffect(() => {

    return () => {

      clearTimers();

      stop();

    };

  }, [clearTimers, stop]);



  const showPreview = previewOpen;



  return (

    <section className="rounded-xl border border-[color:var(--border-main)] p-4">

      <h4 className="mb-2 font-bold">{t("workspaceWidgets.fieldCopilot.videoTitle")}</h4>

      <p className="mb-3 text-xs text-[color:var(--foreground-muted)]">

        {hasVideo ? t("workspaceWidgets.fieldCopilot.videoSaved") : t("workspaceWidgets.fieldCopilot.videoHint")}

      </p>



      {error ? (

        <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">

          {t("workspaceWidgets.fieldCopilot.cameraError")}

        </p>

      ) : null}



      {showPreview ? (

        <div className="mb-3 space-y-3">

          <CameraPreviewFrame

            videoRef={videoRef}

            recording={recording}

            elapsedSec={elapsedSec}

            maxSec={MAX_SEC}

            onFlip={() => void flip()}

            flipDisabled={uploading || recording || opening}

          />

          {opening ? (

            <p className="text-center text-xs text-[color:var(--foreground-muted)]">

              {t("workspaceWidgets.fieldCopilot.cameraOpening")}

            </p>

          ) : null}

          <div className="flex flex-wrap gap-2">

            {recording ? (

              <button

                type="button"

                disabled={uploading}

                onClick={stopRecording}

                className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 font-bold text-white disabled:opacity-40"

              >

                <Square size={20} />

                {t("workspaceWidgets.fieldCopilot.videoStop")}

              </button>

            ) : (

              <>

                <button

                  type="button"

                  disabled={uploading || opening || !active}

                  onClick={() => void startRecording()}

                  className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 font-bold text-white disabled:opacity-40"

                >

                  <Video size={20} />

                  {t("workspaceWidgets.fieldCopilot.videoStart")}

                </button>

                <button

                  type="button"

                  disabled={uploading || opening}

                  onClick={closeCamera}

                  className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[color:var(--border-main)] px-4 font-bold"

                >

                  <VideoOff size={18} />

                  {t("workspaceWidgets.fieldCopilot.cameraClose")}

                </button>

              </>

            )}

          </div>

        </div>

      ) : (

        <button

          type="button"

          disabled={uploading || opening}

          onClick={() => void openPreview()}

          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-violet-600 font-bold text-white disabled:opacity-40"

        >

          <Video size={20} />

          {opening

            ? t("workspaceWidgets.fieldCopilot.cameraOpening")

            : t("workspaceWidgets.fieldCopilot.cameraOpenVideo")}

        </button>

      )}

    </section>

  );

}


