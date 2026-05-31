import type { AppBuilderField } from "@/lib/validation/schemas/app-builder";
import { getFormFieldsFromUiSchema } from "@/lib/app-builder/form-fields";
import { parseAndSanitizeUiSchema } from "@/lib/app-builder/sanitize-ui-schema";

export type CoerceFormDataResult =
  | { ok: true; payload: Record<string, string | number | boolean | null> }
  | { ok: false; error: string };

function coerceFieldValue(
  field: AppBuilderField,
  raw: unknown,
): string | number | boolean | null {
  if (field.type === "checkbox") {
    if (raw === true || raw === "true" || raw === "on" || raw === "1") return true;
    if (raw === false || raw === "false" || raw === "off" || raw === "0") return false;
    return raw === undefined || raw === null || raw === "" ? false : true;
  }

  if (raw === undefined || raw === null) {
    return field.required ? null : null;
  }

  const str = typeof raw === "string" ? raw.trim() : String(raw);

  if (field.type === "number") {
    if (!str) return field.required ? null : null;
    const num = Number(str);
    return Number.isFinite(num) ? num : null;
  }

  if (field.type === "date") {
    if (!str) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
    return str;
  }

  if (field.type === "select" && field.options) {
    if (!str) return null;
    return field.options.includes(str) ? str : null;
  }

  return str.slice(0, 2000);
}

export function buildPayloadFromFormData(
  formData: Record<string, unknown>,
  uiSchemaRaw: unknown,
): CoerceFormDataResult {
  const sanitized = parseAndSanitizeUiSchema(uiSchemaRaw);
  if (!sanitized.ok) {
    return { ok: false, error: sanitized.error };
  }

  const schema = sanitized.schema;
  const fields = getFormFieldsFromUiSchema(schema);
  if (!fields?.length) {
    return { ok: false, error: "dashboard_not_form" };
  }

  const payload: Record<string, string | number | boolean | null> = {};

  for (const field of fields) {
    if (!(field.name in formData)) {
      if (field.required && field.type !== "checkbox") {
        return { ok: false, error: `missing_required_field:${field.name}` };
      }
      if (field.type === "checkbox") {
        payload[field.name] = false;
      }
      continue;
    }

    const value = coerceFieldValue(field, formData[field.name]);
    if (value === null && field.required && field.type !== "checkbox") {
      return { ok: false, error: `invalid_field:${field.name}` };
    }
    payload[field.name] = value;
  }

  for (const key of Object.keys(formData)) {
    if (!fields.some((f) => f.name === key)) {
      return { ok: false, error: `unexpected_field:${key}` };
    }
  }

  return { ok: true, payload };
}
