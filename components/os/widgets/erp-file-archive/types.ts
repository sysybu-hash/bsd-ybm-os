import type { ArchiveFileCategory, ArchiveView, ErpArchiveFile } from "@/lib/erp-archive";

export type ProjectRow = { id: string; name: string };

export type ArchiveApiResponse = {
  files: ErpArchiveFile[];
  projects: ProjectRow[];
  totalCount?: number;
  trashCount?: number;
  view?: ArchiveView;
};

export type ScanDocPreview = {
  id: string;
  fileName: string;
  type: string;
  lineItems?: Array<{
    id: string;
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    lineTotal: number | null;
  }>;
};

export type { ArchiveFileCategory, ArchiveView, ErpArchiveFile };
