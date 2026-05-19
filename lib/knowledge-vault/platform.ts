import { getPlatformConfig } from "@/lib/platform-settings";

export async function isKnowledgeVaultEnabled(): Promise<boolean> {
  const config = await getPlatformConfig();
  return config.featureFlags.knowledgeVaultEnabled === true;
}
