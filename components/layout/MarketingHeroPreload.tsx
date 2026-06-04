/** LCP poster — WebP קטן + JPG fallback; preload ישיר מ-/public (ללא Image Optimizer). */
export default function MarketingHeroPreload() {
  return (
    <>
      <link
        rel="preload"
        as="image"
        href="/marketing/hero-cinematic-poster.webp"
        type="image/webp"
        fetchPriority="high"
      />
    </>
  );
}
