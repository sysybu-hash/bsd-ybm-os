/**
 * שליחת מייל בדיקה — Resend או SMTP מ-.env / .env.local
 *
 *   node scripts/test-email.mjs your@email.com
 *
 * פרודקשן (מחובר כסופר-אדמין):
 *   curl -X POST https://www.bsd-ybm.co.il/api/admin/test-email -H "Cookie: ..." -H "Content-Type: application/json" -d "{\"to\":\"your@email.com\"}"
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Resend } from "resend";
import nodemailer from "nodemailer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

for (const name of [".env", ".env.local"]) {
  const p = resolve(root, name);
  if (existsSync(p)) dotenv.config({ path: p, override: name === ".env.local" });
}

const to = (process.argv[2] || process.env.OS_ADMIN_EMAIL || process.env.MAIL_REPLY_TO || "")
  .trim()
  .toLowerCase();

if (!to || !to.includes("@")) {
  console.error("שימוש: node scripts/test-email.mjs recipient@example.com");
  process.exit(1);
}

function formatFrom(raw) {
  const v = (raw || "yb@bsd-ybm.co.il").trim();
  if (v.includes("<")) return v;
  if (v.includes("@") && !v.includes(" ")) return `BSD-YBM <${v}>`;
  return v;
}

const from = formatFrom(process.env.MAIL_FROM || process.env.EMAIL_FROM);
const replyTo = (process.env.MAIL_REPLY_TO || process.env.SMTP_USER || "yb@bsd-ybm.co.il").trim();
const subject = "BSD-YBM — בדיקת מייל (script)";
const html = `<p dir="rtl" style="font-family:sans-serif">אם קיבלתם הודעה זו, שליחת המייל מהמערכת פעילה.<br/>שולח: ${from}</p>`;

const resendKey = process.env.RESEND_API_KEY?.trim();
const smtpHost = process.env.SMTP_HOST?.trim();

async function sendViaResend() {
  const resend = new Resend(resendKey);
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject,
    html,
    replyTo: replyTo.includes("@") ? replyTo : undefined,
  });
  if (error) throw new Error(error.message || JSON.stringify(error));
  return "Resend";
}

async function sendViaSmtp() {
  const port = Number(process.env.SMTP_PORT?.trim() || "587");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
  await transporter.sendMail({
    from,
    to,
    subject,
    html,
    replyTo: replyTo.includes("@") ? replyTo : undefined,
  });
  return "SMTP";
}

async function main() {
  if (resendKey) {
    const transport = await sendViaResend();
    console.log(`✓ נשלח דרך ${transport} ל-${to}`);
    return;
  }
  if (smtpHost && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()) {
    const transport = await sendViaSmtp();
    console.log(`✓ נשלח דרך ${transport} ל-${to}`);
    return;
  }
  console.error("חסר RESEND_API_KEY או SMTP_HOST+SMTP_USER+SMTP_PASS ב-.env.local");
  process.exit(1);
}

main().catch((e) => {
  console.error("שגיאה:", e instanceof Error ? e.message : e);
  process.exit(1);
});
