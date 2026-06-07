"use client";

import { useCallback, useEffect, useState } from "react";
import { getDefaultLocation, getLocationById } from "@/lib/jewish-calendar/locations";
import {
  buildDayQueryParams,
  migrateJewishCalendarPrefs,
  readJewishCalendarPrefs,
  writeJewishCalendarPrefs,
} from "@/lib/jewish-calendar/prefs";
import type { JewishCalendarLocation } from "@/lib/jewish-calendar/types";

const GEO_TIMEOUT_MS = 8000;
const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: GEO_TIMEOUT_MS,
  maximumAge: 600_000,
};

type GeoPermissionState = "granted" | "prompt" | "denied" | "unsupported";

async function queryGeoPermission(): Promise<GeoPermissionState> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return "unsupported";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    if (status.state === "granted" || status.state === "prompt" || status.state === "denied") {
      return status.state;
    }
  } catch {
    // Permissions API unavailable (Safari, some WebViews)
  }
  return "prompt";
}

function geoErrorKind(error: GeolocationPositionError): "denied" | "unavailable" | "timeout" {
  if (error.code === error.PERMISSION_DENIED) return "denied";
  if (error.code === error.TIMEOUT) return "timeout";
  return "unavailable";
}

export function useJewishCalendarLocation() {
  const [ready, setReady] = useState(false);
  const [locationHint, setLocationHint] = useState<string | null>(null);
  const [suggestLocationPicker, setSuggestLocationPicker] = useState(false);
  const [locationLabel, setLocationLabel] = useState(getDefaultLocation().nameHe);

  const resolveLabel = useCallback((prefs: ReturnType<typeof readJewishCalendarPrefs>) => {
    if (prefs?.source === "geolocation") return "מיקום שלי";
    if (prefs?.locationId === "custom") return "מיקום מותאם";
    if (prefs?.locationId) {
      return getLocationById(prefs.locationId)?.nameHe ?? getDefaultLocation().nameHe;
    }
    return getDefaultLocation().nameHe;
  }, []);

  const applyGeolocation = useCallback((pos: GeolocationPosition) => {
    writeJewishCalendarPrefs({
      source: "geolocation",
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      elevation: pos.coords.altitude ?? undefined,
      userChoseCity: false,
    });
    setLocationLabel("מיקום שלי");
    setLocationHint(null);
    setSuggestLocationPicker(false);
    window.dispatchEvent(new CustomEvent("jewish-calendar:prefs-changed"));
  }, []);

  const requestGeolocation = useCallback(
    (fromUserGesture: boolean) =>
      new Promise<boolean>((resolve) => {
        if (!navigator.geolocation) {
          if (fromUserGesture) {
            setLocationHint("unsupported");
            setSuggestLocationPicker(true);
          }
          resolve(false);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            applyGeolocation(pos);
            resolve(true);
          },
          (err) => {
            const kind = geoErrorKind(err);
            if (kind === "denied") {
              setLocationHint("denied");
              setSuggestLocationPicker(true);
            } else if (fromUserGesture) {
              setLocationHint(kind === "timeout" ? "timeout" : "unavailable");
            }
            resolve(false);
          },
          fromUserGesture ? { ...GEO_OPTIONS, maximumAge: 0 } : GEO_OPTIONS,
        );
      }),
    [applyGeolocation],
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const migrated = migrateJewishCalendarPrefs(readJewishCalendarPrefs());
      if (migrated.changed && migrated.prefs) {
        writeJewishCalendarPrefs(migrated.prefs);
      }
      const prefs = migrated.prefs ?? readJewishCalendarPrefs();

      if (prefs?.locationId || (prefs?.lat != null && prefs?.lng != null)) {
        if (!cancelled) {
          setLocationLabel(resolveLabel(prefs));
          setLocationHint(null);
          setSuggestLocationPicker(false);
          setReady(true);
        }

        if (!prefs.userChoseCity && prefs.source !== "geolocation") {
          const perm = await queryGeoPermission();
          if (!cancelled && perm === "granted") {
            await requestGeolocation(false);
          }
        }
        return;
      }

      const defaultLoc = getDefaultLocation();
      writeJewishCalendarPrefs({ source: "city", locationId: defaultLoc.id });
      if (!cancelled) {
        setLocationLabel(defaultLoc.nameHe);
        setReady(true);
      }

      const perm = await queryGeoPermission();
      if (cancelled) return;

      if (perm === "granted") {
        await requestGeolocation(false);
      } else if (perm === "denied") {
        setLocationHint("choose-city");
        setSuggestLocationPicker(true);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [requestGeolocation, resolveLabel]);

  const setCity = useCallback((loc: JewishCalendarLocation) => {
    writeJewishCalendarPrefs({
      source: "city",
      locationId: loc.id,
      userChoseCity: true,
    });
    setLocationLabel(loc.nameHe);
    setLocationHint(null);
    setSuggestLocationPicker(false);
    window.dispatchEvent(new CustomEvent("jewish-calendar:prefs-changed"));
  }, []);

  const useMyLocation = useCallback(() => {
    void requestGeolocation(true);
  }, [requestGeolocation]);

  const dismissLocationHint = useCallback(() => {
    setLocationHint(null);
    setSuggestLocationPicker(false);
  }, []);

  const queryParams = useCallback(
    (date?: string) => buildDayQueryParams(readJewishCalendarPrefs(), date),
    [],
  );

  return {
    ready,
    locationHint,
    suggestLocationPicker,
    locationLabel,
    setCity,
    useMyLocation,
    dismissLocationHint,
    queryParams,
    /** @deprecated use locationHint */
    geoDenied: locationHint === "denied" || locationHint === "choose-city",
  };
}
