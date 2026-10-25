import { env } from "@/lib/env";
import { recordAiUsage } from "@/lib/ai-usage";
import { houseKnob } from "@/lib/projects/building/house-knobs";

/**
 * Vision judge for a FLUX (or other) plan painting vs its measured render.
 * Uses Claude when ANTHROPIC_API_KEY is set; otherwise OpenAI if available.
 * Returns structured faults — does not auto-accept.
 */

export type FluxPlanFault = {
  code: string;
  detail: string;
  severity: "block" | "warn";
};

export type FluxPlanJudgeResult = {
  pass: boolean;
  faults: FluxPlanFault[];
  notes: string;
  provider: "claude" | "openai" | "none";
};

const JUDGE_PROMPT = `You compare image 1 (MEASURED render, authority) to image 2 (PAINTED plan).
Return ONLY JSON: { "pass": boolean, "faults": [{"code": string, "detail": string, "severity": "block"|"warn"}], "notes": string }.
Block if: walls/openings moved or reframed; invented fixtures; toilet instead of washing machine; sofa looks like bed; walk-line/arrow broken; room-name labels burned in; balcony glass black rail missing when present in measured.
Warn if: materials slightly off tone; golden-hour shadows heavy but layout locked; kitchen tile greyer.
pass=true only when there are zero block faults.`;

function b64(buf: Buffer): string {
  return buf.toString("base64");
}

function parseJudge(text: string): FluxPlanJudgeResult {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const raw = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  try {
    const j = JSON.parse(raw) as { pass?: boolean; faults?: FluxPlanFault[]; notes?: string };
    const faults = Array.isArray(j.faults) ? j.faults : [];
    const pass = j.pass === true && !faults.some((f) => f.severity === "block");
    return { pass, faults, notes: String(j.notes ?? ""), provider: "claude" };
  } catch {
    return { pass: false, faults: [{ code: "parse", detail: text.slice(0, 200), severity: "block" }], notes: "judge parse failed", provider: "none" };
  }
}

async function judgeWithClaude(measured: Buffer, painted: Buffer): Promise<FluxPlanJudgeResult | null> {
  const key = (env.ANTHROPIC_API_KEY ?? "").trim();
  if (!key) return null;
  const model = houseKnob("ANTHROPIC_MODEL")?.trim() || "claude-sonnet-4-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64(measured) } },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64(painted) } },
            { type: "text", text: JUDGE_PROMPT },
          ],
        },
      ],
    }),
  });
  const body = await res.text();
  if (!res.ok) return null;
  const parsed = JSON.parse(body) as { model?: string; content?: Array<{ type?: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
  if (parsed.usage) recordAiUsage(parsed.model ?? model, { inputTokens: parsed.usage.input_tokens ?? 0, outputTokens: parsed.usage.output_tokens ?? 0 });
  const text = parsed.content?.find((c) => c.type === "text")?.text ?? body;
  const result = parseJudge(text);
  return { ...result, provider: "claude" };
}

async function judgeWithOpenAI(measured: Buffer, painted: Buffer): Promise<FluxPlanJudgeResult | null> {
  const key = (env.OPENAI_API_KEY ?? "").trim();
  if (!key) return null;
  const model = houseKnob("OPENAI_VISION_MODEL")?.trim() || "gpt-4.1-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: JUDGE_PROMPT },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64(measured)}` } },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64(painted)}` } },
          ],
        },
      ],
    }),
  });
  const body = await res.text();
  if (!res.ok) return null;
  const parsed = JSON.parse(body) as { model?: string; choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  if (parsed.usage) recordAiUsage(parsed.model ?? model, { inputTokens: parsed.usage.prompt_tokens ?? 0, outputTokens: parsed.usage.completion_tokens ?? 0 });
  const text = parsed.choices?.[0]?.message?.content ?? body;
  const result = parseJudge(text);
  return { ...result, provider: "openai" };
}

/** Judge painting vs measured. Returns provider "none" when no key — caller should human-review. */
export async function judgeFluxPlan(measured: Buffer, painted: Buffer): Promise<FluxPlanJudgeResult> {
  const claude = await judgeWithClaude(measured, painted);
  if (claude) return claude;
  const openai = await judgeWithOpenAI(measured, painted);
  if (openai) return openai;
  return {
    pass: false,
    faults: [{ code: "no-judge", detail: "No Anthropic/OpenAI key — human review required", severity: "block" }],
    notes: "humanReview",
    provider: "none",
  };
}
