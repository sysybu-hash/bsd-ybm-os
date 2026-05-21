/** מחולל סיסמה בצד לקוח — אותם כללים כמו validatePasswordStrength */

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@$%&*-";

export function generateClientPassword(length = 14): string {
  const all = UPPER + LOWER + DIGITS + SYMBOLS;
  const out: string[] = [
    UPPER[Math.floor(Math.random() * UPPER.length)]!,
    LOWER[Math.floor(Math.random() * LOWER.length)]!,
    DIGITS[Math.floor(Math.random() * DIGITS.length)]!,
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!,
  ];
  for (let i = out.length; i < length; i++) {
    out.push(all[Math.floor(Math.random() * all.length)]!);
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out.join("");
}

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

export function scorePasswordStrength(plain: string): PasswordStrength {
  if (plain.length < 8) return "weak";
  let score = 0;
  if (plain.length >= 12) score++;
  if (/[a-z]/.test(plain) && /[A-Z]/.test(plain)) score++;
  if (/\d/.test(plain)) score++;
  if (/[^A-Za-z0-9]/.test(plain)) score++;
  if (score <= 1) return "weak";
  if (score === 2) return "fair";
  if (score === 3) return "good";
  return "strong";
}

export function passwordMeetsRules(plain: string): boolean {
  if (plain.length < 12) return false;
  if (!/[a-z]/.test(plain) || !/[A-Z]/.test(plain) || !/\d/.test(plain)) return false;
  if (/\s/.test(plain)) return false;
  return true;
}
