import bcrypt from "bcryptjs";

const ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function validatePasswordStrength(plain: string): { ok: true } | { ok: false; message: string } {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים.` };
  }
  if (!/[a-z]/.test(plain) || !/[A-Z]/.test(plain) || !/\d/.test(plain)) {
    return { ok: false, message: "הסיסמה חייבת לכלול אות גדולה, אות קטנה וספרה." };
  }
  if (/\s/.test(plain)) {
    return { ok: false, message: "הסיסמה לא יכולה לכלול רווחים." };
  }
  return { ok: true };
}

/** סיסמה אקראית קריאה חלקית (למשל לשליחה באימייל) */
export function generateProvisionPassword(length = 14): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@$%&*-";
  const all = upper + lower + digits + symbols;
  const out: string[] = [
    upper[Math.floor(Math.random() * upper.length)]!,
    lower[Math.floor(Math.random() * lower.length)]!,
    digits[Math.floor(Math.random() * digits.length)]!,
    symbols[Math.floor(Math.random() * symbols.length)]!,
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
