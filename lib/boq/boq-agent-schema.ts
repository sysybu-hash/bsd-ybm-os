import { z } from "zod";

export const boqAgentSuggestionSchema = z.object({
  action: z.enum(["add", "update", "note"]),
  lineId: z.string().optional(),
  description: z.string().min(1),
  unit: z.string().optional(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  rationale: z.string().optional(),
});

export const boqAgentResponseSchema = z.object({
  summary: z.string(),
  suggestions: z.array(boqAgentSuggestionSchema).default([]),
});

export type BoqAgentSuggestion = z.infer<typeof boqAgentSuggestionSchema>;
export type BoqAgentResponse = z.infer<typeof boqAgentResponseSchema>;
