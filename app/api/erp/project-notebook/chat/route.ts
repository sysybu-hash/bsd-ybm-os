import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import {
  jsonBadRequest,
  jsonServiceUnavailable,
} from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  runErpProjectNotebookChat,
  type NotebookChatMessage,
  type NotebookSourcePart,
} from "@/lib/erp-project-notebook";
import { loadRecentBillOfQuantitiesContext } from "@/lib/load-recent-bill-of-quantities-context";

const MAX_SOURCES = 8;
const MAX_RAW_BYTES_PER_FILE = 6 * 1024 * 1024;
const MAX_TOTAL_RAW_BYTES = 18 * 1024 * 1024;
const REQUESTS_PER_HOUR = 40;

const ALLOWED_SOURCE_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
]);

type RawNotebookSource = {
  fileName?: string;
  base64?: string;
  mimeType?: string;
  text?: string;
};

function estimateRawBytesFromBase64(b64: string): number {
  const len = b64.length;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

const notebookChatBodySchema = z.object({
  messages: z.array(z.unknown()).optional(),
  pdfs: z.array(z.unknown()).optional(),
  sources: z.array(z.unknown()).optional(),
});

export const POST = withWorkspacesAuth(
  async (_req, { userId, orgId }, data) => {
    try {
      if (!isGeminiConfigured()) {
        return jsonServiceUnavailable(
          "Gemini לא מוגדר. הגדירו GOOGLE_GENERATIVE_AI_API_KEY או GEMINI_API_KEY.",
          "gemini_not_configured",
        );
      }

      const rateKey = orgId ? `erp-notebook:org:${orgId}` : `erp-notebook:user:${userId}`;
      const rl = await checkRateLimit(rateKey, REQUESTS_PER_HOUR, 60 * 60 * 1000);
      if (!rl.success) {
        return NextResponse.json(
          {
            error: `Rate limit exceeded. Try again after ${rl.resetAt.toISOString()}.`,
            resetAt: rl.resetAt,
          },
          { status: 429 },
        );
      }

      const messages = Array.isArray(data.messages) ? data.messages : [];
      const rawSources: RawNotebookSource[] = Array.isArray(data.sources)
        ? (data.sources as RawNotebookSource[])
        : Array.isArray(data.pdfs)
          ? (data.pdfs as RawNotebookSource[])
          : [];

      if (rawSources.length > MAX_SOURCES) {
        return jsonBadRequest(`ניתן לצרף עד ${MAX_SOURCES} מקורות למחברת.`, "too_many_sources");
      }

      let totalRaw = 0;
      const sources: NotebookSourcePart[] = [];
      for (const source of rawSources) {
        const fileName = (source.fileName ?? "source").trim() || "source";
        const base64 = source.base64?.trim();
        const text = source.text?.trim();
        const mimeType = (source.mimeType ?? (text ? "text/plain" : "application/pdf")).trim();

        if (!base64 && !text) continue;
        if (!ALLOWED_SOURCE_MIME_TYPES.has(mimeType)) {
          return jsonBadRequest(`סוג מקור לא נתמך: ${mimeType}`, "invalid_mime");
        }

        if (base64) {
          const rawSize = estimateRawBytesFromBase64(base64);
          if (rawSize > MAX_RAW_BYTES_PER_FILE) {
            return jsonBadRequest(
              `המקור "${fileName}" חורג ממגבלת ${MAX_RAW_BYTES_PER_FILE / 1024 / 1024}MB.`,
              "file_too_large",
            );
          }
          totalRaw += rawSize;
        }

        sources.push({
          fileName,
          base64: base64 ?? "",
          mimeType,
          text: text?.slice(0, 120_000),
        });
      }

      if (totalRaw > MAX_TOTAL_RAW_BYTES) {
        return jsonBadRequest(
          `סך גודל המקורות חורג מ-${MAX_TOTAL_RAW_BYTES / 1024 / 1024}MB. הסירו או דחסו קבצים.`,
          "total_size_exceeded",
        );
      }

      const normalizedMessages: NotebookChatMessage[] = messages
        .filter(
          (message): message is NotebookChatMessage =>
            Boolean(message) &&
            typeof message === "object" &&
            (message as NotebookChatMessage).role !== undefined &&
            ((message as NotebookChatMessage).role === "user" ||
              (message as NotebookChatMessage).role === "model") &&
            typeof (message as NotebookChatMessage).content === "string",
        )
        .map((message) => ({
          role: message.role,
          content: message.content.slice(0, 120_000),
        }));

      if (!normalizedMessages.length) {
        return jsonBadRequest("חסרות הודעות (messages).", "missing_messages");
      }

      const boqContext = orgId ? await loadRecentBillOfQuantitiesContext(orgId) : null;

      const { text, model } = await runErpProjectNotebookChat({
        messages: normalizedMessages,
        sources,
        billOfQuantitiesContext: boqContext,
      });

      return NextResponse.json({ answer: text, model });
    } catch (error) {
      return apiErrorResponse(error, "project-notebook chat");
    }
  },
  { schema: notebookChatBodySchema },
);
