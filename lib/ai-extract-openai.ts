import { parseModelJsonText } from "@/lib/ai-document-json";
import {
  getOpenAiChatVisionModelCandidates,
  getOpenAiResponsesModelCandidates,
  isOpenAiEligibleForModelFallback,
} from "@/lib/ai-providers";

function extractTextFromOpenAiResponsesPayload(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  if (typeof d.output_text === "string" && d.output_text.trim()) {
    return d.output_text;
  }
  const output = d.output;
  if (!Array.isArray(output)) return "";
  for (const block of output) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const content = b.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const p = part as Record<string, unknown>;
        if (typeof p.text === "string" && p.text.trim()) return p.text;
      }
    }
    if (typeof b.text === "string" && b.text.trim()) return b.text;
  }
  return "";
}

async function extractDocumentWithOpenAIPdf(
  base64: string,
  fileName: string,
  documentInstruction: string,
  key: string,
  modelOverride?: string,
): Promise<Record<string, unknown>> {
  const safeName = fileName?.trim() || "document.pdf";
  const models = getOpenAiResponsesModelCandidates(modelOverride);
  let lastErr: Error | null = null;

  for (const model of models) {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                filename: safeName.endsWith(".pdf") ? safeName : `${safeName}.pdf`,
                file_data: `data:application/pdf;base64,${base64}`,
              },
              {
                type: "input_text",
                text: `${documentInstruction}\nFile name: ${safeName}\nReturn a single JSON object only, no markdown.`,
              },
            ],
          },
        ],
      }),
    });

    const raw = await res.text().catch(() => res.statusText);
    if (!res.ok) {
      lastErr = new Error(`OpenAI: ${res.status} ${raw.slice(0, 400)}`);
      if (isOpenAiEligibleForModelFallback(res.status, raw)) continue;
      throw lastErr;
    }

    const data = JSON.parse(raw) as unknown;
    const text = extractTextFromOpenAiResponsesPayload(data);
    if (!text) throw new Error("OpenAI לא החזיר טקסט (PDF)");
    return parseModelJsonText(text);
  }

  throw lastErr ?? new Error("OpenAI: כל מודלי ה-PDF נכשלו");
}

export async function extractDocumentWithOpenAI(
  base64: string,
  mimeType: string,
  fileName: string,
  documentInstruction: string,
  modelId?: string,
): Promise<Record<string, unknown>> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("חסר OPENAI_API_KEY");

  if (mimeType === "application/pdf") {
    return extractDocumentWithOpenAIPdf(base64, fileName, documentInstruction, key, modelId);
  }

  const models = getOpenAiChatVisionModelCandidates(modelId);
  const dataUrl = `data:${mimeType};base64,${base64}`;
  let lastErr: Error | null = null;

  for (const model of models) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${documentInstruction}\nFile name: ${fileName}`,
              },
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "high" },
              },
            ],
          },
        ],
      }),
    });

    const raw = await res.text().catch(() => res.statusText);
    if (!res.ok) {
      lastErr = new Error(`OpenAI: ${res.status} ${raw.slice(0, 400)}`);
      if (isOpenAiEligibleForModelFallback(res.status, raw)) continue;
      throw lastErr;
    }

    const data = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("OpenAI לא החזיר תוכן");
    return parseModelJsonText(text);
  }

  throw lastErr ?? new Error("OpenAI: כל מודלי הוויז׳ן נכשלו");
}
