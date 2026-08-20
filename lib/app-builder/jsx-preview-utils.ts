/** Returns true when the string looks like a default-export React component. */
export function isLikelyReactComponent(code: string): boolean {
  const trimmed = code.trim();
  if (trimmed.length < 12) return false;
  if (!/^(import |export |const |function )/m.test(trimmed)) return false;
  return /export\s+default/m.test(trimmed);
}

/** Strip markdown fences and leading prose from model JSX output. */
export function sanitizeGeneratedJsx(raw: string): string {
  let cleanCode = raw;

  const fenceMatch = cleanCode.match(/```(?:jsx?|tsx?|typescript|javascript|react)?\s*([\s\S]*)```/i);
  if (fenceMatch?.[1]) {
    cleanCode = fenceMatch[1];
  } else {
    cleanCode = cleanCode
      .replace(/^```(?:jsx?|tsx?|typescript|javascript|react)?\s*/im, "")
      .replace(/```\s*$/m, "");
  }

  cleanCode = cleanCode.replace(/(?<![`])(`)\s*$/, "").trim();

  if (
    !cleanCode.startsWith("import") &&
    !cleanCode.startsWith("export") &&
    !cleanCode.startsWith("const") &&
    !cleanCode.startsWith("function")
  ) {
    const codeStart = cleanCode.search(/^(?:import |export |const |function )/m);
    if (codeStart !== -1) cleanCode = cleanCode.slice(codeStart).trim();
  }

  return cleanCode;
}

/** True when the user message is probably asking to build or change UI. */
export function looksLikeUiBuildRequest(message: string): boolean {
  const text = message.trim();
  if (text.length < 3) return false;

  const uiPattern =
    /(?:בנה|צור|עשה|תעש|תציג|ממשק|טופס|דשבורד|לוח|מחשבון|צ.?ק.?ליסט|קנבן|לוח\s*שנה|clock|calculator|dashboard|form|kanban|calendar|checklist|widget|ui|app|game|animation|chart|preview|תצוגה)/iu;

  return uiPattern.test(text);
}
