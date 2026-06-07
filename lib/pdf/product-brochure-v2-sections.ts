import { escapeHtml } from "@/lib/pdf/invoice-labels";
import { imgDataUrl } from "@/lib/pdf/product-brochure-v2-assets";
import type { Showcase } from "@/lib/pdf/product-brochure-v2-data";

export function showcaseSection(s: Showcase, accent: string): string {
  const src = imgDataUrl(s.file);
  const features = s.features
    .map(
      (f) =>
        `<li><span class="check">✓</span><span>${escapeHtml(f)}</span></li>`,
    )
    .join("");
  const imgHtml = src
    ? `<img src="${src}" alt="${escapeHtml(s.title)}" />`
    : `<div class="img-empty">${escapeHtml(s.kicker)}</div>`;

  return `
<section class="page showcase" style="--accent:${accent};">
  <div class="showcase-bg"></div>
  <div class="showcase-header">
    <div class="num-pill">${escapeHtml(s.num)}</div>
    <div class="showcase-titles">
      <div class="kicker">${escapeHtml(s.kicker)}</div>
      <h2>${escapeHtml(s.title)}</h2>
    </div>
  </div>
  <p class="lead">${escapeHtml(s.desc)}</p>
  <ul class="checklist">${features}</ul>
  <div class="monitor">
    <div class="monitor-frame">
      <div class="browser-chrome">
        <div class="traffic">
          <span class="dot dot-red"></span>
          <span class="dot dot-yellow"></span>
          <span class="dot dot-green"></span>
        </div>
        <div class="address-bar">
          <span class="lock">🔒</span>
          <a class="url" href="https://bsd-ybm.co.il">bsd-ybm.co.il</a>
        </div>
        <div class="chrome-spacer"></div>
      </div>
      <div class="screen">${imgHtml}</div>
    </div>
    <div class="monitor-stand"></div>
    <div class="monitor-base"></div>
  </div>
</section>`;
}
