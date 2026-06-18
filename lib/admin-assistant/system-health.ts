import { getAdminEnvChecks } from "@/lib/admin/env-status";
import { hasOSPayPalConfigured } from "@/lib/platform-paypal";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { summarizeMailTransport } from "@/lib/admin/env-status";

export type AdminServiceStatus = {
  id: "database" | "aiEngine" | "email" | "payments" | "auth";
  ok: boolean;
  meta?: Record<string, string>;
};

export type AdminSystemHealth = {
  checkedAt: string;
  statuses: AdminServiceStatus[];
  envChecks: ReturnType<typeof getAdminEnvChecks>;
};

function aiProviders(): string[] {
  const providers: string[] = [];
  if (env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || env.GEMINI_API_KEY?.trim()) {
    providers.push("Gemini");
  }
  if (env.OPENAI_API_KEY?.trim()) providers.push("OpenAI");
  if (env.ANTHROPIC_API_KEY?.trim()) providers.push("Anthropic");
  if (env.GROQ_API_KEY?.trim()) providers.push("Groq");
  return providers;
}

export async function getAdminSystemHealth(): Promise<AdminSystemHealth> {
  const statuses: AdminServiceStatus[] = [];

  try {
    await prisma.$queryRaw`SELECT 1`;
    statuses.push({ id: "database", ok: true });
  } catch {
    statuses.push({ id: "database", ok: false });
  }

  const providers = aiProviders();
  statuses.push({
    id: "aiEngine",
    ok: providers.length > 0,
    meta: { providers: providers.join(", ") },
  });

  const authOk = Boolean(env.NEXTAUTH_SECRET?.trim() || env.AUTH_SECRET?.trim());
  statuses.push({ id: "auth", ok: authOk });

  const mail = summarizeMailTransport();
  statuses.push({
    id: "email",
    ok: mail.ok,
    meta: {
      transport: mail.transport,
      fromDomain: mail.fromDomain ?? "",
    },
  });

  const payplusOk = Boolean(
    env.PAYPLUS_API_KEY?.trim() &&
      env.PAYPLUS_SECRET_KEY?.trim() &&
      env.PAYPLUS_PAYMENT_PAGE_UID?.trim(),
  );
  const paypalClientOk = Boolean(
    env.PAYPAL_CLIENT_ID?.trim() && env.PAYPAL_CLIENT_SECRET?.trim(),
  );
  const platformPaypal = hasOSPayPalConfigured();
  const paymentsOk = payplusOk || paypalClientOk || platformPaypal;
  statuses.push({
    id: "payments",
    ok: paymentsOk,
    meta: {
      payplus: payplusOk ? "ok" : "missing",
      paypalClient: paypalClientOk ? "ok" : "missing",
      osPaypal: platformPaypal ? "ok" : "missing",
    },
  });

  return {
    checkedAt: new Date().toISOString(),
    statuses,
    envChecks: getAdminEnvChecks(),
  };
}
