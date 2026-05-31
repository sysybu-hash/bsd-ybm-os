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
