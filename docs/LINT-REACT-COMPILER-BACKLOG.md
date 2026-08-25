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


---

## 2026-08-25 — ניתוח `set-state-in-effect` (42 הפרות)

הדלקתי את החוק וסקרתי את כל ההפרות. **לא ביצעתי את המיגרציה**, וזו הסיבה:
**חלק ניכר מהן אינן באגים אלא הדפוס הנכון ב-SSR.**

### שלוש מחלקות

**1. שומר mount ל-SSR** — ~8 קבצים

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);
```

`MarketingDetailSheet` · `JewishClockHeaderChip` · `OSHeader` · `OsFloatingPanel`
· `ThemeToggle` · `CrmOverlayPortal` · `ArchiveMenuTrigger`

זהו הדפוס הסטנדרטי ל"אל תרנדר בשרת". **הקוד נכון כפי שהוא.** התיקון תחת חוקי
ה-Compiler הוא `useSyncExternalStore` עם snapshot לשרת — שינוי ארכיטקטוני לכל
אתר, לא החלפת שורה.

**2. קריאת API של דפדפן באפקט** — ~8 קבצים

```tsx
useEffect(() => {
  const stored = parseStoredConsent(localStorage.getItem(KEY));
  if (!stored) { setVisible(true); return; }
  setAnalytics(stored.analytics);
}, []);
```

`CookieConsentBanner` ודומיו. **אי אפשר לקרוא `localStorage` ברנדר** בלי
hydration mismatch. גם כאן הפתרון הוא `useSyncExternalStore`.

**3. סנכרון prop → state** — היתר

```tsx
useEffect(() => { if (open) setValue(defaultValue); }, [open, defaultValue]);
```

`OsPromptDialog`, `GeminiLiveSettingsSheet`, `MobileOmnibarSheet`. **אלה כן
ניתנים לתיקון** — `key` על הקומפוננטה, או התאמת state ברנדר. אבל כל אתר דורש
שיקול נפרד: מתי בדיוק ה-state צריך להתאפס.

### למה לא עכשיו

~25 קבצים, **רובם ללא כיסוי בדיקות**. מיגרציה ל-`useSyncExternalStore` בקוד לא
מכוסה, בסוף סשן ארוך, היא בדיוק סוג הריפקטור העיוור שנמנעתי ממנו לכל אורך
הדרך — ובצדק: שינוי אחד בתשתית הטסטים כן גרם לרגרסיה היום.

### הסדר המומלץ

1. **מחלקה 3 קודם** — ניתנת לתיקון בלי שינוי ארכיטקטוני, וכל אתר עצמאי
2. **מחלקות 1 ו-2 ביחד** — שתיהן `useSyncExternalStore`; כדאי hook משותף
   (`useIsMounted`, `useLocalStorageValue`) במקום 16 תיקונים נפרדים
3. **להדליק את החוק רק בסוף** — הדלקה חלקית אינה אפשרית

`react-hooks/refs` (55) נשאר אחרון: דפוס latest-ref לגיטימי ב-React 18, וכדאי
להמתין למעבר ל-React 19 + Compiler לפני שנוגעים בו.


---

## 2026-08-25 — `set-state-in-effect` הושלם (42 → 0), החוק הודלק

**שלושה מתוך ארבעת החוקים פעילים.** נותר רק `react-hooks/refs`.

### מה שהתברר כשגוי בניתוח הקודם

הניתוח מ-24.8 מיין ~16 מופעים כ"מחייבים `useSyncExternalStore` — שינוי
ארכיטקטוני לכל אתר". זה היה נכון באבחנה ושגוי במסקנה: `useSyncExternalStore`
נדרש **פעם אחת**, בתוך hook משותף, ולא בכל אתר.

| Hook חדש | מחליף |
|---|---|
| `hooks/use-is-mounted.ts` | `useState(false)` + `useEffect(() => setMounted(true), [])` — שבעה קבצים כתבו את זה ידנית |
| `hooks/use-client-flag.ts` | ערך בוליאני שרק הדפדפן יודע — `localStorage`, מחלקת theme, בדיקת יכולת |

### הדפוס לסנכרון prop → state

**התאמה בזמן רנדר**, הדפוס המתועד של React — לא רק ריצוי החוק:

```tsx
const [lastSeed, setLastSeed] = useState(seed);
if (seed !== lastSeed) {
  setLastSeed(seed);
  if (seed !== null) setValue(seed);
}
```

אפקט שמאתחל טופס מצייר פריים אחד עם הערכים הקודמים לפני שהוא מתקן את עצמו.
`OsPromptDialog`, `OsFloatingPanel`, `ArchiveMenuTrigger` וטאבי ה-hubs סבלו
כולם מאותו חלון בן פריים.

### state שלא היה צריך להתקיים

| קובץ | מה היה |
|---|---|
| `hooks/use-meckano-access.ts` | שיקוף של פונקציה טהורה מה-session לתוך state — רנדר נוסף בכל מעבר, וחלון `null` שבו `loading` היה true אף שהתשובה כבר ידועה |
| `components/os/boot/useOsBootGate.ts` | `fading` הוא בדיוק `coreReady`; אפקט העתיק אחד לשני באיחור של רנדר |
| `components/os/navigation/WidgetNavigationProvider.tsx` | ה-ref החד-פעמי הפך ל-state, ובדרך נעלם ref שנכתב מתוך אפקט |
| `components/os/omnibar/useOmnibarGeminiLive.ts` | `voiceStatus` הוא מיפוי של מצב הלקוח — התווית פיגרה רנדר אחרי החיבור שהיא מתארת |
| `components/landing/marketing/VideoBackground.tsx` | האפקט קבע `staticOnly/isPlaying/mountVideo` כפעולה ראשונה בכל מסלול — אלה ערכי ההתחלה, שנכתבו באיחור של רנדר |

### ארבעה פטורים מתועדים

לא כל הפרה היא באג. ארבעה אתרים שומרים על האפקט עם `eslint-disable` ונימוק:

| קובץ | למה אין תשובה בזמן רנדר |
|---|---|
| `ScrollReveal.tsx` | חייב למדוד היכן האלמנט נחת. התחלה במצב מוסתר תשאיר תוכן בלתי נראה אם JS או IntersectionObserver נכשלים — באג המסך הריק במובייל שהקומפוננטה נכתבה כדי למנוע |
| `ArchiveMenuTrigger.tsx` | מיקום התפריט נגזר מ-rect נמדד, שלא קיים לפני layout |
| `PwaInstallBanner.tsx` | `getInstalledRelatedApps()` הוא promise |
| `useOmnibarGeminiLive.ts` | דדליין ה-retry הוא דגימת שעון. `react-hooks/purity` צודק שאסור לקרוא `Date.now()` ברנדר — זו בדיוק הסחיפה שה-state נוסף כדי לתקן |

### `react-hooks/refs` (55) — עדיין כבוי, וזו החלטה

דפוס latest-ref (`onFooRef.current = onFoo` בגוף הרנדר) הוא **הפתרון המומלץ**
לבעיית ה-stale closure תחת React 18. החוק קיים כי ה-Compiler רשאי להריץ רנדרים
מחדש — מגבלה שנכנסת לתוקף עם React 19. מיגרציה עכשיו היא עבודה מול אילוץ שעדיין
לא חל. **התנאי להתחלה: מעבר ל-React 19.**
