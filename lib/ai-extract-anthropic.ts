import { parseModelJsonText } from "@/lib/ai-document-json";
import {
  getAnthropicModelCandidates,
  isAnthropicEligibleForModelFallback,
} from "@/lib/ai-providers";

export async function extractDocumentWithAnthropic(
  base64: string,
  mimeType: string,
  fileName: string,
  documentInstruction: string,
  modelId?: string,
): Promise<Record<string, unknown>> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("חסר ANTHROPIC_API_KEY");

  const models = getAnthropicModelCandidates(modelId);

  const userContent =
    mimeType === "application/pdf"
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          {
            type: "text",
            text: `${documentInstruction}\nFile name: ${fileName}\nReturn a single JSON object only, no markdown.`,
          },
        ]
      : [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: base64,
            },
          },
          {
            type: "text",
            text: `${documentInstruction}\nFile name: ${fileName}`,
          },
        ];

  let lastErr: Error | null = null;

  for (const model of models) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: userContent,
          },
        ],
      }),
    });

    const errBody = await res.text().catch(() => res.statusText);
    if (!res.ok) {
      lastErr = new Error(`Anthropic: ${res.status} ${errBody.slice(0, 400)}`);
      if (isAnthropicEligibleForModelFallback(res.status, errBody)) continue;
      throw lastErr;
    }

    const data = JSON.parse(errBody) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = data.content?.find((b) => b.type === "text")?.text ?? "";
    if (!text) throw new Error("Claude לא החזיר טקסט");
    return parseModelJsonText(text);
  }

  throw lastErr ?? new Error("Anthropic: כל המודלים נכשלו");
}
