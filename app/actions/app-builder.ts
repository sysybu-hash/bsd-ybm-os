"use server";

import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildPayloadFromFormData } from "@/lib/app-builder/coerce-form-data";
import { parseAndSanitizeUiSchema } from "@/lib/app-builder/sanitize-ui-schema";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  appBuilderUiSchema,
  deleteAppSchemaInputSchema,
  saveAppDataInputSchema,
  saveAppSchemaInputSchema,
  updateAppSchemaInputSchema,
  type AppBuilderUiSchema,
} from "@/lib/validation/schemas/app-builder";

export type AppSchemaListItem = {
  id: string;
  name: string;
  description: string | null;
  appType: "form" | "table" | "full_app" | "checklist" | "calculator" | "kanban" | "calendar" | "dashboard" | "composer" | "unknown";
  isGlobal: boolean;
  createdAt: Date;
};

const log = createLogger("app-builder-actions");

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function getOrgContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: "נדרשת התחברות" as const };
  }
  const orgId = session.user.organizationId ?? null;
  if (!orgId) {
    return { error: "אין ארגון משויך. עבור להגדרות או התחבר מחדש." as const };
  }
  return { orgId, userId: session.user.id };
}

function schemaAccessFilter(orgId: string) {
  return {
    OR: [{ organizationId: orgId }, { isGlobal: true }],
  };
}

function orgOwnedSchemaFilter(orgId: string) {
  return {
    organizationId: orgId,
    isGlobal: false,
  };
}

export async function listAppSchemasAction() {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const rows = await prisma.customAppSchema.findMany({
    where: schemaAccessFilter(ctx.orgId),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      uiSchema: true,
      isGlobal: true,
      createdAt: true,
    },
    take: 50,
  });

  const schemas: AppSchemaListItem[] = rows.map((row) => {
    const parsed = appBuilderUiSchema.safeParse(row.uiSchema);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      appType: parsed.success ? parsed.data.type : "unknown",
      isGlobal: row.isGlobal,
      createdAt: row.createdAt,
    };
  });

  return { ok: true as const, schemas };
}

export async function loadAppSchemaAction(schemaId: string) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const id = schemaId.trim();
  if (!id) {
    return { ok: false as const, error: "invalid_schema_id" };
  }

  const row = await prisma.customAppSchema.findFirst({
    where: {
      id,
      ...schemaAccessFilter(ctx.orgId),
    },
    select: {
      id: true,
      name: true,
      description: true,
      uiSchema: true,
      isGlobal: true,
    },
  });

  if (!row) {
    return { ok: false as const, error: "schema_not_found" };
  }

  const sanitized = parseAndSanitizeUiSchema(row.uiSchema);
  if (!sanitized.ok) {
    return { ok: false as const, error: sanitized.error };
  }

  return {
    ok: true as const,
    schema: {
      id: row.id,
      name: row.name,
      description: row.description,
      isGlobal: row.isGlobal,
      uiSchema: sanitized.schema,
    },
  };
}

export async function saveAppSchemaAction(input: {
  name: string;
  description?: string;
  uiSchema: AppBuilderUiSchema;
}) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const parsed = saveAppSchemaInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "נתוני הסכמה אינם תקינים" };
  }

  const sanitized = parseAndSanitizeUiSchema(parsed.data.uiSchema);
  if (!sanitized.ok) {
    return { ok: false as const, error: sanitized.error };
  }

  try {
    const row = await prisma.customAppSchema.create({
      data: {
        organizationId: ctx.orgId,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        uiSchema: toPrismaJson(sanitized.schema),
        isGlobal: false,
      },
      select: { id: true },
    });

    return { ok: true as const, id: row.id };
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") {
      log.error("schema_table_missing", { orgId: ctx.orgId });
      return {
        ok: false as const,
        error: "טבלאות מחולל האפליקציות לא קיימות בבסיס הנתונים. הרץ migrate deploy.",
      };
    }
    log.error("save_schema_failed", {
      orgId: ctx.orgId,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false as const, error: "שמירת האפליקציה נכשלה" };
  }
}

export async function updateAppSchemaAction(input: {
  schemaId: string;
  name: string;
  description?: string;
  uiSchema: AppBuilderUiSchema;
}) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const parsed = updateAppSchemaInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "נתוני הסכמה אינם תקינים" };
  }

  const sanitized = parseAndSanitizeUiSchema(parsed.data.uiSchema);
  if (!sanitized.ok) {
    return { ok: false as const, error: sanitized.error };
  }

  const existing = await prisma.customAppSchema.findFirst({
    where: {
      id: parsed.data.schemaId,
      ...orgOwnedSchemaFilter(ctx.orgId),
    },
    select: { id: true },
  });

  if (!existing) {
    return { ok: false as const, error: "schema_not_found_or_readonly" };
  }

  try {
    await prisma.customAppSchema.update({
      where: { id: existing.id },
      data: {
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        uiSchema: toPrismaJson(sanitized.schema),
      },
    });
    return { ok: true as const, id: existing.id };
  } catch (err: unknown) {
    log.error("update_schema_failed", {
      orgId: ctx.orgId,
      schemaId: parsed.data.schemaId,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false as const, error: "עדכון האפליקציה נכשל" };
  }
}

export async function deleteAppSchemaAction(schemaId: string) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const parsed = deleteAppSchemaInputSchema.safeParse({ schemaId });
  if (!parsed.success) {
    return { ok: false as const, error: "invalid_schema_id" };
  }

  const existing = await prisma.customAppSchema.findFirst({
    where: {
      id: parsed.data.schemaId,
      ...orgOwnedSchemaFilter(ctx.orgId),
    },
    select: { id: true },
  });

  if (!existing) {
    return { ok: false as const, error: "schema_not_found_or_readonly" };
  }

  try {
    await prisma.customAppSchema.delete({ where: { id: existing.id } });
    return { ok: true as const };
  } catch (err: unknown) {
    log.error("delete_schema_failed", {
      orgId: ctx.orgId,
      schemaId: parsed.data.schemaId,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false as const, error: "מחיקת האפליקציה נכשלה" };
  }
}

export async function saveAppDataAction(input: {
  schemaId: string;
  formData: Record<string, unknown>;
}) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const parsed = saveAppDataInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "נתוני הטופס אינם תקינים" };
  }

  const schemaRow = await prisma.customAppSchema.findFirst({
    where: {
      id: parsed.data.schemaId,
      ...schemaAccessFilter(ctx.orgId),
    },
    select: { id: true, uiSchema: true },
  });

  if (!schemaRow) {
    return { ok: false as const, error: "סכמה לא נמצאה" };
  }

  const payloadResult = buildPayloadFromFormData(parsed.data.formData, schemaRow.uiSchema);
  if (!payloadResult.ok) {
    return { ok: false as const, error: payloadResult.error };
  }

  const row = await prisma.customAppData.create({
    data: {
      organizationId: ctx.orgId,
      schemaId: schemaRow.id,
      data: toPrismaJson(payloadResult.payload),
    },
    select: { id: true },
  });

  return { ok: true as const, id: row.id };
}

/**
 * Moves a kanban card to another column by updating the `_columnId` marker
 * stored inside the row's data JSON. Used by DynamicKanbanRenderer drag/move.
 */
export async function updateAppDataColumnAction(input: {
  schemaId: string;
  dataId: string;
  columnId: string;
}) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  if (!input.dataId || !input.columnId) {
    return { ok: false as const, error: "נתונים חסרים" };
  }

  // Verify the schema is accessible to this org.
  const schemaRow = await prisma.customAppSchema.findFirst({
    where: { id: input.schemaId, ...schemaAccessFilter(ctx.orgId) },
    select: { id: true },
  });
  if (!schemaRow) {
    return { ok: false as const, error: "סכמה לא נמצאה" };
  }

  // Load the org-owned data row.
  const dataRow = await prisma.customAppData.findFirst({
    where: { id: input.dataId, organizationId: ctx.orgId, schemaId: schemaRow.id },
    select: { id: true, data: true },
  });
  if (!dataRow) {
    return { ok: false as const, error: "כרטיסייה לא נמצאה" };
  }

  const existing =
    dataRow.data && typeof dataRow.data === "object" && !Array.isArray(dataRow.data)
      ? (dataRow.data as Record<string, unknown>)
      : {};

  await prisma.customAppData.update({
    where: { id: dataRow.id },
    data: { data: toPrismaJson({ ...existing, _columnId: input.columnId }) },
  });

  return { ok: true as const };
}

export async function listAppDataAction(schemaId: string) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const schemaRow = await prisma.customAppSchema.findFirst({
    where: {
      id: schemaId,
      ...schemaAccessFilter(ctx.orgId),
    },
    select: { id: true, uiSchema: true },
  });

  if (!schemaRow) {
    return { ok: false as const, error: "סכמה לא נמצאה" };
  }

  const rows = await prisma.customAppData.findMany({
    where: {
      organizationId: ctx.orgId,
      schemaId: schemaRow.id,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      data: true,
      createdAt: true,
    },
    take: 100,
  });

  return { ok: true as const, rows, uiSchema: schemaRow.uiSchema };
}
