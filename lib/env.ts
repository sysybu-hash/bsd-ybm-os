/**
 * lib/env.ts — Single source of truth for environment variables.
 *
 * All process.env access should go through this module.
 * Validation runs once at module load; missing REQUIRED vars throw immediately
 * so you get a loud error at startup, not a silent failure at runtime.
 *
 * Usage:
 *   import { env } from "@/lib/env";
 *   const url = env.DATABASE_URL;
 *
 * NEXT_PUBLIC_* vars are safe for client-side access.
 * All other exports are SERVER ONLY — never import in client components.
 */

import { z } from "zod";

// ─── helpers ────────────────────────────────────────────────────────────────

const str = z.string().min(1);
const optStr = z.string().optional();
const optBool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

// ─── schemas ────────────────────────────────────────────────────────────────

const serverSchema = z.object({
  // --- Core DB ---
  DATABASE_URL: str,
  DIRECT_URL: optStr,

  // --- Auth ---
  NEXTAUTH_SECRET: str.or(z.undefined()).transform((v) => v ?? process.env.AUTH_SECRET ?? ""),
  NEXTAUTH_URL: optStr,
  AUTH_SECRET: optStr,
  AUTH_URL: optStr,

  // --- Google / Gemini (at least one required) ---
  GEMINI_API_KEY: optStr,
  GOOGLE_GENERATIVE_AI_API_KEY: optStr,
  GEMINI_MODEL: optStr,
  PREMIUM_GEMINI_MODEL: optStr,
  GEMINI_LIVE_MODEL: optStr,
  GEMINI_AGENT_MODEL: optStr,
  GEMINI_NOTEBOOKLM_MODEL: optStr,
  GEMINI_NOTEBOOK_MODEL: optStr,
  GEMINI_ADMIN_ASSISTANT_MODEL: optStr,
  GEMINI_BLUEPRINT_MODEL: optStr,
  GEMINI_BLUEPRINT_PRIMARY_MODEL: optStr,
  GEMINI_OMNI_VOICE_MODEL: optStr,
  // Per-scan-type model overrides — allows env-based tuning without redeploy
  GEMINI_INVOICE_MODEL: optStr,
  GEMINI_QUOTE_MODEL: optStr,
  GEMINI_SITE_LOG_MODEL: optStr,
  GEMINI_PROGRESS_BILL_MODEL: optStr,
  GEMINI_GENERAL_MODEL: optStr,
  CRM_ANALYSIS_GEMINI_MODEL: optStr,
  GOOGLE_GENERATIVE_AI_MODEL: optStr,

  // --- Google OAuth ---
  /** אינטגרציות: Drive reconnect, Contacts import */
  GOOGLE_CLIENT_ID: optStr,
  GOOGLE_CLIENT_SECRET: optStr,
  /** אופציונלי — Client נפרד לכניסה בלבד (openid, email, profile) ללא אזהרת scopes רגישים */
  GOOGLE_SIGNIN_CLIENT_ID: optStr,
  GOOGLE_SIGNIN_CLIENT_SECRET: optStr,

  // --- Google Cloud / Document AI ---
  GOOGLE_APPLICATION_CREDENTIALS_JSON: optStr,
  GOOGLE_DOCUMENT_AI_CREDENTIALS: optStr,
  GOOGLE_DOCUMENT_AI_PROJECT_ID: optStr,
  GOOGLE_DOCUMENT_AI_LOCATION: optStr,
  GOOGLE_DOCUMENT_AI_PROCESSOR_ID: optStr,
  // Processor IDs per type (replaces single PROCESSOR_ID)
  GOOGLE_DOCUMENT_AI_INVOICE_PROCESSOR_ID: optStr,
  GOOGLE_DOCUMENT_AI_EXPENSE_PROCESSOR_ID: optStr,
  GOOGLE_DOCUMENT_AI_FORM_PROCESSOR_ID: optStr,
  GOOGLE_DOCUMENT_AI_OCR_PROCESSOR_ID: optStr,
  // Display name overrides for processor auto-discovery
  GOOGLE_DOCUMENT_AI_INVOICE_PROCESSOR_NAME: optStr,
  GOOGLE_DOCUMENT_AI_EXPENSE_PROCESSOR_NAME: optStr,
  GOOGLE_DOCUMENT_AI_FORM_PROCESSOR_NAME: optStr,
  GOOGLE_DOCUMENT_AI_OCR_PROCESSOR_NAME: optStr,
  GCLOUD_PROJECT: optStr,
  GOOGLE_CLOUD_PROJECT: optStr,
  GOOGLE_CLOUD_PROJECT_ID: optStr,
  GOOGLE_CLOUD_LOCATION: optStr,

  // --- AI Providers (optional) ---
  ANTHROPIC_API_KEY: optStr,
  ANTHROPIC_MODEL: optStr,
  OPENAI_API_KEY: optStr,
  OPENAI_CHAT_MODEL: optStr,
  OPENAI_VISION_MODEL: optStr,
  OPENAI_RESPONSES_MODEL: optStr,
  GROQ_API_KEY: optStr,
  GROQ_MODEL: optStr,
  MIND_STUDIO_API_KEY: optStr,

  // --- Email ---
  RESEND_API_KEY: optStr,
  SMTP_HOST: optStr,
  SMTP_PORT: optStr,
  SMTP_USER: optStr,
  SMTP_PASS: optStr,
  SMTP_SECURE: optBool,
  MAIL_FROM: optStr,
  EMAIL_FROM: optStr,
  MAIL_REPLY_TO: optStr,

  // --- Payments: PayPal ---
  PAYPAL_CLIENT_ID: optStr,
  PAYPAL_CLIENT_SECRET: optStr,
  /** sandbox | production — מקבל גם live/prod (נפוץ ב-Vercel) */
  PAYPAL_ENV: z.preprocess(
    (v) => {
      if (typeof v !== "string" || !v.trim()) return undefined;
      const n = v.trim().toLowerCase();
      if (n === "sandbox" || n === "test") return "sandbox";
      if (n === "production" || n === "live" || n === "prod") return "production";
      return v;
    },
    z.enum(["sandbox", "production"]).optional(),
  ),
  PAYPAL_WEBHOOK_ID: optStr,
  OS_PAYPAL_MERCHANT_EMAIL: optStr,
  OS_PAYPAL_ME_SLUG: optStr,

  // --- Payments: PayPlus ---
  PAYPLUS_API_KEY: optStr,
  PAYPLUS_SECRET_KEY: optStr,
  PAYPLUS_PAYMENT_PAGE_UID: optStr,

  // --- Redis / Upstash ---
  UPSTASH_REDIS_REST_URL: optStr,
  KV_REST_API_URL: optStr,

  // --- Push Notifications (VAPID) ---
  VAPID_PUBLIC_KEY: optStr,
  VAPID_PRIVATE_KEY: optStr,
  VAPID_SUBJECT: optStr,

  // --- Meckano ---
  MECKANO_API_KEY: optStr,

  // --- ITA (רשות המסים) ---
  ITA_PRODUCTION_KEY: optStr,

  // --- Cron / Queue security ---
  CRON_SECRET: optStr,
  ANALYZE_QUEUE_SECRET: optStr,

  // --- Admin / Tenant ---
  OS_ADMIN_EMAIL: optStr,
  OS_ADMIN_EMAILS: optStr,
  ALLOWED_LOGIN_EMAILS: optStr,
  LOGIN_ALLOWLIST_EMAILS: optStr,
  LOGIN_BLOCKED_EMAILS: optStr,
  TENANT_OS_HOSTS: optStr,
  TENANT_FALLBACK_REDIRECT: optStr,

  // --- Chromium / PDF ---
  CHROME_PATH: optStr,
  PUPPETEER_EXECUTABLE_PATH: optStr,

  // --- Feature flags ---
  BLUEPRINT_USE_FLASH_ONLY: optBool,
  ENABLE_DEBUG_SESSION: optBool,
  PRISMA_USE_NEON_DRIVER: optBool,

  // --- Site verification (SEO) ---
  GOOGLE_SITE_VERIFICATION: optStr,
  SITE_VERIFICATION_GOOGLE: optStr,
  SITE_VERIFICATION_BING: optStr,
  SITE_VERIFICATION_FACEBOOK: optStr,
  SITE_VERIFICATION_META_CONTENT: optStr,
  SITE_VERIFICATION_META_NAME: optStr,
  SITE_VERIFICATION_PINTEREST: optStr,
  SITE_VERIFICATION_YAHOO: optStr,
  SITE_VERIFICATION_YANDEX: optStr,

  // --- Runtime (Vercel / Node) ---
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VERCEL: optStr,
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  VERCEL_URL: optStr,
});

const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: optStr,
  NEXT_PUBLIC_APP_URL: optStr,
  NEXT_PUBLIC_POSTHOG_KEY: optStr,
  NEXT_PUBLIC_POSTHOG_HOST: optStr,
  NEXT_PUBLIC_POSTHOG_TOKEN: optStr,
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: optStr,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optStr,
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: optStr,
  NEXT_PUBLIC_SAME_AS: optStr,
});

// ─── validation with helpful error messages ─────────────────────────────────

function validateEnv() {
  const serverResult = serverSchema.safeParse(process.env);
  const clientResult = clientSchema.safeParse(process.env);

  const errors: string[] = [];

  if (!serverResult.success) {
    for (const issue of serverResult.error.issues) {
      errors.push(`  SERVER: ${issue.path.join(".")} — ${issue.message}`);
    }
  }
  if (!clientResult.success) {
    for (const issue of clientResult.error.issues) {
      errors.push(`  CLIENT: ${issue.path.join(".")} — ${issue.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `\n\n❌ Environment validation failed:\n${errors.join("\n")}\n\n` +
        `  Check your .env.local file or Vercel environment variables.\n`
    );
  }

  // Gemini: דרוש לפחות אחד מהשניים
  const parsed = serverResult.data!;
  if (!parsed.GEMINI_API_KEY && !parsed.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.warn(
      "[env] WARNING: Neither GEMINI_API_KEY nor GOOGLE_GENERATIVE_AI_API_KEY is set. AI features will be unavailable."
    );
  }

  // NEXTAUTH_SECRET: דרוש לפחות אחד
  if (!parsed.NEXTAUTH_SECRET && !parsed.AUTH_SECRET) {
    throw new Error(
      "❌ NEXTAUTH_SECRET (or AUTH_SECRET) is required for authentication."
    );
  }

  return { ...parsed, ...clientResult.data! };
}

// ─── singleton — parse once ──────────────────────────────────────────────────

let _env: ReturnType<typeof validateEnv> | undefined;

function getEnv() {
  if (!_env) {
    _env = validateEnv();
  }
  return _env;
}

/**
 * Typed environment. Import this instead of `process.env.X`.
 *
 * SERVER ONLY — do not import in client components or pages marked "use client".
 * For NEXT_PUBLIC_* vars, use `clientEnv` or access directly in client code.
 */
export const env = new Proxy({} as ReturnType<typeof validateEnv>, {
  get(_, key: string) {
    return getEnv()[key as keyof ReturnType<typeof validateEnv>];
  },
});

/**
 * Client-safe subset of env (NEXT_PUBLIC_* only).
 * Safe to import in "use client" components.
 */
export const clientEnv = {
  get NEXT_PUBLIC_SITE_URL() { return process.env.NEXT_PUBLIC_SITE_URL; },
  get NEXT_PUBLIC_APP_URL() { return process.env.NEXT_PUBLIC_APP_URL; },
  get NEXT_PUBLIC_POSTHOG_KEY() { return process.env.NEXT_PUBLIC_POSTHOG_KEY; },
  get NEXT_PUBLIC_POSTHOG_HOST() { return process.env.NEXT_PUBLIC_POSTHOG_HOST; },
  get NEXT_PUBLIC_POSTHOG_TOKEN() { return process.env.NEXT_PUBLIC_POSTHOG_TOKEN; },
  get NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN() { return process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN; },
  get NEXT_PUBLIC_VAPID_PUBLIC_KEY() { return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; },
  get NEXT_PUBLIC_PAYPAL_CLIENT_ID() { return process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID; },
  get NEXT_PUBLIC_SAME_AS() { return process.env.NEXT_PUBLIC_SAME_AS; },
};

export type Env = ReturnType<typeof validateEnv>;
