import {
  BarChart3,
  Calculator,
  CalendarDays,
  CheckSquare,
  Database,
  FileText,
  Kanban,
  LayoutGrid,
  Table2,
} from "lucide-react";
import type { AppSchemaListItem } from "@/app/actions/app-builder";
import type { AppBuilderUiSchema } from "@/lib/validation/schemas/app-builder";

/** Maps a saved app's type to its representative icon. */
export function schemaTypeIcon(appType: AppSchemaListItem["appType"]) {
  if (appType === "dashboard") return BarChart3;
  if (appType === "composer") return LayoutGrid;
  if (appType === "full_app") return Database;
  if (appType === "checklist") return CheckSquare;
  if (appType === "calculator") return Calculator;
  if (appType === "kanban") return Kanban;
  if (appType === "calendar") return CalendarDays;
  if (appType === "table") return Table2;
  return FileText;
}

/** Applies a display title onto a UI schema, respecting per-type title rules. */
export function syncUiSchemaTitle(schema: AppBuilderUiSchema, title: string): AppBuilderUiSchema {
  // All non-form/table types have a required `title`
  if (
    schema.type === "dashboard" ||
    schema.type === "composer" ||
    schema.type === "full_app" ||
    schema.type === "checklist" ||
    schema.type === "calculator" ||
    schema.type === "kanban" ||
    schema.type === "calendar"
  ) {
    return { ...schema, title } as AppBuilderUiSchema;
  }
  // form / table have optional title
  return { ...schema, title: title || schema.title } as AppBuilderUiSchema;
}

/** Translates known server action error codes into localized messages. */
export function mapActionError(error: string, t: (key: string) => string, prefix: string): string {
  if (error === "schema_not_found_or_readonly") {
    return t(`${prefix}.globalAppReadOnly`);
  }
  if (error === "generate_failed") {
    return t(`${prefix}.generateError`);
  }
  return error;
}
