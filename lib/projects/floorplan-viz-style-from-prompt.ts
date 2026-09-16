import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseModelJsonText } from "@/lib/ai-document-json";
import { getGeminiApiKey } from "@/lib/gemini-api-key";
import {
  deterministicGenerationConfig,
  getBlueprintAnalysisModelChain,
  isLikelyGeminiModelUnavailable,
} from "@/lib/gemini-model";
import {
  applyHarediModesty,
  buildCustomStyleKitFromAnswers,
  parseCustomStyleKit,
  type CustomStyleAnswers,
  type FloorplanVizStyleKit,
} from "@/lib/projects/floorplan-viz-styles";

function answersBrief(answers: CustomStyleAnswers): string {
  return JSON.stringify({
    freeText: answers.freeText ?? "",
    audience: answers.audience === "haredi" ? "haredi" : "general",
    mood: answers.mood ?? "light",
    dominantColor: answers.dominantColor ?? "",
    mustHave: answers.mustHave ?? "",
    mustNot: answers.mustNot ?? "",
  });
}

export async function synthesizeFloorplanStyleKit(
  answers: CustomStyleAnswers,
): Promise<FloorplanVizStyleKit> {
  const fallback = buildCustomStyleKitFromAnswers(answers);
  const apiKey = getGeminiApiKey();
  if (!apiKey) return fallback;

  const instruction = `You build an interior visualization STYLE KIT for an Israeli apartment floor-plan renderer.
Return JSON only:
{
  "id": "custom",
  "audience": "general" | "haredi",
  "labelHe": string,
  "labelEn": string,
  "labelRu": string,
  "summaryHe": string,
  "colors": ["#rrggbb", "#rrggbb", "#rrggbb"],
  "materialsHe": string,
  "promptBlock": string
}
promptBlock must be English instructions for an image model: materials, furniture, lighting, colours.
The sales plan is the only layout. Style must not add, remove, or move walls, doors, windows, sinks, toilets, stairs, or rooms.
Do not change walls, doors, or windows. Stage a lived-in family home: warm daylight, rugs, pillows, a fruit bowl, lamps on — not an empty show unit.
If audience is haredi: no people, no TVs/screens/monitors/laptops (including a thin black bar on a desk from above), one modest sefarim cabinet in living (not a full-wall library), Shabbat table, mezuzah without readable text, kosher kitchen, no figurative art.
If audience is haredi: never a double bed; copy the plan's bed count (one drawn bed = one twin; two drawn twins stay two twins with a gap; empty ממ"ד stays empty). Do not pack two twins into a narrow room that has one bed symbol.
Kitchen: copy sinks from the plan; a double-bowl is one fixture; no island sink unless drawn. Do not invent an entrance sink unless an oval basin is drawn.
If audience is haredi the aesthetic MUST be innovative contemporary 2020s Israeli architecture — NOT antique, NOT baroque, NOT heavy velvet, NOT carved period furniture. Modern built-in sefarim, simple modern Shabbat table.
User briefing:
${answersBrief(answers)}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  for (const modelId of getBlueprintAnalysisModelChain()) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: instruction }] }],
        generationConfig: deterministicGenerationConfig(),
      });
      const parsed = parseCustomStyleKit(parseModelJsonText(result.response.text()));
      if (!parsed) continue;
      const audience = answers.audience === "haredi" ? "haredi" : parsed.audience;
      return applyHarediModesty({ ...parsed, id: "custom", audience });
    } catch (err: unknown) {
      if (isLikelyGeminiModelUnavailable(err)) continue;
      return fallback;
    }
  }
  return fallback;
}
