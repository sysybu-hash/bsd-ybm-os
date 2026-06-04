/** שומר מקום ל-Omnibar לפני טעינת איילנד (מונע CLS) */
export default function MarketingOmnibarPlaceholder() {
  return (
    <section
      className="relative -mt-2 px-4 pb-6 sm:px-6 sm:pb-10 md:pb-12"
      aria-hidden
    >
      <div className="mx-auto h-[11.5rem] max-w-2xl rounded-2xl border border-white/10 bg-slate-950/20" />
    </section>
  );
}
