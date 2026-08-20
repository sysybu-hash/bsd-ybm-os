# פרומפט ליצירת פסקול ב-Gemini (Lyria 3) — סרטון פרסום BSD-YBM OS

> **מטרה:** פסקול אינסטרומנטלי של 30 שניות שיושב מתחת לקריינות עברית.
> **חשוב:** Lyria מייצר *מוזיקה בלבד*. הקריינות מגיעה בנפרד (ElevenLabs).

---

## ⚠️ שתי דרישות קריטיות שאסור לפספס

1. **אינסטרומנטלי לחלוטין — בלי שירה, בלי מילים, בלי קולות אנושיים.**
   כל ווקאל יתנגש עם הקריינות.
2. **"מקום" לקריינות** — הפסקול צריך להיות דליל בתדרי האמצע (250Hz–4kHz), שם יושב הקול.
   הפרומפט למטה מבקש את זה במפורש.

---

## הפרומפט הראשי — להעתקה ל-Gemini

```
צור לי פסקול אינסטרומנטלי באורך 30 שניות בדיוק לסרטון פרסום של מערכת הפעלה עסקית (SaaS) ישראלית.

סגנון: אלקטרוני מודרני ועדכני — הכלאה של deep house עם קולנועי-טכנולוגי.
לא "קורפורייט עליז" קלישאתי. משהו עמוק, קצבי, בטוח בעצמו ויוקרתי.

מפרט מוזיקלי:
- טמפו: 112–118 BPM
- סולם: מינור מודרני (פה מינור או לה מינור) שנפתח לסיום מרומם ואופטימי
- כלים: סאב-בס עמוק ונקי, קיק דוחף עם אטק ברור, האי-האטס קלילים,
  אקורדי סינת' רחבים (supersaw) עם סיידצ'יין-פאמפ מודרני,
  ארפג'יו פלאק דיגיטלי, פּד אטמוספרי רחב, ומעט טקסטורות אלקטרוניות עדינות
- מיקס: סטריאו רחב, נקי ומודרני, עם עומק ריוורב מתון

מבנה לפי זמנים (חשוב מאוד):
- 0:00–0:05 — פתיחה אטמוספרית. פּד רחב, פעימת סאב עדינה, תחושת ציפייה. בלי תופים מלאים.
- 0:05–0:10 — הביט נכנס. קיק יציב, סאב-בס, האי-האטס. תחושת תנועה קדימה.
- 0:10–0:16 — הגרוב מתפתח. נכנס ארפג'יו פלאק, האנרגיה עולה בהדרגה.
- 0:16–0:21 — שיא ראשון. מוטיב מלודי נקי ובוטח, סינת' בהיר, הכי אנרגטי.
- 0:21–0:26 — בילד-אפ. ריזר עולה, מתח מצטבר לקראת הסיום.
- 0:26–0:30 — סיום מרומם. אקורד מלא ומנצח, אימפקט רך, וזנב ריוורב שנסגר נקי בדיוק ב-30 שניות.

דרישות קריטיות:
- אינסטרומנטלי לחלוטין. בלי שירה, בלי מילים, בלי ווקאל, בלי קולות אנושיים כלשהם.
- להשאיר מקום לקריינות: תדרי האמצע (250Hz–4kHz) צריכים להיות דלילים ולא עמוסים.
  האנרגיה העיקרית בבס הנמוך ובגבהים.
- בלי מלודיה צפופה או "עסוקה" מדי שתתחרה בדיבור.
- להסתיים נקי ב-30 שניות, לא לקטוע באמצע.

הימנע מ: יוקוללי, שריקות, מחיאות כפיים "עליזות", פסנתר קורפורייט קלישאתי,
צלילים רועשים או אגרסיביים מדי, כל דבר שנשמע כמו מוזיקת המתנה טלפונית.
```

---

## פרומפטים לווריאציות (אם הראשון לא קלע)

**גרסה יותר עמוקה ומינימליסטית:**
```
אותו בריף, אבל יותר מינימליסטי ומאופק: פחות כלים, יותר מרחב ואוויר,
דגש על סאב-בס עמוק ופּד אטמוספרי. תחושה של יוקרה שקטה וביטחון,
בסגנון פרסומת של מותג טכנולוגיה פרימיום.
```

**גרסה יותר אנרגטית:**
```
אותו בריף, אבל עם יותר דחף ואנרגיה: גרוב חזק יותר, סיידצ'יין-פאמפ בולט,
ארפג'יו מהיר יותר ובילד-אפ דרמטי יותר לקראת הסיום. תחושת תנופה וצמיחה.
```

**גרסה יותר קולנועית:**
```
אותו בריף, אבל עם נטייה קולנועית: שכבת מיתרים סינתטיים, אימפקטים עמוקים
במעברים, ותחושה אפית מרוסנת. עדיין אלקטרוני ומודרני, לא תזמורתי מלא.
```

---

## גרסה באנגלית (לרוב נותנת תוצאה טובה יותר במודלים מוזיקליים)

```
Create a 30-second instrumental soundtrack for a modern Israeli B2B SaaS product commercial.

Style: contemporary electronic — a blend of deep house and cinematic tech.
Confident, deep, rhythmic and premium. NOT cheesy corporate-happy music.

Musical spec:
- Tempo: 112–118 BPM
- Key: modern minor (F minor or A minor) resolving to an uplifting major finish
- Instruments: deep clean sub bass, punchy kick with clear attack, crisp light hi-hats,
  wide supersaw synth chords with modern sidechain pumping, digital pluck arpeggio,
  atmospheric wide pad, subtle electronic textures
- Mix: wide stereo, clean and modern, moderate reverb depth

Timed structure (important):
- 0:00–0:05 — atmospheric intro. Wide pad, soft sub pulse, sense of anticipation. No full drums.
- 0:05–0:10 — beat enters. Steady kick, sub bass, hi-hats. Forward motion.
- 0:10–0:16 — groove develops. Pluck arpeggio enters, energy gradually rises.
- 0:16–0:21 — first peak. Clean confident melodic motif, bright synth, most energetic.
- 0:21–0:26 — build-up. Rising riser, accumulating tension toward the finale.
- 0:26–0:30 — uplifting resolution. Full triumphant chord, soft impact, reverb tail closing cleanly at exactly 30s.

Critical requirements:
- Fully instrumental. NO vocals, NO lyrics, NO singing, NO human voices of any kind.
- Leave room for a voiceover: keep mid frequencies (250Hz–4kHz) sparse and uncluttered.
  Main energy in the low bass and the highs.
- No dense or busy melody that competes with speech.
- Must end cleanly at 30 seconds, not cut off mid-phrase.

Avoid: ukulele, whistling, happy hand claps, cliché corporate piano,
harsh or aggressive sounds, anything resembling telephone hold music.
```

---

## אחרי שתקבל את הקובץ

1. הורד אותו (MP3 או WAV)
2. שמור בתיקייה נוחה, למשל `C:\Users\User\Downloads\`
3. תגיד לי את הנתיב — ואני:
   - אבדוק אורך, עוצמה וטווח דינמי
   - אאזן אותו מתחת לקריינות (ducking אוטומטי אם צריך)
   - אנרמל את הפסקול ל-‎-15 LUFS
   - אפיק מחדש את שתי הגרסאות (16:9 ו-9:16)

---

## טיפ

הפק **2–3 וריאציות** ותשמע אותן ברצף לפני שתחליט.
זה לוקח דקה, וההבדל בין וריאציות של מודל מוזיקלי הוא לרוב גדול.
