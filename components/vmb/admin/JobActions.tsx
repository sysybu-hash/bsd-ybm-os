"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export type JobActionsLabels = { retry: string; benchOn: string; benchOff: string; done: string; errors: Record<string, string> };

const btn = "flex items-center justify-center gap-1.5 rounded-full border border-[color:var(--vmb-line-strong)] px-4 py-2 text-sm font-semibold disabled:opacity-50";

/** What an administrator does with one job: run its project again, or mark it for the zero-touch bench. */
export function JobActions({ workspaceId, projectId, canRetry, bench, labels }: { workspaceId: string; projectId: string; canRetry: boolean; bench: boolean; labels: JobActionsLabels }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async (body: { action: "retry" } | { action: "bench"; on: boolean }) => {
    setBusy(body.action);
    setMsg(null);
    const res = await fetch("/api/vmb/admin/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, workspaceId, projectId }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { code?: string } | null;
    setBusy(null);
    if (res?.ok) {
      setMsg({ ok: true, text: labels.done });
      router.refresh();
    } else setMsg({ ok: false, text: labels.errors[data?.code ?? "failed"] ?? labels.errors.failed ?? "" });
  };

  const spin = (a: string) => (busy === a ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canRetry ? (
          <button type="button" disabled={busy != null} onClick={() => void send({ action: "retry" })} className={btn}>
            {spin("retry")}
            {labels.retry}
          </button>
        ) : null}
        <button type="button" disabled={busy != null} onClick={() => void send({ action: "bench", on: !bench })} className={btn} aria-pressed={bench}>
          {spin("bench")}
          {bench ? labels.benchOff : labels.benchOn}
        </button>
      </div>
      {msg ? <p className={`text-xs ${msg.ok ? "text-[color:var(--vmb-pass)]" : "text-[color:var(--vmb-fail)]"}`}>{msg.text}</p> : null}
    </div>
  );
}
