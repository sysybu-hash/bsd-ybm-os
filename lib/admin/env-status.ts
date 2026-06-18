import { env } from "@/lib/env";
import { getMailFrom, isResendConfigured, isSmtpConfigured, mailTransportLabel } from "@/lib/mail-config";
import { hasOSPayPalConfigured } from "@/lib/platform-paypal";

export type EnvCheckKind = "required" | "recommended" | "optional";

export type AdminEnvCheck = {
  id: string;
  configured: boolean;
  kind: EnvCheckKind;
  /** Metadata safe to display in admin UI (no secrets). */
  meta?: string;
};

export type AdminEnvCheckGroup = {
  id: string;
  checks: AdminEnvCheck[];
};

function has(value?: string | null): boolean {
  return Boolean(value?.trim());
}

function emailDomain(raw?: string): string | undefined {
  const match = raw?.match(/@([\w.-]+)/);
  return match?.[1];
}

function mailFromDomain(): string | undefined {
  return emailDomain(getMailFrom());
}

function safeUrlHost(raw?: string): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

export function getAdminEnvChecks(): AdminEnvCheckGroup[] {
  const payplusOk =
    has(env.PAYPLUS_API_KEY) && has(env.PAYPLUS_SECRET_KEY) && has(env.PAYPLUS_PAYMENT_PAGE_UID);
  const paypalClientOk = has(env.PAYPAL_CLIENT_ID) && has(env.PAYPAL_CLIENT_SECRET);

  return [
    {
      id: "core",
      checks: [
        { id: "databaseUrl", configured: has(env.DATABASE_URL), kind: "required" },
      ],
    },
    {
      id: "auth",
      checks: [
        {
          id: "nextAuthSecret",
          configured: has(env.NEXTAUTH_SECRET) || has(env.AUTH_SECRET),
          kind: "required",
        },
        {
          id: "nextAuthUrl",
          configured: has(env.NEXTAUTH_URL) || has(env.AUTH_URL),
          kind: "recommended",
          meta: safeUrlHost(env.NEXTAUTH_URL) ?? safeUrlHost(env.AUTH_URL),
        },
        {
          id: "googleOAuth",
          configured: has(env.GOOGLE_CLIENT_ID) && has(env.GOOGLE_CLIENT_SECRET),
          kind: "optional",
        },
      ],
    },
    {
      id: "ai",
      checks: [
        {
          id: "googleAi",
          configured: has(env.GOOGLE_GENERATIVE_AI_API_KEY) || has(env.GEMINI_API_KEY),
          kind: "required",
        },
        { id: "openai", configured: has(env.OPENAI_API_KEY), kind: "optional" },
        { id: "anthropic", configured: has(env.ANTHROPIC_API_KEY), kind: "optional" },
        { id: "groq", configured: has(env.GROQ_API_KEY), kind: "optional" },
        {
          id: "documentAi",
          configured:
            has(env.GOOGLE_DOCUMENT_AI_PROJECT_ID) ||
            has(env.GOOGLE_APPLICATION_CREDENTIALS_JSON) ||
            has(env.GOOGLE_DOCUMENT_AI_CREDENTIALS),
          kind: "optional",
        },
      ],
    },
    {
      id: "email",
      checks: [
        {
          id: "resend",
          configured: isResendConfigured(),
          kind: "recommended",
        },
        {
          id: "smtpHost",
          configured: isSmtpConfigured(),
          kind: "recommended",
          meta: isSmtpConfigured() ? env.SMTP_HOST?.trim() : undefined,
        },
        {
          id: "mailFrom",
          configured: has(env.MAIL_FROM) || has(env.EMAIL_FROM),
          kind: "recommended",
          meta: mailFromDomain() ? `@${mailFromDomain()}` : undefined,
        },
      ],
    },
    {
      id: "payments",
      checks: [
        {
          id: "paypalClient",
          configured: paypalClientOk,
          kind: "optional",
          meta: env.PAYPAL_ENV?.trim(),
        },
        {
          id: "osPaypal",
          configured: hasOSPayPalConfigured(),
          kind: "optional",
        },
        {
          id: "payplus",
          configured: payplusOk,
          kind: "optional",
        },
      ],
    },
    {
      id: "cron",
      checks: [
        { id: "cronSecret", configured: has(env.CRON_SECRET), kind: "recommended" },
        { id: "analyzeQueueSecret", configured: has(env.ANALYZE_QUEUE_SECRET), kind: "optional" },
      ],
    },
    {
      id: "integrations",
      checks: [
        {
          id: "upstashRedis",
          configured: has(env.UPSTASH_REDIS_REST_URL) || has(env.KV_REST_API_URL),
          kind: "optional",
        },
        {
          id: "posthog",
          configured: has(env.POSTHOG_API_KEY) || has(process.env.NEXT_PUBLIC_POSTHOG_KEY),
          kind: "optional",
        },
        {
          id: "vapid",
          configured: has(env.VAPID_PUBLIC_KEY) && has(env.VAPID_PRIVATE_KEY),
          kind: "optional",
        },
        { id: "meckano", configured: has(env.MECKANO_API_KEY), kind: "optional" },
      ],
    },
  ];
}

export function getAdminEnvChecksFlat(): AdminEnvCheck[] {
  return getAdminEnvChecks().flatMap((group) => group.checks);
}

/** Legacy boolean map for assistant tools and settings API. */
export function getAdminEnvStatusRecord(): Record<string, boolean> {
  const record: Record<string, boolean> = {};
  for (const check of getAdminEnvChecksFlat()) {
    record[check.id] = check.configured;
  }
  return record;
}

export function summarizeMailTransport(): { ok: boolean; transport: string; fromDomain?: string } {
  const ok = isResendConfigured() || isSmtpConfigured();
  return {
    ok,
    transport: mailTransportLabel(),
    fromDomain: mailFromDomain(),
  };
}
