import type { DataConfig } from "@/lib/validation/schemas/app-builder";

/** מקורות נתונים לדשבורדים — מקור אמת יחיד ל-prompt, Zod ו-allowlists */
export const APP_BUILDER_DATA_TABLES = [
  "projects",
  "expenses",
  "contacts",
  "tasks",
  "issuedDocuments",
  "CustomAppData",
] as const;

export type AppBuilderDataTable = (typeof APP_BUILDER_DATA_TABLES)[number];

const GROUP_BY: Record<AppBuilderDataTable, readonly string[]> = {
  projects: ["status"],
  expenses: ["allocation", "status"],
  contacts: ["status"],
  tasks: ["status", "priority"],
  issuedDocuments: ["type", "status"],
  CustomAppData: [],
};

const VALUE_FIELDS: Record<AppBuilderDataTable, readonly string[]> = {
  projects: ["budget"],
  expenses: ["total", "amountNet", "vat"],
  contacts: ["value"],
  tasks: [],
  issuedDocuments: ["amount", "total", "vat"],
  CustomAppData: [],
};

export function isAllowedGroupBy(targetTable: DataConfig["targetTable"], groupBy: string): boolean {
  if (!(targetTable in GROUP_BY)) return false;
  return GROUP_BY[targetTable as AppBuilderDataTable].includes(groupBy);
}

export function isAllowedValueField(
  targetTable: DataConfig["targetTable"],
  valueField: string,
): boolean {
  if (!(targetTable in VALUE_FIELDS)) return false;
  return VALUE_FIELDS[targetTable as AppBuilderDataTable].includes(valueField);
}

export function dataCatalogForPrompt(): string {
  const lines: string[] = [];
  for (const table of APP_BUILDER_DATA_TABLES) {
    const groupBy = GROUP_BY[table].length ? GROUP_BY[table].join(" | ") : "—";
    const values = VALUE_FIELDS[table].length ? VALUE_FIELDS[table].join(" | ") : "—";
    lines.push(`- ${table}: groupBy ${groupBy}; valueField ${values}; aggregations count | sum | avg | raw`);
  }
  return lines.join("\n");
}
