# ביצועי מובייל — מדידה מול פרודקשן

עודכן 2026-08-25, אחרי שהקוד החדש נפרס ב-`fra1`.

## המסקנה החשובה

**מעבר ה-region לא שיפר את ארבעת הדפים האיטיים.** הוא הוריד את השהיית המסד
מ-94ms ל-3-5ms והוריד TTFB בערך למחצית — אבל ציוני Lighthouse על הדפים האלה
לא זזו.

הסיבה: ה-LCP שלהם הוא ~4.6-5.2 שניות. Lighthouse מובייל מדמה רשת איטית
ומאט את המעבד פי 4. **חיסכון של 90ms בצד השרת הוא רעש מול LCP של 5 שניות.**
הצוואר שם הוא בצד הלקוח.

## המספרים

קו הבסיס: 2026-08-14, `iad1` + Next 15. עכשיו: `fra1` + Next 16.

| דף | קו בסיס | עכשיו | LCP |
|---|---|---|---|
| `/login` | 97 | **99** | 1755ms |
| `/about` | 98 | 98 | 1763ms |
| `/` | 97 | 97 | 1745ms |
| `/help` | 95 | 96 | 1594ms |
| `/privacy` | — | 96 | 1448ms |
| `/legal` | — | 85 | 1455ms |
| **`/terms`** | 81 | **80** | 4445ms |
| **`/contact`** | 80 | **79** | 5050ms |
| **`/blog`** | 79 | **79** | 5050ms |
| **`/unsubscribe`** | 81 | **75** | 4621ms |

הדפוס אומת בשתי ריצות נפרדות. הפער בין הקבוצות עקבי, לא רעש.

## מה שהמדידה שוללת

**זה לא הניתוב.** חשדתי שהדפים האיטיים לא מסווגים כ"שיווקיים" ולכן טוענים
חבילת i18n כבדה. בדקתי — **כל הארבעה נמצאים ב-`LIGHT_PUBLIC_PATHS`**
(`lib/perf/marketing-paths.ts`), בדיוק כמו `/privacy` ו-`/legal` המהירים.
ההשערה הופרכה.

**זה גם לא רגרסיית ה-SSG של הבלוג.** דפי הפוסט עצמם מקבלים 97 ו-88, מהטובים
במדידה. דף הרשימה `/blog` הוא זה שמקבל 79.

`/terms` (80) מול `/privacy` (96) הם דפים משפטיים כמעט זהים מבנית, מאותו סט
מסלולים. **ההבדל הוא בתוכן הדף עצמו**, לא בקונפיגורציה.

## אלמנט ה-LCP — נמצא

הרצת Lighthouse ישירה עם `lcp-breakdown-insight` ו-`lcp-discovery-insight`
נתנה את התשובה:

```
selector : a.inline-flex > div.inline-flex > span.box-border > img.block
path     : … BODY > … > FOOTER > … > IMG
rect     : top=732  width=72  height=50
snippet  : <img … loading="lazy" … sizes="80px">
```

**אלמנט ה-LCP הוא הלוגו ב-footer, והוא היה `loading="lazy"`.**

ה-checklist של `lcp-discovery-insight` אמר זאת מפורשות:

| בדיקה | לפני | אחרי |
|---|---|---|
| `requestDiscoverable` | ✅ | ✅ |
| **`eagerlyLoaded`** — "LCP resources should not use loading=lazy" | ❌ | **✅** |
| `priorityHinted` | ❌ | ❌ |

הוויאפורט במובייל הוא 823px גובה והלוגו יושב ב-732 — **בתוך המסך הראשוני**,
ובכל זאת נדחה. זה בדיוק ה-anti-pattern: הדפדפן דוחה משאב שנראה מיד.

ב-`/privacy` המהיר אלמנט ה-LCP הוא `<p>` — טקסט, בלי טעינת משאב כלל. **זה
ההבדל** בין הקבוצות: בדפים הקצרים הלוגו ב-footer הוא האלמנט הגדול ביותר
שנצבע, בעוד בדפים ארוכים יותר יש טקסט גדול ממנו.

### התיקון

`BrandLogo` ו-`BrandHomeLink` קיבלו prop `loading`, ו-`MarketingFooter` מעביר
`eager`. לא `priority` — הוא היה מוסיף preload בכל דף, כולל ארוכים שבהם הלוגו
מתחת לקיפול. `eager` רק מבטל את הדחייה.

### תיקון לדיווח קודם

במסמך הזה נכתב קודם שהלוגו "לא פגם ולא הסבר". **זה היה שגוי.** בדקתי אז רק
את ה-`src` שמצביע על וריאנט 3840px — וזה אכן התנהגות מתועדת של `next/image`
ואינו פגם. אבל לא בדקתי את `loading="lazy"`, וזה כן היה הסיבה.

## מה שעדיין פתוח

התיקון אומת ברמת ה-audit מקומית (`eagerlyLoaded` עבר מ-false ל-true), אבל
**המספרים בפועל דורשים דיפלוי** — מדידה מקומית אינה ברת-השוואה למובייל
מווסת מול CDN. אחרי הפריסה יש להריץ שוב:

```bash
npm run lighthouse:matrix:prod -- --tier=public --strategy=mobile
```

`priorityHinted` עדיין false. `fetchpriority="high"` יכול לשפר עוד, אבל הוא
משמעותי רק כשהמשאב מתחרה על רוחב פס — כאן הוא 72×50 פיקסלים, ולכן לא נגעתי.

## `/unsubscribe` — SEO 66 היא התראת שווא

נכשל ב-`is-crawlable` כי `app/(platform)/unsubscribe/page.tsx:7` מגדיר
`robots: { index: false, follow: false }`. **זה נכון לדף הסרה מרשימת תפוצה.**
רשום כאן כדי שלא "יתוקן".

## שכבת auth

טרם נמדדה. `npm run lighthouse:auth:matrix` דורש הרצת
`lighthouse-auth-setup.mjs` שיוצר state מאומת מול פרודקשן.

## איך לחזור על המדידה

```bash
npm run lighthouse:matrix:prod -- --tier=public --strategy=mobile
```

הפלט נשמר ל-`reports/pagespeed/<timestamp>-summary.json` עם `failedAudits`
לכל דף.
