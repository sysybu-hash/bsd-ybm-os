/** שם תיקיית שורש למאגר ידע תחת תיקיית העבודה ב-Drive */
export const KNOWLEDGE_VAULT_ROOT_FOLDER_NAME = "BSD-YBM Knowledge";

export const KNOWLEDGE_VAULT_SUBFOLDERS = {
  INGEST: "Ingest",
  PARSED: "Parsed",
  ISSUED: "Issued",
} as const;

export type KnowledgeVaultFolderKey = keyof typeof KNOWLEDGE_VAULT_SUBFOLDERS;
