"use client";

import { useEffect, useRef, useState } from "react";

/** Live stock loop (typing / laptop). Regenerate: `npm run marketing:hero-video`. */
const VIDEO_SRC = "/marketing/hero-cinematic.mp4";
const POSTER_SRC = "/marketing/01-marketing-landing.png";

export default function VideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoActive, setVideoActive] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const markPlaying = () => setVideoActive(true);

    const tryPlay = () => {
      void el.play().then(markPlaying).catch(() => {
        /* autoplay blocked or load failed — poster stays visible */
      });
    };

    el.addEventListener("playing", markPlaying);
    el.addEventListener("canplay", tryPlay);

    if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      tryPlay();
    }

    return () => {
      el.removeEventListener("playing", markPlaying);
      el.removeEventListener("canplay", tryPlay);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <video
        ref={videoRef}
        className={`mkt-video-bg absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
          videoActive ? "opacity-100" : "opacity-0"
        }`}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster={POSTER_SRC}
      >
        <source src={VIDEO_SRC} type="video/mp4" />
      </video>
      {!videoActive ? (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${POSTER_SRC})` }}
        />
      ) : null}
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
