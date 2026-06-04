"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const VIDEO_DESKTOP = "/marketing/hero-cinematic.mp4";
const VIDEO_MOBILE = "/marketing/hero-cinematic-mobile.mp4";
const PAGE_SHOW_RESTORE = "marketing:pageshow-restore";

function prefersReducedMotionNow(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("reduce-motion")
  );
}

function pickVideoSources(): { mp4: string } {
  if (typeof window === "undefined") {
    return { mp4: VIDEO_DESKTOP };
  }
  const mobile = window.matchMedia("(max-width: 767px)").matches;
  return { mp4: mobile ? VIDEO_MOBILE : VIDEO_DESKTOP };
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

function scheduleDeferredPlay(run: () => void) {
  if (typeof window === "undefined") return;
  const start = () => {
    const w = window as Window & { requestIdleCallback?: typeof requestIdleCallback };
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(() => run(), { timeout: 4000 });
    } else {
      globalThis.setTimeout(run, 800);
    }
  };
  if (document.readyState === "complete") {
    start();
  } else {
    window.addEventListener("load", start, { once: true });
  }
}

export default function VideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [sources, setSources] = useState<{ mp4: string } | null>(null);
  const [mountVideo, setMountVideo] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [staticOnly, setStaticOnly] = useState(false);

  const bindPlayback = useCallback(() => {
    const el = videoRef.current;
    if (!el || staticOnly || !mountVideo) return () => undefined;

    let cancelled = false;
    let retryTimer: number | undefined;

    const markPlaying = () => {
      if (!cancelled) setIsPlaying(true);
    };

    const tryPlay = () => {
      if (cancelled) return;
      primeVideoElement(el);
      void el.play().then(markPlaying).catch(() => undefined);
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
      el.load();
      tryPlay();
      scheduleRetry();
    };

    el.addEventListener("playing", onPlaying);
    el.addEventListener("canplay", tryPlay);

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
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener(PAGE_SHOW_RESTORE, onRestore);
      document.removeEventListener("touchstart", onInteraction);
      document.removeEventListener("click", onInteraction);
    };
  }, [staticOnly, mountVideo]);

  useEffect(() => {
    setSources(pickVideoSources());
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const onViewportChange = () => {
      setSources(pickVideoSources());
      setIsPlaying(false);
      setMountVideo(false);
      if (!mobileQuery.matches && !prefersReducedMotionNow()) {
        scheduleDeferredPlay(() => setMountVideo(true));
      }
    };
    mobileQuery.addEventListener("change", onViewportChange);
    return () => mobileQuery.removeEventListener("change", onViewportChange);
  }, []);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    if (prefersReducedMotionNow() || mobile) {
      setStaticOnly(true);
      setIsPlaying(false);
      setMountVideo(false);
      return;
    }
    setStaticOnly(false);
    scheduleDeferredPlay(() => setMountVideo(true));
  }, []);

  useEffect(() => {
    if (!sources || staticOnly || !mountVideo) return;
    return bindPlayback();
  }, [sources, staticOnly, mountVideo, bindPlayback]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {mountVideo && sources && !staticOnly ? (
        <video
          key={sources.mp4}
          ref={videoRef}
          className={`mkt-video-bg absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            isPlaying ? "opacity-100" : "opacity-0"
          }`}
          loop
          muted
          playsInline
          preload="none"
          disablePictureInPicture
          onError={() => {
            setStaticOnly(true);
            setIsPlaying(false);
            setMountVideo(false);
          }}
        >
          <source src={sources.mp4} type="video/mp4" />
        </video>
      ) : null}
      <div className="mkt-video-overlay absolute inset-0" />
      <div className="mkt-video-tint absolute inset-0 opacity-40" />
    </div>
  );
}
