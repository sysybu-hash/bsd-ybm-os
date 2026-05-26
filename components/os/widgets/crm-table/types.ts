import type { WidgetType } from "@/hooks/use-window-manager";

export type IssuedDocumentRow = {
  id: string;
  type: string;
  number: number;
  clientName: string;
  total: number;
  status: string;
  date: string;
  items: unknown;
};

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: "active" | "lead" | "inactive";
  lastContact: string;
  totalProjects: number;
  projectId: string | null;
  projectName: string | null;
  issuedDocuments: IssuedDocumentRow[];
  tags?: string[];
}

export type ContactTimelineEvent = {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail?: string;
};

export type ProjectOption = { id: string; name: string };

export type OpenWorkspaceWidgetFn = (
  type: WidgetType,
  data?: Record<string, unknown> | null,
  options?: { maximize?: boolean },
) => string | void;

export type CrmTableWidgetProps = {
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
};
