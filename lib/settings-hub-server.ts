import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/is-admin";
import { canAccessMeckano } from "@/lib/meckano-access";
import { prisma } from "@/lib/prisma";
import {
  canManageOrganization,
  getWorkspaceRoleLabel,
  type WorkspaceAccessContext,
} from "@/lib/workspace-access";

export type SettingsHubIntegrationRecord = {
  id: string;
  provider: string;
  displayName: string | null;
  autoScan: boolean;
  backupExports: boolean;
  lastSyncAt: string | null;
};

export type SettingsHubOrganizationRecord = {
  name: string;
  type: string;
  companyType: string;
  taxId: string | null;
  address: string | null;
  isReportable: boolean;
  calendarGoogleEnabled: boolean;
  tenantPublicDomain: string | null;
  tenantSiteBrandingJson: unknown;
  paypalMerchantEmail: string | null;
  paypalMeSlug: string | null;
  liveDataTier: string;
  industry: string;
  constructionTrade: string;
  industryConfigJson: unknown;
  meckanoApiKey: string | null;
  subscriptionTier: string;
  subscriptionStatus: string;
};

export type SettingsHubViewer = {
  role: string;
  roleLabel: string;
  canManageOrganization: boolean;
  canManageSubscriptionDirectly: boolean;
};

export type SettingsHubPageData = {
  organization: SettingsHubOrganizationRecord;
  usersTotal: number;
  activeUsers: number;
  integrations: SettingsHubIntegrationRecord[];
  meckanoEnabled: boolean;
  viewer: SettingsHubViewer;
};

/** נתונים משותפים לפאנלי organization/profession/presence/stack/overview */
export async function loadSettingsHubPageData(): Promise<SettingsHubPageData> {
  const session = await getServerSession(authOptions);
  const organizationId = session?.user?.organizationId;

  if (!organizationId) {
    redirect("/login");
  }

  const meckanoEnabled = await canAccessMeckano(session);

  const [organization, usersTotal, activeUsers, integrationsRaw] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        type: true,
        companyType: true,
        taxId: true,
        address: true,
        isReportable: true,
        calendarGoogleEnabled: true,
        tenantPublicDomain: true,
        tenantSiteBrandingJson: true,
        paypalMerchantEmail: true,
        paypalMeSlug: true,
        liveDataTier: true,
        industry: true,
        constructionTrade: true,
        industryConfigJson: true,
        meckanoApiKey: true,
        subscriptionTier: true,
        subscriptionStatus: true,
      },
    }),
    prisma.user.count({
      where: { organizationId },
    }),
    prisma.user.count({
      where: { organizationId, accountStatus: "ACTIVE" },
    }),
    prisma.cloudIntegration.findMany({
      where: { organizationId },
      orderBy: [{ autoScan: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        provider: true,
        displayName: true,
        autoScan: true,
        backupExports: true,
        lastSyncAt: true,
      },
    }),
  ]);

  if (!organization) {
    redirect("/login");
  }

  const integrations = integrationsRaw.map((integration) => ({
    id: integration.id,
    provider: integration.provider,
    displayName: integration.displayName,
    autoScan: integration.autoScan,
    backupExports: integration.backupExports,
    lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
  }));

  const accessContext: WorkspaceAccessContext = {
    role: session?.user?.role ?? "",
    isOSAdmin: isAdmin(session?.user?.email),
    subscriptionTier: organization.subscriptionTier,
    subscriptionStatus: organization.subscriptionStatus,
    hasOrganization: true,
    hasMeckanoAccess: meckanoEnabled,
  };

  return {
    organization: {
      ...organization,
      meckanoApiKey: meckanoEnabled ? organization.meckanoApiKey : null,
    },
    usersTotal,
    activeUsers,
    integrations,
    meckanoEnabled,
    viewer: {
      role: session?.user?.role ?? "",
      roleLabel: getWorkspaceRoleLabel(accessContext),
      canManageOrganization: canManageOrganization(accessContext),
      canManageSubscriptionDirectly: isAdmin(session?.user?.email),
    },
  };
}
