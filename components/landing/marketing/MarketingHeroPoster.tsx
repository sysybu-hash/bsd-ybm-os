import ReactDOM from "react-dom";

/**
 * LCP poster — full-screen hero background. It is the largest contentful
 * element, so load it eagerly at high priority to minimise LCP (lazy/low
 * previously pushed LCP to ~3.6s on mobile).
 */
export default function MarketingHeroPoster() {
  // Earliest possible fetch of the LCP background (before HTML body parse).
  ReactDOM.preload("/marketing/hero-cinematic-poster.webp", {
    as: "image",
    type: "image/webp",
    fetchPriority: "high",
  });
  return (
    <div className="mkt-video-shell pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <picture>
        <source srcSet="/marketing/hero-cinematic-poster.webp" type="image/webp" />
        <img
          src="/marketing/hero-cinematic-poster.jpg"
          alt=""
          width={1920}
          height={1080}
          sizes="100vw"
          decoding="async"
          loading="eager"
          fetchPriority="high"
          className="mkt-video-poster-img absolute inset-0 h-full w-full object-cover"
        />
      </picture>
      <div className="mkt-video-overlay absolute inset-0" />
      <div className="mkt-video-tint absolute inset-0 opacity-40" />
    </div>
  );
}
