# חוב: חוקי React Compiler (react-hooks v7)

## רקע

שדרוג ל-`next@16.3.2` הביא איתו את `eslint-config-next@16`, שמפעיל את מערך
חוקי ה-React Compiler של `eslint-plugin-react-hooks` v7. החוקים סימנו **97
מופעים קיימים** שהריפו שולח מאז ומתמיד — אף אחד מהם אינו באג היום, אבל
אימוץ החוקים משמעו ריפקטור של ~93 אתרים עם סיכון רגרסיה אמיתי.

ההחלטה: לכבות את ארבעת החוקים ב-`eslint.config.js` עם נימוק, ולהעביר אותם
לכאן כחוב. **אין להוסיף הפרות חדשות.** להדליק חוק אחד בכל פעם.

## הפילוח

| חוק | מופעים | הדפוס |
|---|---|---|
| `react-hooks/refs` | 55 | דפוס latest-ref — `onFooRef.current = onFoo` בגוף הרנדר, וקריאת `ref.current` ברנדר |
| `react-hooks/set-state-in-effect` | 38 | `useEffect(() => setX(prop), [prop])` לסנכרון prop→state |
| ~~`react-hooks/purity`~~ | ✅ 0 | `performance.now()` / `Date.now()` בתוך אתחול `useRef` או `useMemo` |
| ~~`react-hooks/immutability`~~ | ✅ 0 | צובר (`cumulative += ...`) בתוך `map` בתוך `useMemo` |

## נציגים

- `hooks/useWebSpeechFallback.ts:59` — latest-ref
- `lib/events/project-sync.ts:25` — latest-ref
- `components/os/boot/useOsBootGate.ts:24` — `performance.now()` באתחול `useRef`
- `components/os/omnibar/useOmnibarGeminiLive.ts:186` — `Date.now()` ב-`useMemo`
- `components/ui/bento/Donut.tsx:34` — צובר ב-`map`

## סדר טיפול מוצע

1. **`purity` + `immutability` (4 מופעים)** — הזול ביותר. `useRef` עם פונקציית
   אתחול עצלה, והחלפת הצובר ב-`reduce`. להדליק את שני החוקים.
2. **`set-state-in-effect` (38)** — רובם ניתנים להמרה ל-`key` prop או לחישוב
   נגזר ברנדר. לטפל בקבוצות לפי ווידג'ט.
3. **`refs` (55)** — הגדול והמסוכן. דפוס latest-ref הוא לגיטימי ב-React 18;
   שווה להמתין עד שהריפו יעבור ל-React 19 + Compiler לפני שנוגעים.

## מקור

`eslint.config.js` — הבלוק האחרון במערך, עם ההסבר המלא.

---

## עדכון 2026-08-24 — שלב 1 הושלם

`react-hooks/purity` ו-`react-hooks/immutability` **הודלקו מחדש** ב-`eslint.config.js`.
ארבעת המופעים תוקנו:

| קובץ | מה נעשה |
|---|---|
| `components/os/boot/useOsBootGate.ts` | ה-timestamp נתפס ב-`useRef` initialiser והוזן לחישוב יחיד. השעון מתחיל עכשיו בתוך ה-effect. ההפרש הוא זמן רנדר-לאפקט מתוך 700ms — רעש, ולמעשה קרוב יותר לכוונה: הספלאש על המסך מרגע הציור |
| `components/os/omnibar/useOmnibarGeminiLive.ts` | `Date.now()` ב-`useMemo` — התווית **נסחפה קדימה בכל רנדר**. זמן ה-fallback נתפס פעם אחת כשההגבלה נכנסת לתוקף |
| `components/ui/bento/Donut.tsx` | צובר `let` שמומר ב-`map` → `reduce` שנושא את הצובר |

**נותרו שני חוקים כבויים:**

| חוק | מופעים | למה עדיין כבוי |
|---|---|---|
| `react-hooks/set-state-in-effect` | 38 | רובם ניתנים להמרה ל-`key` prop או חישוב נגזר. לטפל בקבוצות לפי ווידג'ט |
| `react-hooks/refs` | 55 | דפוס latest-ref, לגיטימי ב-React 18. שווה להמתין למעבר ל-React 19 + Compiler |

הערה: התיקון ב-`useOmnibarGeminiLive` מוסיף מופע אחד ל-`set-state-in-effect` — זהו בדיוק המקרה הלגיטימי של החוק הזה, גזירת ערך ברגע שאירוע הופך לאמת.
