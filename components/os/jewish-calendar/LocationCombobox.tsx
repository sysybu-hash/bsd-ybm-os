"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import type { JewishCalendarLocation } from "@/lib/jewish-calendar/types";

type Props = {
  label: string;
  useMyLocationLabel: string;
  dir: "rtl" | "ltr";
  onSelect: (loc: JewishCalendarLocation) => void;
  onUseMyLocation: () => void;
};

export function LocationCombobox({ label, useMyLocationLabel, dir, onSelect, onUseMyLocation }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<JewishCalendarLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jewish-calendar/locations?q=${encodeURIComponent(q)}&limit=15`);
      if (!res.ok) return;
      const json = (await res.json()) as { locations: JewishCalendarLocation[] };
      setResults(json.locations ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void search(query), 200);
    return () => window.clearTimeout(t);
  }, [open, query, search]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1" dir={dir}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-2.5 py-1.5 text-start text-xs font-medium text-[color:var(--foreground-main)]"
      >
        <MapPin size={14} className="shrink-0 text-indigo-500" aria-hidden />
        <span className="truncate">{label}</span>
      </button>
      {open ? (
        <div className="absolute start-0 top-full z-50 mt-1 w-full min-w-[14rem] rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-2 shadow-lg">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש עיר…"
            className="mb-2 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-2 py-1.5 text-xs"
            dir={dir}
          />
          <button
            type="button"
            onClick={() => {
              onUseMyLocation();
              setOpen(false);
              window.dispatchEvent(new CustomEvent("jewish-calendar:prefs-changed"));
            }}
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-300"
          >
            <Navigation size={14} aria-hidden />
            {useMyLocationLabel}
          </button>
          <ul className="max-h-48 overflow-y-auto">
            {loading ? (
              <li className="px-2 py-2 text-xs text-[color:var(--foreground-muted)]">…</li>
            ) : (
              results.map((loc) => (
                <li key={loc.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-2 py-1.5 text-start text-xs hover:bg-[color:var(--surface-soft)]"
                    onClick={() => {
                      onSelect(loc);
                      setOpen(false);
                      window.dispatchEvent(new CustomEvent("jewish-calendar:prefs-changed"));
                    }}
                  >
                    {loc.nameHe}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
