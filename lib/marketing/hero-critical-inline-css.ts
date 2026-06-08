/**
 * ALL marketing-cinematic CSS inlined in HTML so every above-the-fold element
 * (hero, navbar, omnibar, buttons) paints before external CSS chunks arrive.
 *
 * This is the single source of truth — marketing-cinematic-critical.css is kept
 * as a human-readable reference only and is NO LONGER imported by Next.js.
 * Any edit here should be mirrored in marketing-cinematic-critical.css.
 */
export const MARKETING_HERO_CRITICAL_INLINE_CSS = `
.marketing-cinematic{--mkt-page-max:80rem;--mkt-nav-height:4.25rem;--mkt-accent:#d4a853;--mkt-accent-strong:#e8bc66;--mkt-accent-glow:rgba(212,168,83,.45);--mkt-accent-subtle:rgba(212,168,83,.18);--mkt-brand:#34d399;--mkt-brand-strong:#6ee7b7;--mkt-neon:rgba(52,211,153,.55);--mkt-body-bg:#020617;--mkt-fg:#f8fafc;--mkt-fg-muted:#cbd5e1;--mkt-nav-link:#e2e8f0;--mkt-eyebrow:#fcd34d;--mkt-omnibar-typed:#d1fae5;--mkt-omnibar-label:#94a3b8;--mkt-banner-bg:rgba(2,6,23,.82);--mkt-banner-border:rgba(212,168,83,.28);--mkt-banner-text:#fde68a;--mkt-banner-link:#fef3c7;--mkt-glass-bg:rgba(15,23,42,.4);--mkt-glass-border:rgba(255,255,255,.12);--mkt-icon-well:rgba(15,23,42,.6);color-scheme:dark;background:transparent;color:var(--mkt-fg);isolation:isolate}
html.light .marketing-cinematic{--mkt-accent:#92400e;--mkt-accent-strong:#b45309;--mkt-accent-glow:rgba(180,134,46,.28);--mkt-accent-subtle:rgba(180,134,46,.14);--mkt-brand:#047857;--mkt-brand-strong:#065f46;--mkt-neon:rgba(5,150,105,.35);--mkt-body-bg:#f1f5f9;--mkt-fg:#020617;--mkt-fg-muted:#334155;--mkt-nav-link:#1e293b;--mkt-eyebrow:#b45309;--mkt-omnibar-typed:#020617;--mkt-omnibar-label:#475569;--mkt-demo-surface:#ffffff;--mkt-demo-surface-muted:#f1f5f9;--mkt-demo-border:rgba(15,23,42,.12);--mkt-banner-bg:rgba(255,251,235,.94);--mkt-banner-border:rgba(180,134,46,.22);--mkt-banner-text:#78350f;--mkt-banner-link:#92400e;--mkt-glass-bg:rgba(255,255,255,.78);--mkt-glass-border:rgba(15,23,42,.1);--mkt-icon-well:rgba(241,245,249,.95);color-scheme:light}
body:has(.marketing-cinematic){background-color:var(--mkt-body-bg)!important;overflow-x:clip}
html:has(.marketing-cinematic){overflow-x:clip}
#site-main:has(.marketing-cinematic){background:transparent!important}
.marketing-cinematic>.relative.z-10{width:100%}
.marketing-cinematic main{margin-inline:auto;width:100%;max-width:var(--mkt-page-max)}
.marketing-cinematic .mkt-center-block{margin-inline:auto;width:100%}
.marketing-cinematic .mkt-section-intro{margin-inline:auto;max-width:48rem;text-align:center}
.marketing-cinematic .mkt-glass{border:1px solid var(--mkt-glass-border);background:var(--mkt-glass-bg);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 0 0 1px rgba(255,255,255,.04) inset,0 24px 48px -24px rgba(0,0,0,.65)}
html.light .marketing-cinematic .mkt-glass{box-shadow:0 0 0 1px rgba(255,255,255,.8) inset,0 16px 40px -20px rgba(15,23,42,.12)}
.marketing-cinematic .mkt-glass-strong{border:1px solid var(--mkt-glass-border);background:rgba(2,6,23,.72);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px)}
html.light .marketing-cinematic .mkt-glass-strong{background:rgba(255,255,255,.94)}
.marketing-cinematic .mkt-video-overlay{background:linear-gradient(180deg,rgba(2,6,23,.52) 0%,rgba(2,6,23,.78) 40%,rgba(2,6,23,.92) 100%)}
.marketing-cinematic .mkt-video-tint{background-image:radial-gradient(ellipse 80% 50% at 50% 0%,rgba(212,168,83,.15),transparent 60%),radial-gradient(ellipse 60% 40% at 100% 100%,rgba(52,211,153,.12),transparent 55%)}
.marketing-cinematic .mkt-video-shell{background-color:var(--mkt-body-bg)}
html.light .marketing-cinematic .mkt-video-overlay{background:linear-gradient(180deg,rgba(241,245,249,.72) 0%,rgba(241,245,249,.88) 42%,rgba(226,232,240,.94) 100%)}
html.light .marketing-cinematic .mkt-video-tint{background-image:radial-gradient(ellipse 80% 50% at 50% 0%,rgba(180,134,46,.12),transparent 60%),radial-gradient(ellipse 60% 40% at 100% 100%,rgba(5,150,105,.1),transparent 55%)}
.mkt-video-shell{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none}
.mkt-video-poster-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.mkt-video-overlay{position:absolute;inset:0}
.mkt-video-tint{position:absolute;inset:0;opacity:.4}
.marketing-cinematic .mkt-hero-motto{color:var(--mkt-eyebrow);text-shadow:0 0 36px var(--mkt-accent-glow);font-weight:900;font-size:clamp(1.75rem,3.6vw + .5rem,3.25rem);line-height:1.15;letter-spacing:-.01em}
.marketing-cinematic .mkt-hero-blessing{font-family:var(--font-heebo),"Heebo",system-ui,sans-serif;font-size:clamp(.9375rem,2.4vw,1.125rem);font-weight:600;letter-spacing:-.01em;line-height:1.45;color:color-mix(in srgb,var(--mkt-fg) 78%,var(--mkt-eyebrow));text-shadow:none}
html.light .marketing-cinematic .mkt-hero-blessing{color:#475569}
.mkt-hero-section{position:relative;padding-inline:1rem;padding-bottom:1rem;padding-top:calc(var(--mkt-nav-height,4.25rem) + .25rem)}
.mkt-hero-section,.mkt-hero-section *{font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif!important}
.mkt-hero-blessing{margin-bottom:.375rem;font-size:clamp(.9375rem,2.4vw,1.125rem);font-weight:600;line-height:1.45;color:color-mix(in srgb,var(--mkt-fg) 78%,var(--mkt-eyebrow))}
.mkt-eyebrow{margin-bottom:.375rem;font-size:.875rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mkt-eyebrow)}
.mkt-hero-motto{margin-bottom:.75rem;font-weight:900;font-size:clamp(1.75rem,3.6vw + .5rem,3.25rem);line-height:1.15;color:var(--mkt-eyebrow);text-shadow:0 0 36px var(--mkt-accent-glow)}
.marketing-cinematic .mkt-hero-title{font-family:var(--font-heebo),"Heebo",system-ui,sans-serif;font-size:clamp(2.25rem,4.5vw + 1rem,4.5rem);font-weight:900;text-shadow:0 0 32px rgba(94,234,212,.45),0 0 64px rgba(165,180,252,.28),0 2px 12px rgba(0,0,0,.55);letter-spacing:-.025em;line-height:1.05}
.mkt-hero-title{font-size:clamp(2.25rem,4.5vw + 1rem,4.5rem);font-weight:900;line-height:1.05;letter-spacing:-.025em;text-shadow:0 0 32px rgba(94,234,212,.45),0 0 64px rgba(165,180,252,.28),0 2px 12px rgba(0,0,0,.55)}
.marketing-cinematic .mkt-hero-title-line1{color:#99f6e4}
.marketing-cinematic .mkt-hero-title-line2{background:linear-gradient(to left,#c7d2fe,#5eead4);-webkit-background-clip:text;background-clip:text;color:transparent}
html.light .marketing-cinematic .mkt-hero-title{text-shadow:0 2px 24px rgba(2,6,23,.12),0 0 1px rgba(2,6,23,.08)}
html.light .marketing-cinematic .mkt-hero-title-line1{color:#0d9488}
html.light .marketing-cinematic .mkt-hero-title-line2{background:linear-gradient(to left,#4f46e5,#0d9488);-webkit-background-clip:text;background-clip:text;color:transparent}
.mkt-hero-title-line1{display:block;color:#99f6e4}
.mkt-hero-title-line2{display:block;background:linear-gradient(to left,#c7d2fe,#5eead4);-webkit-background-clip:text;background-clip:text;color:transparent}
.mkt-body-lead{margin-top:.75rem;max-width:42rem;font-size:1rem;line-height:1.625;color:var(--mkt-fg-muted)}
html.light .mkt-hero-title{text-shadow:0 2px 24px rgba(2,6,23,.12),0 0 1px rgba(2,6,23,.08)}
html.light .mkt-hero-title-line1{color:#0d9488}
html.light .mkt-hero-title-line2{background:linear-gradient(to left,#4f46e5,#0d9488);-webkit-background-clip:text;background-clip:text;color:transparent}
html.light .mkt-hero-blessing{color:#475569}
.marketing-cinematic #feedback label{color:var(--mkt-fg-muted)}
.marketing-cinematic #feedback input,.marketing-cinematic #feedback textarea{border-color:var(--mkt-glass-border);background:rgba(15,23,42,.55);color:var(--mkt-fg)}
html.light .marketing-cinematic #feedback input,html.light .marketing-cinematic #feedback textarea{background:rgba(255,255,255,.92);color:var(--mkt-fg)}
.marketing-cinematic #feedback button[type=submit]{background:linear-gradient(135deg,#2563eb,#4f46e5)}
.marketing-cinematic .mkt-preview-banner{border-bottom:1px solid var(--mkt-banner-border);background:var(--mkt-banner-bg);color:var(--mkt-banner-text);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.marketing-cinematic .mkt-preview-banner a{color:var(--mkt-banner-link);text-decoration-color:color-mix(in srgb,var(--mkt-accent) 55%,transparent)}
.marketing-cinematic .mkt-preview-banner a:hover{color:var(--mkt-fg)}
.marketing-cinematic .mkt-eyebrow{color:var(--mkt-eyebrow)}
.marketing-cinematic .mkt-omnibar-glow{box-shadow:0 0 0 1px color-mix(in srgb,var(--mkt-accent) 35%,transparent),0 0 28px var(--mkt-accent-glow),0 0 48px color-mix(in srgb,var(--mkt-brand) 12%,transparent)}
html.light .marketing-cinematic .mkt-omnibar-glow{background:rgba(255,255,255,.92);box-shadow:0 0 0 1px color-mix(in srgb,var(--mkt-accent) 22%,transparent),0 12px 32px -12px rgba(15,23,42,.14)}
.marketing-cinematic .mkt-omnibar-label{color:var(--mkt-omnibar-label)}
.marketing-cinematic .mkt-omnibar-typed{color:var(--mkt-omnibar-typed)}
.marketing-cinematic .mkt-omnibar-cursor{background-color:var(--mkt-brand)}
.marketing-cinematic .mkt-omnibar-icon{color:var(--mkt-accent-strong)}
.marketing-cinematic .mkt-omnibar-status{color:#cbd5e1}
html.light .marketing-cinematic .mkt-omnibar-status{color:#334155}
.marketing-cinematic .mkt-mobile-nav-item{color:#cbd5e1}
.marketing-cinematic .mkt-mobile-nav-item.text-blue-400{color:#93c5fd}
.marketing-cinematic .mkt-nav-link{color:var(--mkt-nav-link)}
.marketing-cinematic .mkt-nav-link:hover{color:var(--mkt-fg)}
.marketing-cinematic .mkt-menu-trigger{border-color:var(--mkt-glass-border);color:var(--mkt-fg)}
.marketing-cinematic .mkt-locale-switcher button,.marketing-cinematic .mkt-theme-toggle button{border-color:rgba(255,255,255,.28)!important;background:rgba(15,23,42,.55)!important;color:#f8fafc!important}
html.light .marketing-cinematic .mkt-locale-switcher button,html.light .marketing-cinematic .mkt-theme-toggle button{border-color:rgba(15,23,42,.14)!important;background:rgba(255,255,255,.88)!important;color:#0f172a!important}
.marketing-cinematic .mkt-locale-switcher ul{border-color:rgba(255,255,255,.2)!important;background:rgba(15,23,42,.95)!important}
html.light .marketing-cinematic .mkt-locale-switcher ul{border-color:rgba(15,23,42,.12)!important;background:#ffffff!important}
html.light .marketing-cinematic .text-white{color:var(--mkt-fg)!important}
html.light .marketing-cinematic .text-slate-100,html.light .marketing-cinematic .text-slate-200{color:#1e293b!important}
html.light .marketing-cinematic .text-slate-300{color:#334155!important}
html.light .marketing-cinematic .text-slate-400{color:#475569!important}
html.light .marketing-cinematic .text-slate-500{color:#334155!important}
html.light .marketing-cinematic .mkt-body-lead{color:#1e293b!important;font-weight:600!important}
html.light .marketing-cinematic .mkt-omnibar-hint{color:#334155!important;font-weight:600!important}
html.light .marketing-cinematic .mkt-nav-link{font-weight:700!important;color:var(--mkt-nav-link)!important}
html.light .marketing-cinematic .font-medium{font-weight:600!important}
html.light .marketing-cinematic .font-semibold{font-weight:700!important}
html.light .marketing-cinematic .text-xs:not(.font-bold):not(.font-black){font-weight:600}
html.light .marketing-cinematic .text-sm.font-medium{font-weight:600!important}
html.light .marketing-cinematic .mkt-btn-ghost{border-color:rgba(15,23,42,.22)!important;background:#ffffff!important;color:#020617!important;font-weight:700!important}
html.light .marketing-cinematic .mkt-btn-primary{font-weight:800!important}
html.light .marketing-cinematic .mkt-omnibar-field{border-color:var(--mkt-demo-border)!important;background:#ffffff!important;color:var(--mkt-omnibar-typed)!important;font-weight:600!important}
html.light .marketing-cinematic .mkt-omnibar-field::placeholder{color:#64748b!important;font-weight:500!important;opacity:1}
html.light .marketing-cinematic .mkt-omnibar-badge{border-color:var(--mkt-demo-border)!important;background:var(--mkt-demo-surface-muted)!important;color:#334155!important;font-weight:700!important}
html.light .marketing-cinematic .mkt-omnibar-mic-idle{border-color:var(--mkt-demo-border)!important;background:var(--mkt-demo-surface-muted)!important;color:#334155!important;font-weight:600!important}
html.light .marketing-cinematic .mkt-omnibar-hint a{color:var(--mkt-accent-strong)!important;font-weight:700!important}
.marketing-cinematic .mkt-btn-primary{background:linear-gradient(135deg,var(--mkt-accent) 0%,#b8862e 100%);color:#0f172a}
html.light .marketing-cinematic .mkt-btn-primary{background:linear-gradient(135deg,#d4a853 0%,#b8862e 100%);color:#0f172a}
.marketing-cinematic .mkt-btn-ghost{border:1px solid rgba(255,255,255,.2);background:rgba(15,23,42,.35);color:#f8fafc}
.marketing-cinematic .mkt-mobile-nav{padding-top:.625rem;background:rgba(2,6,23,.92);border-top-color:rgba(255,255,255,.1)}
html.light .marketing-cinematic .mkt-mobile-nav{background:rgba(255,255,255,.96);border-top-color:rgba(15,23,42,.1);box-shadow:0 -8px 32px rgba(15,23,42,.08)}
.marketing-cinematic .mkt-mobile-nav-item{max-width:4.5rem}
.marketing-cinematic .mkt-mobile-nav-mic-wrap{position:relative;z-index:2;flex:0 0 4.75rem;width:4.75rem;align-self:flex-end;padding-bottom:.15rem}
.marketing-cinematic .mkt-mobile-nav-mic{width:4.25rem;height:4.25rem;min-width:4.25rem;min-height:4.25rem;transform:translateY(-1.35rem);border:3px solid var(--mkt-body-bg);box-shadow:0 10px 28px rgba(37,99,235,.5),0 0 0 1px rgba(59,130,246,.35),0 0 24px rgba(37,99,235,.25)}
html.light .marketing-cinematic .mkt-mobile-nav-mic{border-color:var(--mkt-body-bg);box-shadow:0 10px 24px rgba(37,99,235,.38),0 0 0 1px rgba(59,130,246,.28),0 0 0 4px rgba(241,245,249,.95)}
html.light .marketing-cinematic .mkt-mobile-nav-item{color:#475569!important}
html.light .marketing-cinematic .mkt-mobile-nav-item:hover{color:#0f172a!important}
html.light .marketing-cinematic .mkt-mobile-nav-item.text-blue-400{color:#1d4ed8!important}
@media (max-width:767px){.marketing-cinematic{--mkt-nav-height:3.5rem}.marketing-cinematic .mkt-hero-title{font-size:clamp(2rem,8vw,2.75rem)}.mkt-hero-title{font-size:clamp(2rem,8vw,2.75rem)}}
@media (prefers-reduced-motion:reduce){.marketing-cinematic .mkt-video-bg{display:none}.marketing-cinematic .mkt-video-poster-fallback{display:block}}
`.trim();
