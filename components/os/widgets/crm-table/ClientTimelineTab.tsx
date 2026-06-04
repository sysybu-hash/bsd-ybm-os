"use client";

import React, { useEffect, useState } from "react";
import { formatShortDate } from "@/lib/ui-formatters";
import type { ContactTimelineEvent } from "./types";

type Props = {
  clientId: string;
  t: (key: string) => string;
};

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

  if (loading) return <p className="text-sm text-slate-500">{t("workspaceWidgets.crmTable.timelineLoading")}</p>;

  if (timeline.length === 0) return (
    <p className="text-sm text-slate-500">{t("workspaceWidgets.crmTable.timelineEmpty")}</p>
  );

  return (
    <ul className="space-y-3">
      {timeline.map((ev) => (
        <li key={ev.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5">
          <div className="mb-1 flex justify-between gap-2 text-xs text-slate-500">
            <span className="font-bold uppercase tracking-wider">{ev.kind}</span>
            <time dateTime={ev.at}>{formatShortDate(ev.at)}</time>
          </div>
          <p className="font-bold text-slate-900 dark:text-white">{ev.title}</p>
          {ev.detail ? <p className="mt-1 text-xs text-slate-500">{ev.detail}</p> : null}
        </li>
      ))}
    </ul>
  );
}
