import { z } from "zod";

export const appBuilderFieldTypeSchema = z.enum([
  "text",
  "number",
  "date",
  "select",
  "textarea",
  "checkbox",
]);

export const appBuilderFieldSchema = z
  .object({
    name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/),
    label: z.string().min(1).max(120),
    type: appBuilderFieldTypeSchema,
    required: z.boolean().optional(),
    options: z.array(z.string().min(1).max(80)).max(20).optional(),
  })
  .strict();

export const dataConfigSchema = z
  .object({
    targetTable: z.enum(["CustomAppData", "projects", "expenses", "contacts", "tasks", "issuedDocuments"]),
    aggregation: z.enum(["sum", "count", "avg", "raw"]),
    groupBy: z.string().max(40).optional(),
    valueField: z.string().max(40).optional(),
    schemaId: z.string().max(64).optional(),
  })
  .strict();

export const uiComponentSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/),
    type: z.enum(["bar_chart", "line_chart", "pie_chart", "metric_card", "form_field"]),
    title: z.string().min(1).max(120),
    dataConfig: dataConfigSchema.optional(),
    name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/).optional(),
    label: z.string().max(120).optional(),
    inputType: z.string().max(40).optional(),
  })
  .strict();

export const appBuilderFormTableSchema = z
  .object({
    type: z.enum(["form", "table"]),
    title: z.string().max(120).optional(),
    fields: z.array(appBuilderFieldSchema).min(1).max(30),
  })
  .strict();

export const appBuilderDashboardSchema = z
  .object({
    type: z.literal("dashboard"),
    title: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    components: z.array(uiComponentSchema).min(1).max(12),
  })
  .strict();

export const composerActionSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/),
    label: z.string().min(1).max(80),
    intent: z.string().min(1).max(80),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const composerBlockIdSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/);

export const composerDashboardBlockSchema = z
  .object({
    id: composerBlockIdSchema,
    kind: z.literal("dashboard"),
    title: z.string().max(120).optional(),
    components: z.array(uiComponentSchema).min(1).max(8),
  })
  .strict();

export const composerFormBlockSchema = z
  .object({
    id: composerBlockIdSchema,
    kind: z.literal("form"),
    title: z.string().max(120).optional(),
    fields: z.array(appBuilderFieldSchema).min(1).max(20),
  })
  .strict();

export const composerActionsBlockSchema = z
  .object({
    id: composerBlockIdSchema,
    kind: z.literal("actions"),
    title: z.string().max(120).optional(),
    actions: z.array(composerActionSchema).min(1).max(8),
  })
  .strict();

export const composerTextBlockSchema = z
  .object({
    id: composerBlockIdSchema,
    kind: z.literal("text"),
    title: z.string().max(120).optional(),
    body: z.string().min(1).max(2000),
  })
  .strict();

export const composerBlockSchema = z.discriminatedUnion("kind", [
  composerDashboardBlockSchema,
  composerFormBlockSchema,
  composerActionsBlockSchema,
  composerTextBlockSchema,
]);

export const appBuilderComposerSchema = z
  .object({
    type: z.literal("composer"),
    title: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    blocks: z.array(composerBlockSchema).min(1).max(8),
  })
  .strict();

export const appBuilderUiSchema = z.discriminatedUnion("type", [
  appBuilderFormTableSchema.extend({ type: z.literal("form") }),
  appBuilderFormTableSchema.extend({ type: z.literal("table") }),
  appBuilderDashboardSchema,
  appBuilderComposerSchema,
]);

export const saveAppSchemaInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  uiSchema: appBuilderUiSchema,
});

export const updateAppSchemaInputSchema = saveAppSchemaInputSchema.extend({
  schemaId: z.string().min(1).max(64),
});

export const deleteAppSchemaInputSchema = z.object({
  schemaId: z.string().min(1).max(64),
});

export const saveAppDataInputSchema = z.object({
  schemaId: z.string().min(1),
  formData: z.record(z.string(), z.unknown()),
});

export type DataConfig = z.infer<typeof dataConfigSchema>;
export type UIComponent = z.infer<typeof uiComponentSchema>;
export type AppBuilderDashboardUI = z.infer<typeof appBuilderDashboardSchema>;
export type AppBuilderComposerUI = z.infer<typeof appBuilderComposerSchema>;
export type ComposerBlock = z.infer<typeof composerBlockSchema>;
export type ComposerAction = z.infer<typeof composerActionSchema>;
export type AppBuilderFieldType = z.infer<typeof appBuilderFieldTypeSchema>;
export type AppBuilderField = z.infer<typeof appBuilderFieldSchema>;
export type AppBuilderUiSchema = z.infer<typeof appBuilderUiSchema>;

/** @deprecated alias for dashboard UI */
export type AppBuilderUI = AppBuilderUiSchema;
