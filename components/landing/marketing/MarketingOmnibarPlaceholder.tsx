/** שומר מקום ל-Omnibar לפני טעינת איילנד (מונע CLS) */
export default function MarketingOmnibarPlaceholder() {
  return (
    <section
      className="relative -mt-2 px-4 pb-6 sm:px-6 sm:pb-10 md:fixed md:inset-x-0 md:bottom-4 md:z-40 md:mt-0 md:px-6 md:pb-0"
      aria-hidden
    >
      <div className="mx-auto h-[11.5rem] max-w-2xl rounded-2xl border border-white/10 bg-slate-950/20 md:max-w-3xl" />
    </section>
  );
}
