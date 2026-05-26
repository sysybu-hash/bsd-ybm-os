"use client";

import { Mic, MicOff } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useGeminiLiveAudio } from "@/hooks/useGeminiLiveAudio";
import { getFieldCopilotLivePrompt } from "@/lib/field-copilot/instruction";

type Props = {
  transcript: string;
  onTranscript: (text: string) => void;
};

export default function VoiceCapturePanel({ transcript, onTranscript }: Props) {
  const { t, locale } = useI18n();
  const [liveOn, setLiveOn] = useState(false);

  const live = useGeminiLiveAudio({
    enabled: liveOn,
    owner: "fieldCopilot",
    systemInstruction: getFieldCopilotLivePrompt(locale),
    locale,
    greetOnConnect: true,
    onUserTranscript: (text, finished) => {
      if (finished && text.trim()) onTranscript(text.trim());
    },
  });

  const toggle = useCallback(() => {
    setLiveOn((v) => !v);
  }, []);

  const status = useMemo(() => {
    if (!liveOn) return t("workspaceWidgets.fieldCopilot.voiceOff");
    return live.statusText ?? t("workspaceWidgets.fieldCopilot.voiceOn");
  }, [live.statusText, liveOn, t]);

  return (
    <section className="rounded-xl border border-[color:var(--border-main)] p-4">
      <h4 className="mb-2 font-bold">{t("workspaceWidgets.fieldCopilot.voiceTitle")}</h4>
      <p className="mb-3 text-xs text-[color:var(--foreground-muted)]">{status}</p>
      <button
        type="button"
        onClick={toggle}
        className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl font-bold ${
          liveOn ? "bg-rose-600 text-white" : "bg-sky-600 text-white"
        }`}
      >
        {liveOn ? <MicOff size={20} /> : <Mic size={20} />}
        {liveOn ? t("workspaceWidgets.fieldCopilot.voiceStop") : t("workspaceWidgets.fieldCopilot.voiceStart")}
      </button>
      {transcript ? (
        <p className="mt-3 rounded-lg bg-[color:var(--surface-soft)] p-3 text-sm whitespace-pre-wrap">{transcript}</p>
      ) : null}
    </section>
  );
}
