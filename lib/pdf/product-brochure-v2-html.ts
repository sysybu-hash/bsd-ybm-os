import { escapeHtml } from "@/lib/pdf/invoice-labels";
import { loadLogo } from "@/lib/pdf/product-brochure-v2-assets";
import {
  SHOWCASES,
  ICONS,
  TECH_STACK,
  AUDIENCES,
  ACCENTS,
} from "@/lib/pdf/product-brochure-v2-data";
import { showcaseSection } from "@/lib/pdf/product-brochure-v2-sections";
import { productBrochureV2StylesCss } from "@/lib/pdf/product-brochure-v2-styles";

export function buildProductBrochureV2Html(): string {
  const generated = new Date().toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const logo = loadLogo();
  const logoImg = logo
    ? `<div class="logo-wrap"><div class="logo-glow"></div><img src="${logo}" alt="BSD-YBM" class="logo" /></div>`
    : `<div class="logo-wrap"><div class="logo-glow"></div><div class="logo logo-fallback">BSD-YBM</div></div>`;

  const showcaseHtml = SHOWCASES.map((s, i) =>
    showcaseSection(s, ACCENTS[i % ACCENTS.length] ?? "#6366f1"),
  ).join("\n");

  const techCards = TECH_STACK.map(
    (c) =>
      `<div class="tech-card"><span class="tech-icon">${c.icon}</span><div class="tech-text"><strong>${escapeHtml(c.title)}</strong><span>${escapeHtml(c.desc)}</span></div></div>`,
  ).join("");

  const audienceCards = AUDIENCES.map(
    (c) =>
      `<div class="aud-card"><span class="aud-icon">${c.icon}</span><strong>${escapeHtml(c.title)}</strong><span>${escapeHtml(c.desc)}</span></div>`,
  ).join("");

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>BSD-YBM OS — דף מוצר ${generated}</title>
<style>
${productBrochureV2StylesCss()}
</style>
</head>
<body>

<section class="page cover">
  <div class="cover-grid"></div>
  <div class="cover-content">
    ${logoImg}
    <span class="eyebrow"><span class="pulse"></span>BSD-YBM OS · גרסה ${generated}</span>
    <h1>מערכת ההפעלה<br/><span class="grad">לעסק שלך</span></h1>
    <p class="tagline">CRM · ERP · פיננסים · AI — שולחן עבודה אחד עם חלונות, סרגל פעולות ועוזר חכם בעברית.</p>
    <div class="hero-box">
      <strong>למי זה מיועד?</strong>
      <p>לקבלני בנייה, מנהלי פרויקטים, צוותי כספים ובעלי עסקים שמחפשים פלטפורמה אחת במקום עשר.</p>
    </div>

    <div class="modular-banner cover-variant">
      <div class="modular-icon">${ICONS.zap}</div>
      <div class="modular-text">
        <strong>100% מודולרי · מותאם אישית לכל לקוח</strong>
        <span>כל מודול ניתן לעריכה, שינוי או הסרה · מערכות שלמות קיימות נשתלות ומשתלבות באתר באופן מושלם</span>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><strong>10</strong><span>מודולים מרכזיים</span></div>
      <div class="stat"><strong>4</strong><span>ספקי AI + Gemini Live</span></div>
      <div class="stat"><strong>3</strong><span>שפות (עב/אנ/רוס)</span></div>
      <div class="stat"><strong>∞</strong><span>אפשרויות התאמה</span></div>
    </div>
  </div>
  <div class="footer-bar">
    <span>דף מוצר לשיווק · צילומי מסך אמיתיים</span>
    <span>BSD-YBM OS · ${escapeHtml(generated)}</span>
  </div>
</section>

<section class="page exec">
  <h1>סיכום מנהלים</h1>
  <p class="sub">כל מה שצריך לדעת על BSD-YBM OS — בעמוד אחד.</p>

  <div class="summary-card">
    <div class="lead-quote">"כל הכלים שעסק קטן-בינוני צריך — מאוחדים מאחורי כניסה אחת, בעברית, עם AI שמבין את ההקשר הארגוני שלך."</div>
    BSD-YBM OS היא פלטפורמת SaaS רב-דיירית לניהול עסקים, עם דגש על ענף הבנייה.
    היא משלבת CRM, ERP, ניהול פרויקטים, מערך פיננסי, סריקת מסמכים, יומן Google מסונכרן,
    Field Copilot לעוזר AI בשטח, ועוזר קולי Gemini Live בעברית —
    בתוך ממשק יחיד בסגנון מערכת הפעלה (חלונות צפים, Hub-ים, Omnibar).
  </div>

  <div class="modular-banner">
    <div class="modular-icon dark">${ICONS.zap}</div>
    <div class="modular-text dark">
      <strong>בנוי מודולרית — מתאים את עצמו אליך, לא להפך</strong>
      <span>
        כל מודול ניתן <u>לעריכה</u>, <u>שינוי</u> או <u>עדכון</u> לפי בקשת הלקוח.
        ניתן להוסיף <u>מערכות שלמות קיימות</u> ולמזג אותן באתר באופן מושלם —
        ללא פשרות בעיצוב, ביצועים או אבטחה.
      </span>
    </div>
  </div>

  <div class="toc-title">תוכן עניינים</div>
  <div class="toc">
    ${SHOWCASES.map(
      (s) => `<div class="toc-item">
      <div class="num">${escapeHtml(s.num)}</div>
      <div><strong>${escapeHtml(s.title)}</strong><span>${escapeHtml(s.kicker)}</span></div>
    </div>`,
    ).join("")}
  </div>
</section>

${showcaseHtml}

<section class="page">
  <h1 class="section-h1">תשתית, אבטחה ואמינות</h1>
  <p class="section-sub">בנוי על מחסנית טכנולוגית מודרנית — עם ניטור, גיבוי ו-Compliance.</p>
  <div class="tech-grid">${techCards}</div>

  <div class="modular-hero">
    <div class="modular-hero-badge">
      <span class="badge-dot"></span>
      ארכיטקטורה מודולרית
    </div>
    <h2 class="modular-hero-title">המערכת עובדת בשבילך — לא להפך</h2>
    <p class="modular-hero-lead">
      כל פיצ׳ר נבנה כמודול עצמאי. אפשר להפעיל, לכבות, לערוך, לעדכן או להחליף — ללא נגיעה בשאר המערכת.
    </p>
    <div class="modular-pillars">
      <div class="pillar">
        <span class="pillar-icon">${ICONS.zap}</span>
        <strong>עריכה ועדכון</strong>
        <span>כל מודול, שדה ותהליך — נערך לפי בקשת הלקוח, ללא מגבלות.</span>
      </div>
      <div class="pillar">
        <span class="pillar-icon">${ICONS.database}</span>
        <strong>הוספת מערכות</strong>
        <span>שילוב מערכות שלמות קיימות (CRM/ERP/מלאי) ומיזוגן בצורה מושלמת.</span>
      </div>
      <div class="pillar">
        <span class="pillar-icon">${ICONS.bot}</span>
        <strong>מודולים חדשים</strong>
        <span>בניית פיצ׳רים מותאמים אישית — בדיוק כפי שאתה צריך, בתוך הממשק שלך.</span>
      </div>
    </div>
  </div>
</section>

<section class="page">
  <h1 class="section-h1">למי זה מתאים</h1>
  <p class="section-sub">המערכת תוכננה סביב 4 פרסונות מרכזיות — וניתנת להתאמה לכל ענף ושוק.</p>
  <div class="aud-grid">${audienceCards}</div>

  <div class="cta">
    <h3>מוכנים לראות את זה חי?</h3>
    <p>הדגמה אישית · הקמת חשבון ארגוני · התאמה מלאה ומיזוג מערכות קיימות.</p>
    <a class="btn" href="https://bsd-ybm.co.il">bsd-ybm.co.il · התחברות / הרשמה</a>
    <div class="blessing">בעזרת ה' נעשה ונצליח 🙏</div>
  </div>
</section>

<section class="page creator-page">
  <div class="creator-bg"></div>
  <div class="creator-orb creator-orb-a"></div>
  <div class="creator-orb creator-orb-b"></div>

  <div class="creator-eyebrow">
    <span class="dot-live"></span>
    היוצר והמפתח
  </div>

  <div class="creator-hero">
    <div class="creator-monogram-wrap">
      <div class="creator-monogram-glow"></div>
      <div class="creator-monogram">יב</div>
    </div>
    <h1 class="creator-h1">יוחנן בוקשפן</h1>
    <p class="creator-role">יזם ומפתח Full-Stack · בונה את BSD-YBM OS</p>
  </div>

  <div class="creator-bio-card">
    <p>
      יזם ומפתח עצמאי, מתמחה בבניית פלטפורמות <strong>SaaS</strong> מודרניות לשוק הישראלי —
      מהארכיטקטורה ועד החוויה של המשתמש הסופי.
    </p>
    <p>
      <strong>BSD-YBM OS</strong> נבנתה מאפס: מערכת רב-דיירית עם CRM, ERP, ניהול פרויקטים,
      מערך פיננסי, סריקת מסמכים והפקה אוטומטית — כשבמרכז כולם עוזרי AI מרובים
      (<strong>Gemini, Claude, OpenAI</strong>) שמדברים עברית ומכירים את ההקשר הארגוני.
    </p>
    <p>
      התמחות מובהקת בענף <strong>הבנייה</strong>, בתהליכי <strong>הפקת מסמכים</strong>,
      ובחיבור בין כלים ארגוניים. הסטאק הטכנולוגי: Next.js · TypeScript · PostgreSQL ·
      Prisma · Gemini Live · PayPlus · Sentry.
    </p>
  </div>

  <div class="creator-skills">
    <span class="skill-chip"><span class="skill-icon">${ICONS.zap}</span>Next.js 15 / RSC</span>
    <span class="skill-chip"><span class="skill-icon">${ICONS.database}</span>PostgreSQL / Prisma</span>
    <span class="skill-chip"><span class="skill-icon">${ICONS.bot}</span>AI Integrations</span>
    <span class="skill-chip"><span class="skill-icon">${ICONS.shieldCheck}</span>Auth & Passkeys</span>
    <span class="skill-chip"><span class="skill-icon">${ICONS.creditCard}</span>Israeli Payments</span>
    <span class="skill-chip"><span class="skill-icon">${ICONS.activity}</span>Observability</span>
  </div>

  <div class="promise-card">
    <div class="promise-icon">${ICONS.shieldCheck}</div>
    <div class="promise-text">
      <div class="promise-title">ההבטחה שלי אליך</div>
      <p>
        המערכת היא <strong>100% מודולרית</strong> וניתנת לעריכה, שינוי ועדכון לפי בקשתך.
        אני <strong>משלב מערכות שלמות קיימות</strong> שלך בתוך הממשק באופן מושלם —
        ומוסיף מודולים חדשים מותאמים אישית לדרישות הספציפיות של העסק.
      </p>
    </div>
  </div>

  <div class="creator-contact-row">
    <a class="contact-big" href="tel:+972525640021">
      <span class="contact-big-icon">${ICONS.phone}</span>
      <span class="contact-big-text">
        <span class="contact-label">חייגו</span>
        <span class="contact-value" dir="ltr">052-564-0021</span>
      </span>
    </a>
    <a class="contact-big" href="https://bsd-ybm.co.il">
      <span class="contact-big-icon">${ICONS.globe}</span>
      <span class="contact-big-text">
        <span class="contact-label">היכנסו לאתר</span>
        <span class="contact-value" dir="ltr">bsd-ybm.co.il</span>
      </span>
    </a>
  </div>

  <div class="creator-footer">
    <div class="copyright">
      © ${new Date().getFullYear()} יוחנן בוקשפן · BSD-YBM OS · <strong>כל הזכויות שמורות</strong>
    </div>
    <div class="meta">דף מוצר ${escapeHtml(generated)} · כל צילומי המסך אמיתיים מהמערכת</div>
  </div>
</section>

</body>
</html>`;
}
