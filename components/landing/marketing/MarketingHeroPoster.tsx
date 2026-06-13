/** LCP poster — נטען בנמוך כדי שה-H1 (טקסט) יישאר אלמנט ה-LCP */
export default function MarketingHeroPoster() {
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
          loading="lazy"
          fetchPriority="low"
          className="mkt-video-poster-img absolute inset-0 h-full w-full object-cover"
        />
      </picture>
      <div className="mkt-video-overlay absolute inset-0" />
      <div className="mkt-video-tint absolute inset-0 opacity-40" />
    </div>
  );
}
