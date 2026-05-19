import { CloudProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureOrgDriveWorkspaceFolder } from "@/lib/google-drive-org";
import { GoogleDriveService } from "@/lib/services/google-drive";
import {
  KNOWLEDGE_VAULT_ROOT_FOLDER_NAME,
  KNOWLEDGE_VAULT_SUBFOLDERS,
  type KnowledgeVaultFolderKey,
} from "@/lib/knowledge-vault/constants";

export type KnowledgeVaultFolderIds = {
  rootId: string;
  ingestId: string;
  parsedId: string;
  issuedId: string;
};

function parseCached(raw: unknown): KnowledgeVaultFolderIds | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.rootId === "string" &&
    typeof o.ingestId === "string" &&
    typeof o.parsedId === "string" &&
    typeof o.issuedId === "string"
  ) {
    return {
      rootId: o.rootId,
      ingestId: o.ingestId,
      parsedId: o.parsedId,
      issuedId: o.issuedId,
    };
  }
  return null;
}

/** יוצר/מחזיר תיקיות Ingest, Parsed, Issued תחת תיקיית העבודה */
export async function ensureKnowledgeVaultFolders(
  userId: string,
  organizationId: string,
): Promise<KnowledgeVaultFolderIds> {
  const integration = await prisma.cloudIntegration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: CloudProvider.GOOGLE_DRIVE,
      },
    },
    select: { id: true, knowledgeVaultFoldersJson: true },
  });

  const cached = parseCached(integration?.knowledgeVaultFoldersJson);
  if (cached) return cached;

  const { folderId: workspaceId } = await ensureOrgDriveWorkspaceFolder(userId, organizationId);
  const drive = await GoogleDriveService.forUser(userId);

  const root = await drive.ensureFolder(KNOWLEDGE_VAULT_ROOT_FOLDER_NAME, workspaceId);
  if (!root.id) throw new Error("לא ניתן ליצור תיקיית מאגר ידע");

  const ids: KnowledgeVaultFolderIds = {
    rootId: root.id,
    ingestId: "",
    parsedId: "",
    issuedId: "",
  };

  for (const key of Object.keys(KNOWLEDGE_VAULT_SUBFOLDERS) as KnowledgeVaultFolderKey[]) {
    const sub = await drive.ensureFolder(KNOWLEDGE_VAULT_SUBFOLDERS[key], root.id);
    if (!sub.id) throw new Error(`לא ניתן ליצור תיקיית ${KNOWLEDGE_VAULT_SUBFOLDERS[key]}`);
    if (key === "INGEST") ids.ingestId = sub.id;
    if (key === "PARSED") ids.parsedId = sub.id;
    if (key === "ISSUED") ids.issuedId = sub.id;
  }

  if (integration?.id) {
    await prisma.cloudIntegration.update({
      where: { id: integration.id },
      data: { knowledgeVaultFoldersJson: ids },
    });
  }

  return ids;
}

export function vaultFolderIdForPath(
  folders: KnowledgeVaultFolderIds,
  path: "INGEST" | "PARSED" | "ISSUED" | "ARCHIVE",
): string {
  switch (path) {
    case "INGEST":
      return folders.ingestId;
    case "PARSED":
      return folders.parsedId;
    case "ISSUED":
      return folders.issuedId;
    default:
      return folders.rootId;
  }
}
