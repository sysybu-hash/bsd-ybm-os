import type { AppBuilderField, AppBuilderUiSchema } from "@/lib/validation/schemas/app-builder";

/** שדות טופס מתוך form/table/full_app/composer (בלוק form ראשון) */
export function getFormFieldsFromUiSchema(schema: AppBuilderUiSchema): AppBuilderField[] | null {
  if (schema.type === "form" || schema.type === "table" || schema.type === "full_app") {
    return schema.fields;
  }
  if (schema.type === "composer") {
    const formBlock = schema.blocks.find((block) => block.kind === "form");
    return formBlock?.kind === "form" ? formBlock.fields : null;
  }
  return null;
}

export function composerHasFormBlock(schema: AppBuilderUiSchema): boolean {
  return schema.type === "composer" && schema.blocks.some((block) => block.kind === "form");
}
