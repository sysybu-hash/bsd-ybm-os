/**
 * Minimal above-the-fold CSS inlined in HTML so hero text (LCP) paints before
 * external CSS chunks finish downloading. Keep in sync with marketing-cinematic-critical.css.
 */
export const MARKETING_HERO_CRITICAL_INLINE_CSS = `
.marketing-cinematic{--mkt-nav-height:4.25rem;--mkt-accent:#d4a853;--mkt-accent-glow:rgba(212,168,83,.45);--mkt-eyebrow:#fcd34d;--mkt-body-bg:#020617;--mkt-fg:#f8fafc;--mkt-fg-muted:#cbd5e1;color-scheme:dark;background:transparent;color:var(--mkt-fg);isolation:isolate}
.mkt-hero-section,.mkt-hero-section *{font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif!important}
html.light .marketing-cinematic{--mkt-accent:#92400e;--mkt-accent-glow:rgba(180,134,46,.28);--mkt-eyebrow:#b45309;--mkt-body-bg:#f1f5f9;--mkt-fg:#020617;--mkt-fg-muted:#334155;color-scheme:light}
body:has(.marketing-cinematic){background-color:var(--mkt-body-bg)!important;overflow-x:clip}
html:has(.marketing-cinematic){overflow-x:clip}
.mkt-video-shell{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none}
.mkt-video-poster-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.mkt-video-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(2,6,23,.35) 0%,rgba(2,6,23,.72) 55%,rgba(2,6,23,.92) 100%)}
.mkt-video-tint{position:absolute;inset:0;opacity:.4;background-image:radial-gradient(ellipse 80% 50% at 50% 0%,rgba(52,211,153,.18),transparent 60%)}
.mkt-hero-section{position:relative;padding-inline:1rem;padding-bottom:1rem;padding-top:calc(var(--mkt-nav-height,4.25rem) + .25rem)}
.mkt-hero-blessing{margin-bottom:.375rem;font-size:clamp(.9375rem,2.4vw,1.125rem);font-weight:600;line-height:1.45;color:color-mix(in srgb,var(--mkt-fg) 78%,var(--mkt-eyebrow))}
.mkt-eyebrow{margin-bottom:.375rem;font-size:.875rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mkt-eyebrow)}
.mkt-hero-motto{margin-bottom:.75rem;font-weight:900;font-size:clamp(1.75rem,3.6vw + .5rem,3.25rem);line-height:1.15;color:var(--mkt-eyebrow);text-shadow:0 0 36px var(--mkt-accent-glow)}
.mkt-hero-title{font-size:clamp(2.25rem,4.5vw + 1rem,4.5rem);font-weight:900;line-height:1.05;letter-spacing:-.025em;text-shadow:0 0 32px rgba(94,234,212,.45),0 0 64px rgba(165,180,252,.28),0 2px 12px rgba(0,0,0,.55)}
.mkt-hero-title-line1{display:block;color:#99f6e4}
.mkt-hero-title-line2{display:block;background:linear-gradient(to left,#c7d2fe,#5eead4);-webkit-background-clip:text;background-clip:text;color:transparent}
.mkt-body-lead{margin-top:.75rem;max-width:42rem;font-size:1rem;line-height:1.625;color:var(--mkt-fg-muted)}
html.light .mkt-hero-title{text-shadow:0 2px 24px rgba(2,6,23,.12),0 0 1px rgba(2,6,23,.08)}
html.light .mkt-hero-title-line1{color:#0d9488}
html.light .mkt-hero-title-line2{background:linear-gradient(to left,#4f46e5,#0d9488);-webkit-background-clip:text;background-clip:text;color:transparent}
html.light .mkt-hero-blessing{color:#475569}
@media (max-width:767px){.marketing-cinematic{--mkt-nav-height:3.5rem}.mkt-hero-title{font-size:clamp(2rem,8vw,2.75rem)}}
`.trim();
