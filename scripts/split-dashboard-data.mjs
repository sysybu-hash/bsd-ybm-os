import fs from "node:fs";

const src = fs.readFileSync("app/actions/dashboard-data.ts", "utf8");
const lines = src.split(/\r?\n/);

const fetchers = lines.slice(22, 441).join("\n");
const fetchersFile = `"use server";

import {
  type ChartDataPoint,
} from "@/lib/app-builder/dashboard-allowlists";
import { prisma } from "@/lib/prisma";
import type { DataConfig } from "@/lib/validation/schemas/app-builder";

${fetchers}
`;

const mainFile = `"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  chartRequiresDataConfig,
  isAllowedGroupBy,
  isAllowedValueField,
  type ChartDataPoint,
} from "@/lib/app-builder/dashboard-allowlists";
import { roundChartDataPoints } from "@/lib/app-builder/format-chart-value";
import { createLogger } from "@/lib/logger";
import { dataConfigSchema, type DataConfig } from "@/lib/validation/schemas/app-builder";
import {
  fetchContactsData,
  fetchCustomAppData,
  fetchExpensesData,
  fetchIssuedDocumentsData,
  fetchProjectsData,
  fetchTasksData,
} from "@/app/actions/dashboard-data-fetchers";

const log = createLogger("dashboard-data");

async function getOrgId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.organizationId ?? null;
}

function validateConfig(config: DataConfig): string | null {
  if (config.groupBy && !isAllowedGroupBy(config.targetTable, config.groupBy)) {
    return "invalid_group_by";
  }
  if (config.valueField && !isAllowedValueField(config.targetTable, config.valueField)) {
    return "invalid_value_field";
  }
  if (
    (config.aggregation === "sum" || config.aggregation === "avg") &&
    !config.valueField
  ) {
    return "value_field_required";
  }
  return null;
}

export async function fetchDynamicChartDataAction(
  configInput: unknown,
): Promise<{ ok: true; data: ChartDataPoint[] } | { ok: false; error: string }> {
  const orgId = await getOrgId();
  if (!orgId) {
    return { ok: false, error: "Unauthorized" };
  }

  const parsed = dataConfigSchema.safeParse(configInput);
  if (!parsed.success) {
    return { ok: false, error: "invalid_data_config" };
  }

  const validationError = validateConfig(parsed.data);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  try {
    let data: ChartDataPoint[] = [];
    switch (parsed.data.targetTable) {
      case "projects":
        data = await fetchProjectsData(orgId, parsed.data);
        break;
      case "expenses":
        data = await fetchExpensesData(orgId, parsed.data);
        break;
      case "contacts":
        data = await fetchContactsData(orgId, parsed.data);
        break;
      case "tasks":
        data = await fetchTasksData(orgId, parsed.data);
        break;
      case "issuedDocuments":
        data = await fetchIssuedDocumentsData(orgId, parsed.data);
        break;
      case "CustomAppData":
        data = await fetchCustomAppData(orgId, parsed.data);
        break;
      default:
        return { ok: false, error: "unsupported_table" };
    }
    return { ok: true, data: roundChartDataPoints(data) };
  } catch (err: unknown) {
    log.error("fetch_failed", {
      message: err instanceof Error ? err.message : String(err),
      orgId,
    });
    return { ok: false, error: "fetch_failed" };
  }
}

export async function fetchDashboardComponentDataAction(
  componentType: string,
  configInput: unknown,
): Promise<{ ok: true; data: ChartDataPoint[] } | { ok: false; error: string }> {
  if (!chartRequiresDataConfig(componentType)) {
    return { ok: true, data: [] };
  }
  if (!configInput) {
    return { ok: false, error: "missing_data_config" };
  }
  return fetchDynamicChartDataAction(configInput);
}
`;

// Prefix fetch functions with export
const fixedFetchers = fetchersFile.replace(
  /^async function fetch/gm,
  "export async function fetch",
).replace(/^async function sum/gm, "async function sum");

fs.writeFileSync("app/actions/dashboard-data-fetchers.ts", fixedFetchers);
fs.writeFileSync("app/actions/dashboard-data.ts", mainFile);
console.log("dashboard-data split ok");
