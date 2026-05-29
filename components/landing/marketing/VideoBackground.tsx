"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Live stock loop (typing / laptop). Regenerate: `npm run marketing:hero-video`. */
const VIDEO_DESKTOP = "/marketing/hero-cinematic.mp4";
const VIDEO_MOBILE = "/marketing/hero-cinematic-mobile.mp4";
const VIDEO_POSTER = "/marketing/hero-cinematic-poster.jpg";

const PAGE_SHOW_RESTORE = "marketing:pageshow-restore";

function prefersReducedMotionNow(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("reduce-motion")
  );
}

function pickVideoSrc(): string {
  if (typeof window === "undefined") return VIDEO_DESKTOP;
  return window.matchMedia("(max-width: 767px)").matches ? VIDEO_MOBILE : VIDEO_DESKTOP;
}

function primeVideoElement(el: HTMLVideoElement) {
  el.muted = true;
  el.defaultMuted = true;
  el.playsInline = true;
  el.setAttribute("muted", "");
  el.setAttribute("playsinline", "");
  el.setAttribute("webkit-playsinline", "");
  el.setAttribute("disablepictureinpicture", "");
}

export default function VideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [staticOnly, setStaticOnly] = useState(false);

  const bindPlayback = useCallback(() => {
    const el = videoRef.current;
    if (!el || staticOnly) return () => undefined;

    let cancelled = false;
    let retryTimer: number | undefined;

    const markPlaying = () => {
      if (!cancelled) setIsPlaying(true);
    };

    const tryPlay = () => {
      if (cancelled) return;
      primeVideoElement(el);
      void el.play().then(markPlaying).catch(() => {
        /* poster stays until playing */
      });
    };

    const scheduleRetry = () => {
      if (retryTimer !== undefined) window.clearInterval(retryTimer);
      retryTimer = window.setInterval(() => {
        if (cancelled || !el.paused) {
          if (retryTimer !== undefined) window.clearInterval(retryTimer);
          return;
        }
        tryPlay();
      }, 600);
    };

    const onPlaying = () => {
      markPlaying();
      if (retryTimer !== undefined) window.clearInterval(retryTimer);
    };

    const restart = () => {
      if (cancelled) return;
      setIsPlaying(false);
      primeVideoElement(el);
      if (el.src) {
        el.load();
      }
      tryPlay();
      scheduleRetry();
    };

    el.addEventListener("playing", onPlaying);
    el.addEventListener("canplay", tryPlay);
    el.addEventListener("loadeddata", tryPlay);

    const onVisibility = () => {
      if (document.visibilityState === "visible") tryPlay();
    };
    const onPageShow = () => restart();
    const onRestore = () => restart();
    const onInteraction = () => tryPlay();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener(PAGE_SHOW_RESTORE, onRestore);
    document.addEventListener("touchstart", onInteraction, { passive: true });
    document.addEventListener("click", onInteraction);

    restart();

    const stopRetry = window.setTimeout(() => {
      if (retryTimer !== undefined) window.clearInterval(retryTimer);
    }, 25_000);

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearInterval(retryTimer);
      window.clearTimeout(stopRetry);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("canplay", tryPlay);
      el.removeEventListener("loadeddata", tryPlay);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener(PAGE_SHOW_RESTORE, onRestore);
      document.removeEventListener("touchstart", onInteraction);
      document.removeEventListener("click", onInteraction);
    };
  }, [staticOnly]);

  useEffect(() => {
    setVideoSrc(pickVideoSrc());
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const onViewportChange = () => {
      setVideoSrc(pickVideoSrc());
      setIsPlaying(false);
    };
    mobileQuery.addEventListener("change", onViewportChange);
    return () => mobileQuery.removeEventListener("change", onViewportChange);
  }, []);

  useEffect(() => {
    if (prefersReducedMotionNow()) {
      setStaticOnly(true);
      setIsPlaying(false);
      return;
    }
    setStaticOnly(false);
  }, []);

  useEffect(() => {
    if (!videoSrc || staticOnly) return;
    return bindPlayback();
  }, [videoSrc, staticOnly, bindPlayback]);

  const posterLayer = (
    <div
      className={`mkt-video-poster-fallback absolute inset-0 bg-cover bg-center transition-opacity duration-700 ${
        isPlaying ? "opacity-0" : "opacity-100"
      }`}
      style={{ backgroundImage: `url(${VIDEO_POSTER})` }}
    />
  );

  return (
    <div className="mkt-video-shell pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {staticOnly || !videoSrc ? (
        posterLayer
      ) : (
        <>
          {posterLayer}
          <video
            key={videoSrc}
            ref={videoRef}
            src={videoSrc}
            className={`mkt-video-bg absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
              isPlaying ? "opacity-100" : "opacity-0"
            }`}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
          />
        </>
      )}
      <div className="mkt-video-overlay absolute inset-0" />
      <div className="mkt-video-tint absolute inset-0 opacity-40" />
    </div>
  );
}
