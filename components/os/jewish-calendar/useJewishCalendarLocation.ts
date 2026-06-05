"use client";

import { useCallback, useEffect, useState } from "react";
import { getDefaultLocation } from "@/lib/jewish-calendar/locations";
import {
  buildDayQueryParams,
  readJewishCalendarPrefs,
  writeJewishCalendarPrefs,
} from "@/lib/jewish-calendar/prefs";
import type { JewishCalendarLocation } from "@/lib/jewish-calendar/types";

const GEO_TIMEOUT_MS = 8000;

export function useJewishCalendarLocation() {
  const [ready, setReady] = useState(false);
  const [geoDenied, setGeoDenied] = useState(false);
  const [locationLabel, setLocationLabel] = useState(getDefaultLocation().nameHe);

  const resolveLabel = useCallback((prefs: ReturnType<typeof readJewishCalendarPrefs>) => {
    if (prefs?.locationId) {
      const fromApi = prefs.locationId;
      if (fromApi === "custom") return "מיקום מותאם";
    }
    return getDefaultLocation().nameHe;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const existing = readJewishCalendarPrefs();
      if (existing?.locationId || (existing?.lat != null && existing?.lng != null)) {
        if (!cancelled) {
          setLocationLabel(resolveLabel(existing));
          setGeoDenied(Boolean(existing.geoDeniedAt));
          setReady(true);
        }
        return;
      }

      if (existing?.geoDeniedAt) {
        writeJewishCalendarPrefs({
          source: "city",
          locationId: getDefaultLocation().id,
          geoDeniedAt: existing.geoDeniedAt,
        });
        if (!cancelled) {
          setGeoDenied(true);
          setLocationLabel(getDefaultLocation().nameHe);
          setReady(true);
        }
        return;
      }

      if (!navigator.geolocation) {
        writeJewishCalendarPrefs({ source: "city", locationId: getDefaultLocation().id });
        if (!cancelled) setReady(true);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
        writeJewishCalendarPrefs({
          source: "geolocation",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          elevation: pos.coords.altitude ?? undefined,
        });
        setLocationLabel("מיקום שלי");
        window.dispatchEvent(new CustomEvent("jewish-calendar:prefs-changed"));
        setReady(true);
        },
        () => {
          if (cancelled) return;
          writeJewishCalendarPrefs({
            source: "city",
            locationId: getDefaultLocation().id,
            geoDeniedAt: new Date().toISOString(),
          });
          setGeoDenied(true);
          setLocationLabel(getDefaultLocation().nameHe);
          setReady(true);
        },
        { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 600_000 },
      );
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [resolveLabel]);

  const setCity = useCallback((loc: JewishCalendarLocation) => {
    writeJewishCalendarPrefs({ source: "city", locationId: loc.id });
    setLocationLabel(loc.nameHe);
    setGeoDenied(false);
    window.dispatchEvent(new CustomEvent("jewish-calendar:prefs-changed"));
  }, []);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        writeJewishCalendarPrefs({
          source: "geolocation",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          elevation: pos.coords.altitude ?? undefined,
        });
        setLocationLabel("מיקום שלי");
        setGeoDenied(false);
        window.dispatchEvent(new CustomEvent("jewish-calendar:prefs-changed"));
      },
      () => {
        setGeoDenied(true);
      },
      { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 0 },
    );
  }, []);

  const queryParams = useCallback(
    (date?: string) => buildDayQueryParams(readJewishCalendarPrefs(), date),
    [],
  );

  return { ready, geoDenied, locationLabel, setCity, useMyLocation, queryParams };
}
