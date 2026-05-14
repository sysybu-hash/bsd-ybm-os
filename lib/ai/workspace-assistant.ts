import { getServerLocale } from "@/lib/i18n/server";
import { getUserFacingAiErrorMessage, runAiChat } from "@/lib/ai-chat";
import { loadCommercialHubSnapshot } from "@/lib/workspace/load-commercial-hub";
import { loadRecentBillOfQuantitiesContext } from "@/lib/load-recent-bill-of-quantities-context";

type WorkspaceAssistantArgs = {
  provider?: string;
  message: string;
  orgId?: string | null;
  sectionLabel: string;
  sectionSummary?: string;
  userName: string;
  industry: string;
  constructionTrade: string;
};

export async function runWorkspaceAssistant({
  provider,
  message,
  orgId,
  sectionLabel,
  sectionSummary,
  userName,
  industry,
  constructionTrade,
}: WorkspaceAssistantArgs): Promise<{ answer: string; provider: string }> {
  const locale = await getServerLocale();

  const [snapshot, boqContext] = await Promise.all([
    orgId ? loadCommercialHubSnapshot(orgId) : Promise.resolve(null),
    orgId ? loadRecentBillOfQuantitiesContext(orgId, 6, 12_000) : Promise.resolve(null),
  ]);
  const contextJson = JSON.stringify({
    audience: orgId ? "workspace_member" : "signed_in_user",
    userName,
    sectionLabel,
    sectionSummary,
    industry,
    constructionTrade,
    finance:
      snapshot == null
        ? null
        : {
            pendingCollection: snapshot.totals.pendingCollection,
            pendingIssuedTotal: snapshot.totals.pendingIssuedTotal,
            paidIssuedTotal: snapshot.totals.paidIssuedTotal,
            forecast: snapshot.forecast,
          },
    clients:
      snapshot == null
        ? null
        : {
            count: snapshot.totals.clientsCount,
            pipelineValue: snapshot.totals.pipelineValue,
            activeProjects: snapshot.totals.activeProjects,
            topPendingClients: snapshot.contacts
              .filter((contact) => contact.totalPending > 0)
              .sort((left, right) => right.totalPending - left.totalPending)
              .slice(0, 4)
              .map((contact) => ({
                name: contact.name,
                status: contact.status,
                totalPending: contact.totalPending,
                project: contact.project?.name ?? null,
              })),
          },
    recentIssued:
      snapshot == null
        ? []
        : snapshot.recentIssued.slice(0, 5).map((document) => ({
            clientName: document.clientName,
            status: document.status,
            total: document.total,
            date: document.date,
          })),
    billOfQuantitiesScanContext: boqContext,
  });

  const { text, provider: resolvedProvider } = await runAiChat(provider, message, contextJson, locale);
  return {
    answer: text,
    provider: resolvedProvider,
  };
}

export { getUserFacingAiErrorMessage };
