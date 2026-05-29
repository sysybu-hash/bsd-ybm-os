"use client";

import { useEffect, useRef, useState } from "react";

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
  const [videoSrc] = useState(pickVideoSrc);
  const [videoReady, setVideoReady] = useState(false);
  const [staticOnly, setStaticOnly] = useState(false);

  useEffect(() => {
    if (prefersReducedMotionNow()) {
      setStaticOnly(true);
      return;
    }

    const el = videoRef.current;
    if (!el) return;

    let cancelled = false;

    const markReady = () => {
      if (!cancelled) setVideoReady(true);
    };

    const tryPlay = () => {
      void el.play()
        .then(markReady)
        .catch(() => {
          if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            markReady();
          }
        });
    };

    const onLoadedData = () => {
      markReady();
      tryPlay();
    };

    const onCanPlay = () => tryPlay();

    const onVisibility = () => {
      if (document.visibilityState === "visible") tryPlay();
    };

    const onFirstInteraction = () => tryPlay();

    el.addEventListener("loadeddata", onLoadedData);
    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("playing", markReady);

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("touchstart", onFirstInteraction, { once: true, passive: true });
    document.addEventListener("click", onFirstInteraction, { once: true });

    el.load();
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      onLoadedData();
    }

    return () => {
      cancelled = true;
      el.removeEventListener("loadeddata", onLoadedData);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("playing", markReady);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("touchstart", onFirstInteraction);
      document.removeEventListener("click", onFirstInteraction);
    };
  }, [videoSrc]);

  const posterLayer = (
    <div
      className="mkt-video-poster-fallback absolute inset-0 bg-cover bg-center"
      style={{ backgroundImage: `url(${VIDEO_POSTER})` }}
    />
  );

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#020617]"
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
              videoReady ? "opacity-100" : "opacity-0"
            }`}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
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
}
