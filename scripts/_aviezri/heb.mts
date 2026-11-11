/** Hebrew typed in an old keyboard font (axax / hebraw100): Latin keys stand for Hebrew letters; digits are in visual order. */
const K: Record<string, string> = { t: "א", c: "ב", d: "ג", s: "ד", v: "ה", u: "ו", z: "ז", j: "ח", y: "ט", h: "י", l: "ך", f: "כ", k: "ל", o: "ם", n: "מ", i: "ן", b: "נ", x: "ס", g: "ע", ";": "ף", p: "פ", ".": "ץ", m: "צ", e: "ק", r: "ר", a: "ש", ",": "ת" };
export const hasKeyboardHebrew = (s: string) => /[a-z;,.]/.test(s) && !/[֐-׿]/.test(s) && !/^[+\-]?\d/.test(s);
export function heb(s: string): string {
  if (!hasKeyboardHebrew(s)) return s;
  return s.replace(/[a-z;,.]/g, (c) => K[c] ?? c).replace(/\d+/g, (d) => [...d].reverse().join(""));
}
