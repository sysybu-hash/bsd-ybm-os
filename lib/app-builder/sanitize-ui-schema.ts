import {
  appBuilderUiSchema,
  type AppBuilderComposerUI,
  type AppBuilderDashboardUI,
  type AppBuilderUiSchema,
  type UIComponent,
} from "@/lib/validation/schemas/app-builder";
import { chartRequiresDataConfig } from "@/lib/app-builder/dashboard-allowlists";
import { normalizeAutomationIntent } from "@/lib/os-automations/catalog";

const DANGEROUS_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /onerror\s*=/i,
  /onclick\s*=/i,
  /\/admin/i,
  /\/api\/admin/i,
  /data:text\/html/i,
  /<iframe/i,
  /__proto__/i,
  /constructor/i,
];

function containsDangerousText(value: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(value));
}

function validateFormTableContent(
  schema: Extract<AppBuilderUiSchema, { type: "form" | "table" | "full_app" }>,
): string | null {
  if (schema.title && containsDangerousText(schema.title)) {
    return "title_contains_forbidden_content";
  }

  for (const field of schema.fields) {
    if (containsDangerousText(field.name) || containsDangerousText(field.label)) {
      return "field_contains_forbidden_content";
    }
    if (field.type === "select" && field.options) {
      for (const opt of field.options) {
        if (containsDangerousText(opt)) {
          return "option_contains_forbidden_content";
        }
      }
    }
    if (field.type === "select" && (!field.options || field.options.length === 0)) {
      return "select_requires_options";
    }
  }

  const names = schema.fields.map((f) => f.name);
  if (new Set(names).size !== names.length) {
    return "duplicate_field_names";
  }

  return null;
}

function validateDashboardContent(schema: AppBuilderDashboardUI): string | null {
  if (containsDangerousText(schema.title)) {
    return "title_contains_forbidden_content";
  }
  if (schema.description && containsDangerousText(schema.description)) {
    return "description_contains_forbidden_content";
  }

  const ids = schema.components.map((c) => c.id);
  if (new Set(ids).size !== ids.length) {
    return "duplicate_component_ids";
  }

  for (const comp of schema.components) {
    if (containsDangerousText(comp.title)) {
      return "component_contains_forbidden_content";
    }
    if (comp.label && containsDangerousText(comp.label)) {
      return "component_contains_forbidden_content";
    }
    if (chartRequiresDataConfig(comp.type) && !comp.dataConfig) {
      return "chart_requires_data_config";
    }
  }

  return null;
}

function validateComposerContent(schema: AppBuilderComposerUI): string | null {
  if (containsDangerousText(schema.title)) {
    return "title_contains_forbidden_content";
  }
  if (schema.description && containsDangerousText(schema.description)) {
    return "description_contains_forbidden_content";
  }

  const blockIds = schema.blocks.map((b) => b.id);
  if (new Set(blockIds).size !== blockIds.length) {
    return "duplicate_block_ids";
  }

  const formBlocks = schema.blocks.filter((b) => b.kind === "form");
  if (formBlocks.length > 1) {
    return "composer_single_form_block";
  }

  for (const block of schema.blocks) {
    if (block.title && containsDangerousText(block.title)) {
      return "block_contains_forbidden_content";
    }

    if (block.kind === "text" && containsDangerousText(block.body)) {
      return "block_contains_forbidden_content";
    }

    if (block.kind === "dashboard") {
      const ids = block.components.map((c) => c.id);
      if (new Set(ids).size !== ids.length) {
        return "duplicate_component_ids";
      }
      for (const comp of block.components) {
        if (containsDangerousText(comp.title)) {
          return "component_contains_forbidden_content";
        }
        if (chartRequiresDataConfig(comp.type) && !comp.dataConfig) {
          return "chart_requires_data_config";
        }
      }
    }

    if (block.kind === "form") {
      const err = validateFormTableContent({
        type: "form",
        title: block.title,
        fields: block.fields,
      });
      if (err) return err;
    }

    if (block.kind === "actions") {
      const actionIds = block.actions.map((a) => a.id);
      if (new Set(actionIds).size !== actionIds.length) {
        return "duplicate_action_ids";
      }
      for (const action of block.actions) {
        if (containsDangerousText(action.label)) {
          return "action_contains_forbidden_content";
        }
        if (!normalizeAutomationIntent(action.intent)) {
          return "invalid_action_intent";
        }
      }
    }
  }

  return null;
}

export type SanitizeUiSchemaResult =
  | { ok: true; schema: AppBuilderUiSchema }
  | { ok: false; error: string };

export function parseAndSanitizeUiSchema(raw: unknown): SanitizeUiSchemaResult {
  const parsed = appBuilderUiSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first?.message ?? "invalid_ui_schema",
    };
  }

  if (parsed.data.type === "dashboard") {
    const contentError = validateDashboardContent(parsed.data);
    if (contentError) {
      return { ok: false, error: contentError };
    }
    return { ok: true, schema: parsed.data };
  }

  if (parsed.data.type === "composer") {
    const contentError = validateComposerContent(parsed.data);
    if (contentError) {
      return { ok: false, error: contentError };
    }
    return { ok: true, schema: parsed.data };
  }

  if (parsed.data.type === "full_app") {
    const contentError = validateFormTableContent(parsed.data);
    if (contentError) {
      return { ok: false, error: contentError };
    }
    return { ok: true, schema: parsed.data };
  }

  // these types pass through — their items/inputs/columns are already validated by Zod
  if (
    parsed.data.type === "checklist" ||
    parsed.data.type === "calculator" ||
    parsed.data.type === "kanban" ||
    parsed.data.type === "calendar"
  ) {
    return { ok: true, schema: parsed.data };
  }

  const contentError = validateFormTableContent(parsed.data);
  if (contentError) {
    return { ok: false, error: contentError };
  }

  return { ok: true, schema: parsed.data };
}

export function extractJsonFromModelText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function isDashboardSchema(schema: AppBuilderUiSchema): schema is AppBuilderDashboardUI {
  return schema.type === "dashboard";
}

export function isComposerSchema(schema: AppBuilderUiSchema): schema is AppBuilderComposerUI {
  return schema.type === "composer";
}

export type { UIComponent };
