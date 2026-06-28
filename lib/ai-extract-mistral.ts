/**
 * Mistral / Pixtral document extraction
 * API דומה ל-OpenAI Chat Completions — תואם לחלוטין.
 * Pixtral Large: vision מצוין לגרמושקות, חשבוניות סרוקות, כתב יד, עברית.
 */
import { parseModelJsonText } from "@/lib/ai-document-json";
import { env } from "@/lib/env";
import {
  getMistralVisionModelCandidates,
  getMistralModel,
  isMistralEligibleForModelFallback,
} from "@/lib/ai-providers";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";

const MISTRAL_API_BASE = "https://api.mistral.ai/v1";

function getMistralKey(): string {
  const key = env.MISTRAL_API_KEY?.trim();
  if (!key) throw new Error("חסר MISTRAL_API_KEY");
  return key;
}

/** סריקת מסמך — תמונה או PDF (base64) */
export async function extractDocumentWithMistral(
  base64: string,
  mimeType: string,
  fileName: string,
  documentInstruction: string,
  _scanMode: ScanModeV5 = "GENERAL_DOCUMENT",
  modelId?: string,
): Promise<Record<string, unknown>> {
  const key = getMistralKey();
  const models = getMistralVisionModelCandidates(modelId);
  let lastErr: Error | null = null;

  for (const model of models) {
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const res = await fetch(`${MISTRAL_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: dataUrl },
              },
              {
                type: "text",
                text: `${documentInstruction}\nFile: ${fileName}\nReturn a single JSON object only, no markdown.`,
              },
            ],
          },
        ],
      }),
    });

    const raw = await res.text().catch(() => res.statusText);
    if (!res.ok) {
      lastErr = new Error(`Mistral: ${res.status} ${raw.slice(0, 400)}`);
      if (isMistralEligibleForModelFallback(res.status, raw)) continue;
      throw lastErr;
    }

    const data = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("Mistral לא החזיר תוכן");
    return parseModelJsonText(text);
  }

  throw lastErr ?? new Error("Mistral: כל מודלי ה-vision נכשלו");
}

/**
 * Mistral OCR 4 — מודל OCR ייעודי עם תמיכה מלאה בעברית (170+ שפות).
 * מחזיר טקסט markdown נקי מכל עמוד בנפרד, ואז מאוחד לטקסט אחד.
 * מיועד כ-pre-pass לפני ניתוח LLM — משפר דיוק בחילוץ כמויות מגרמושקות.
 */
export async function extractTextWithMistralOCR(
  base64: string,
  mimeType: string,
): Promise<string> {
  const key = getMistralKey();

  const documentPayload =
    mimeType === "application/pdf"
      ? { type: "document_url", document_url: `data:application/pdf;base64,${base64}` }
      : { type: "image_url", image_url: `data:${mimeType};base64,${base64}` };

  const res = await fetch(`${MISTRAL_API_BASE}/ocr`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: documentPayload,
      include_image_base64: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`Mistral OCR: ${res.status} ${(await res.text()).slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    pages?: Array<{ index: number; markdown?: string }>;
    text?: string;
  };

  if (typeof data.text === "string" && data.text.trim()) return data.text;

  if (Array.isArray(data.pages) && data.pages.length > 0) {
    return data.pages
      .sort((a, b) => a.index - b.index)
      .map((p, idx) => `\n\n--- עמוד ${idx + 1} ---\n\n${p.markdown ?? ""}`)
      .join("")
      .trim();
  }

  throw new Error("Mistral OCR לא החזיר תוכן");
}

/** צ'אט טקסט (ללא vision) — לשימוש ב-ai-chat.ts */
export async function runMistralTextChat(prompt: string): Promise<string> {
  const key = getMistralKey();
  const model = getMistralModel();

  const res = await fetch(`${MISTRAL_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Mistral chat: ${res.status} ${(await res.text()).slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}
