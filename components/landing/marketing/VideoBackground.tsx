"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Live stock loop (typing / laptop). Regenerate: `npm run marketing:hero-video`. */
const VIDEO_DESKTOP = "/marketing/hero-cinematic.mp4";
const VIDEO_MOBILE = "/marketing/hero-cinematic-mobile.mp4";
const VIDEO_POSTER = "/marketing/hero-cinematic-poster.jpg";

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

export default function VideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState(VIDEO_DESKTOP);
  const [mounted, setMounted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [staticOnly, setStaticOnly] = useState(false);

  useEffect(() => {
    setMounted(true);
    setVideoSrc(pickVideoSrc());

    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const onViewportChange = () => setVideoSrc(pickVideoSrc());
    mobileQuery.addEventListener("change", onViewportChange);
    return () => mobileQuery.removeEventListener("change", onViewportChange);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (prefersReducedMotionNow()) {
      setStaticOnly(true);
      setIsPlaying(false);
      return;
    }

    setStaticOnly(false);

    const el = videoRef.current;
    if (!el) return;

    let cancelled = false;
    let retryTimer: number | undefined;

    const markPlaying = () => {
      if (!cancelled) setIsPlaying(true);
    };

    const tryPlay = () => {
      if (cancelled || !el) return;
      el.muted = true;
      el.defaultMuted = true;
      el.playsInline = true;
      void el
        .play()
        .then(markPlaying)
        .catch(() => {
          /* keep poster until playback actually starts */
        });
    };

    const scheduleRetry = () => {
      if (retryTimer !== undefined) window.clearInterval(retryTimer);
      retryTimer = window.setInterval(() => {
        if (cancelled || el.paused === false) {
          if (retryTimer !== undefined) window.clearInterval(retryTimer);
          return;
        }
        tryPlay();
      }, 700);
    };

    const onPlaying = () => {
      markPlaying();
      if (retryTimer !== undefined) window.clearInterval(retryTimer);
    };

    const onCanPlay = () => tryPlay();
    const onLoadedData = () => tryPlay();
    const onVisibility = () => {
      if (document.visibilityState === "visible") tryPlay();
    };
    const onPageShow = () => {
      setIsPlaying(false);
      el.load();
      tryPlay();
      scheduleRetry();
    };
    const onInteraction = () => tryPlay();

    el.addEventListener("playing", onPlaying);
    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("loadeddata", onLoadedData);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("touchstart", onInteraction, { passive: true });
    document.addEventListener("click", onInteraction);

    el.load();
    tryPlay();
    scheduleRetry();

    const stopRetry = window.setTimeout(() => {
      if (retryTimer !== undefined) window.clearInterval(retryTimer);
    }, 20_000);

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearInterval(retryTimer);
      window.clearTimeout(stopRetry);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("loadeddata", onLoadedData);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("touchstart", onInteraction);
      document.removeEventListener("click", onInteraction);
    };
  }, [mounted, videoSrc]);

  const posterLayer = (
    <div
      className={`mkt-video-poster-fallback absolute inset-0 bg-cover bg-center transition-opacity duration-700 ${
        isPlaying ? "opacity-0" : "opacity-100"
      }`}
      style={{ backgroundImage: `url(${VIDEO_POSTER})` }}
    />
  );

  const layer = (
    <div
      className="mkt-video-shell pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#020617]"
      aria-hidden
    >
      {staticOnly ? (
        posterLayer
      ) : (
        <>
          {posterLayer}
          <video
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
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(212,168,83,0.15), transparent 60%), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(52,211,153,0.12), transparent 55%)",
        }}
      />
    </div>
  );

  if (!mounted) {
    return (
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[#020617]"
        aria-hidden
      />
    );
  }

  return createPortal(layer, document.body);
}
