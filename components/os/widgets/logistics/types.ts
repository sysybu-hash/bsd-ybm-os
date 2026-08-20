import type { AssetStatus } from "@prisma/client";

export type LogisticsInventoryRow = {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  quantity: number;
  minQuantity: number;
  unit: string;
  location: string | null;
};

export type LogisticsAssetRow = {
  id: string;
  name: string;
  serialNumber: string | null;
  type: string;
  status: AssetStatus;
  currentUserId: string | null;
  projectId: string | null;
  currentUser: { id: string; name: string | null; email: string } | null;
  project: { id: string; name: string } | null;
};

export type LogisticsLookups = {
  users: Array<{ id: string; name: string | null; email: string }>;
  projects: Array<{ id: string; name: string }>;
};

export type LogisticsTabId = "inventory" | "assets";
