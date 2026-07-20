"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { DaySnapshot } from "@/lib/jewish-calendar/types";
import { dayKey } from "./types";

type Props = {
  day: Date;
  labels: {
    title: string;
    loading: string;
    loadFailed: string;
  };
};

function formatZman(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function PlannerZmanimPane({ day, labels }: Props) {
  const [data, setData] = useState<DaySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const dateIso = dayKey(day);

  const fetchDay = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/jewish-calendar/day?date=${encodeURIComponent(dateIso)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("fail");
      setData((await res.json()) as DaySnapshot);
    } catch {
      setError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dateIso]);

  useEffect(() => {
    void fetchDay();
  }, [fetchDay]);

  return (
    <aside className="flex min-h-0 flex-col border border-[color:var(--classic-rule,#e7e5e4)]">
      <div className="border-b border-[color:var(--classic-rule,#e7e5e4)] px-3 py-2.5">
        <h3 className="text-sm font-bold text-[color:var(--classic-ink,#1c1917)]">{labels.title}</h3>
        {data ? (
          <p className="mt-0.5 text-xs text-[color:var(--classic-muted,#78716c)]">
            {data.hebrew.displayHe}
            {data.parasha ? ` · ${data.parasha}` : ""}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-8 text-[color:var(--classic-muted,#78716c)]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span className="sr-only">{labels.loading}</span>
        </div>
      ) : error || !data ? (
        <p className="px-3 py-6 text-sm text-[color:var(--classic-muted,#78716c)]">{labels.loadFailed}</p>
      ) : (
        <ul className="max-h-[420px] divide-y divide-[color:var(--classic-rule,#e7e5e4)] overflow-y-auto">
          {data.zmanim.map((z) => (
            <li key={z.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="text-[color:var(--classic-ink,#1c1917)]">{z.labelHe}</span>
              <span className="shrink-0 font-semibold tabular-nums text-[color:var(--classic-muted,#78716c)]">
                {formatZman(z.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
