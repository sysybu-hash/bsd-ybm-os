import { prisma } from "@/lib/prisma";

export type TenantBranding = {
  landingTitle?: string;
  tagline?: string;
  primaryColor?: string;
  logoUrl?: string;
};

export type ResolvedTenant = {
  organizationId: string;
  organizationName: string;
  host: string;
  branding: TenantBranding;
};

const PLATFORM_HOSTS = new Set(
  [
    "bsd-ybm.co.il",
    "www.bsd-ybm.co.il",
    "localhost",
    "127.0.0.1",
    ...(process.env.NEXT_PUBLIC_SITE_URL ?? "")
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      .toLowerCase()
      .split(",")
      .filter(Boolean),
    ...(process.env.TENANT_OS_HOSTS ?? "")
      .split(/[,;]/)
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  ].map((h) => h.replace(/:\d+$/, "")),
);

export function normalizeHostname(host: string | null | undefined): string {
  if (!host) return "";
  return host.split(":")[0].trim().toLowerCase();
}

export function isPlatformHost(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  if (!h) return true;
  if (PLATFORM_HOSTS.has(h)) return true;
  if (h.endsWith(".vercel.app")) return true;
  return false;
}

function parseBranding(json: unknown): TenantBranding {
  if (!json || typeof json !== "object") return {};
  const o = json as Record<string, unknown>;
  return {
    landingTitle: typeof o.landingTitle === "string" ? o.landingTitle : undefined,
    tagline: typeof o.tagline === "string" ? o.tagline : undefined,
    primaryColor: typeof o.primaryColor === "string" ? o.primaryColor : undefined,
    logoUrl: typeof o.logoUrl === "string" ? o.logoUrl : undefined,
  };
}

let tenantCache: { host: string; at: number; value: ResolvedTenant | null } | null = null;
const CACHE_MS = 30_000;

/** מזהה ארגון לפי דומיין ציבורי (תת-דומיין / דומיין מותאם של מנוי) */
export async function resolveTenantByHost(
  rawHost: string | null | undefined,
): Promise<ResolvedTenant | null> {
  const host = normalizeHostname(rawHost);
  if (!host || isPlatformHost(host)) return null;

  const now = Date.now();
  if (tenantCache && tenantCache.host === host && now - tenantCache.at < CACHE_MS) {
    return tenantCache.value;
  }

  const org = await prisma.organization.findFirst({
    where: { tenantPublicDomain: host },
    select: {
      id: true,
      name: true,
      tenantSiteBrandingJson: true,
    },
  });

  const value = org
    ? {
        organizationId: org.id,
        organizationName: org.name,
        host,
        branding: parseBranding(org.tenantSiteBrandingJson),
      }
    : null;

  tenantCache = { host, at: now, value };
  return value;
}

export function tenantBrandingCssVars(branding: TenantBranding): Record<string, string> {
  const primary = branding.primaryColor?.trim();
  if (!primary || !/^#[0-9a-fA-F]{3,8}$/.test(primary)) {
    return {};
  }
  return {
    "--tenant-primary": primary,
    "--accent": primary,
  };
}
