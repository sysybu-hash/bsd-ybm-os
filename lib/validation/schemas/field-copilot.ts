import { z } from "zod";
import { SCAN_SCHEMA_V5 } from "@/lib/scan-schema-v5";

export const fieldCopilotSessionStatusSchema = z.enum([
  "DRAFT",
  "ANALYZING",
  "READY",
  "HANDED_OFF",
  "ARCHIVED",
]);

export const fieldCopilotCaptureSchema = z.object({
  transcript: z.string().optional(),
  photoAssetIds: z.array(z.string()).default([]),
  videoAssetId: z.string().optional(),
  userNotes: z.string().optional(),
});

export const fieldCopilotLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().optional(),
  unitPrice: z.number().nullable().optional(),
  lineTotal: z.number().optional(),
  unit: z.string().optional(),
});

export const fieldCopilotDraftSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string(),
  contactId: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
  constructionTrade: z.string().nullable().optional(),
  capture: fieldCopilotCaptureSchema,
  analysis: z.record(z.string(), z.unknown()).nullable().optional(),
  scopeSummary: z.string().nullable().optional(),
  assumptions: z.array(z.string()).default([]),
  status: fieldCopilotSessionStatusSchema,
});

export const createFieldCopilotSessionSchema = z.object({
  contactId: z.string().optional(),
  contactName: z.string().optional(),
  projectId: z.string().optional(),
  projectName: z.string().optional(),
  constructionTrade: z.string().optional(),
});

export const patchFieldCopilotSessionSchema = z.object({
  sessionId: z.string(),
  contactId: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
  constructionTrade: z.string().nullable().optional(),
  transcript: z.string().nullable().optional(),
  userNotes: z.string().nullable().optional(),
  videoAssetId: z.string().nullable().optional(),
  photoAssetIds: z.array(z.string()).optional(),
  analysis: z.record(z.string(), z.unknown()).nullable().optional(),
  scopeSummary: z.string().nullable().optional(),
  assumptions: z.array(z.string()).optional(),
  status: fieldCopilotSessionStatusSchema.optional(),
});

export const fieldCopilotAssetUploadSchema = z.object({
  sessionId: z.string(),
  mimeType: z.string().min(3),
  kind: z.enum(["photo", "video", "keyframe"]),
  dataBase64: z.string().min(32).max(12_000_000),
});

export const fieldCopilotAnalyzeSchema = z.object({
  sessionId: z.string(),
  locale: z.string().optional(),
});

export const fieldCopilotHandoffSchema = z.object({
  sessionId: z.string(),
  target: z.enum(["QUOTE", "BOQ", "ORDER_AGREEMENT"]),
});

export type FieldCopilotSessionStatus = z.infer<typeof fieldCopilotSessionStatusSchema>;
export type FieldCopilotDraft = z.infer<typeof fieldCopilotDraftSchema>;

export const FIELD_COPILOT_SCHEMA_VERSION = SCAN_SCHEMA_V5;
