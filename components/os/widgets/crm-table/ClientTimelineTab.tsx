"use client";

import React, { useEffect, useState } from "react";
import { formatShortDate } from "@/lib/ui-formatters";
import WidgetState from "@/components/os/WidgetState";
import type { ContactTimelineEvent } from "./types";

type Props = {
  clientId: string;
  t: (key: string) => string;
};

const TIMELINE_KIND_KEYS: Record<string, string> = {
  document: "workspaceWidgets.crmTable.timelineKinds.document",
  quote: "workspaceWidgets.crmTable.timelineKinds.quote",
  project: "workspaceWidgets.crmTable.timelineKinds.project",
  note: "workspaceWidgets.crmTable.timelineKinds.note",
  work_diary: "workspaceWidgets.crmTable.timelineKinds.workDiary",
  status: "workspaceWidgets.crmTable.timelineKinds.status",
};

function timelineKindLabel(kind: string, t: (key: string) => string): string {
  const key = TIMELINE_KIND_KEYS[kind];
  return key ? t(key) : kind;
}

export function ClientTimelineTab({ clientId, t }: Props) {
  const [timeline, setTimeline] = useState<ContactTimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/crm/contacts/${clientId}/timeline`, { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { events?: ContactTimelineEvent[] };
        if (!cancelled) setTimeline(Array.isArray(data.events) ? data.events : []);
      } catch {
        if (!cancelled) setTimeline([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (loading) return <WidgetState variant="loading" message={t("workspaceWidgets.crmTable.timelineLoading")} />;

  if (timeline.length === 0) return (
    <WidgetState variant="empty" message={t("workspaceWidgets.crmTable.timelineEmpty")} />
  );

  return (
    <ul className="space-y-3">
      {timeline.map((ev) => (
        <li key={ev.id} className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-4">
          <div className="mb-1 flex justify-between gap-2 text-xs text-[color:var(--foreground-muted)]">
            <span className="font-bold uppercase tracking-wider">{timelineKindLabel(ev.kind, t)}</span>
            <time dateTime={ev.at}>{formatShortDate(ev.at)}</time>
          </div>
          <p className="font-bold text-[color:var(--foreground-main)]">{ev.title}</p>
          {ev.detail ? <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">{ev.detail}</p> : null}
        </li>
      ))}
    </ul>
  );
}
