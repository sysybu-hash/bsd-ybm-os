import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  jsonBadRequest,
  jsonServerError,
  jsonServiceUnavailable,
  jsonUnauthorized,
} from "@/lib/api-json";
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

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonUnauthorized();
    }

    if (!isGeminiConfigured()) {
      return jsonServiceUnavailable(
        "Gemini לא מוגדר. הגדירו GOOGLE_GENERATIVE_AI_API_KEY או GEMINI_API_KEY.",
        "gemini_not_configured",
      );
    }

    const orgId = session.user.organizationId ?? "";
    const rateKey = orgId
      ? `erp-notebook:org:${orgId}`
      : `erp-notebook:user:${session.user.id}`;
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

    const body = (await req.json()) as {
      messages?: NotebookChatMessage[];
      pdfs?: Array<{ fileName?: string; base64?: string; mimeType?: string }>;
      sources?: Array<{ fileName?: string; base64?: string; mimeType?: string; text?: string }>;
    };

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const rawSources: RawNotebookSource[] = Array.isArray(body.sources)
      ? body.sources
      : Array.isArray(body.pdfs)
        ? body.pdfs
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
        (message) =>
          message &&
          (message.role === "user" || message.role === "model") &&
          typeof message.content === "string",
      )
      .map((message) => ({
        role: message.role,
        content: message.content.slice(0, 120_000),
      }));

    if (!normalizedMessages.length) {
      return jsonBadRequest("חסרות הודעות (messages).", "missing_messages");
    }

    const boqContext =
      orgId ? await loadRecentBillOfQuantitiesContext(orgId) : null;

    const { text, model } = await runErpProjectNotebookChat({
      messages: normalizedMessages,
      sources,
      billOfQuantitiesContext: boqContext,
    });

    return NextResponse.json({ answer: text, model });
  } catch (error) {
    console.error("project-notebook chat:", error);
    const msg = error instanceof Error ? error.message : "Notebook chat failed.";
    return jsonServerError(msg.slice(0, 500));
  }
}
