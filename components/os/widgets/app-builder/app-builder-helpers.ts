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

/** Escape text for embedding inside a JS template literal in generated preview code. */
function escapeForTemplateLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}

/** Placeholder component shown in the preview before any app is generated. */
export function buildSandpackPlaceholder(title: string, subtitle: string): string {
  const safeTitle = escapeForTemplateLiteral(title);
  const safeSubtitle = escapeForTemplateLiteral(subtitle);
  return `export default function App() {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100%",height:"100%",gap:"16px",background:"#f8fafc",fontFamily:"system-ui,sans-serif",color:"#64748b",textAlign:"center",padding:"32px",boxSizing:"border-box"}}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.5}}>
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
      </svg>
      <p style={{fontSize:"15px",fontWeight:600,color:"#475569",margin:0}}>${safeTitle}</p>
      <p style={{fontSize:"13px",color:"#94a3b8",maxWidth:"280px",lineHeight:1.6,margin:0}}>${safeSubtitle}</p>
    </div>
  );
}`;
}

/** @deprecated Use buildSandpackPlaceholder with i18n strings */
export const SANDPACK_PLACEHOLDER = buildSandpackPlaceholder(
  "חלון תצוגה מקדימה",
  "תארו את הממשק שאתם רוצים בצ׳אט — הוא יופיע כאן מיידית",
);
