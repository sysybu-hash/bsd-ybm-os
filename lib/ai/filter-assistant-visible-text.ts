/**
 * מסנן טקסט "חשיבה" / meta של מודלים (במיוחד Gemini Live) שלא אמור להופיע למשתמש.
 */
const THINKING_LINE_PATTERNS: RegExp[] = [
  /^responding in\s+/i,
  /^i'?ve registered/i,
  /^i'?m focusing on/i,
  /^i am focusing on/i,
  /^let me (think|craft|consider|respond)/i,
  /^thinking[.:]/i,
  /^planning[.:]/i,
  /crafting a natural,? polite response/i,
  /^the user (said|greeted|asked|wants)/i,
  /^i need to (respond|reply|answer|craft)/i,
  /^my (goal|task) is to/i,
  /^first,? i (will|should|need)/i,
];

export function isAssistantThinkingText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  const firstLine = trimmed.split(/\n/)[0]?.trim() ?? trimmed;
  if (THINKING_LINE_PATTERNS.some((p) => p.test(firstLine))) return true;
  if (/^responding in\s+[\w\s]+$/i.test(firstLine) && trimmed.split(/\n/).length <= 2) {
    return true;
  }

  return false;
}

/** מחזיר null אם אין טקסט גלוי למשתמש (רק חשיבה פנימית). */
export function getAssistantVisibleTranscript(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const sections = trimmed.split(/(?=^#{1,3}\s)/m).map((s) => s.trim()).filter(Boolean);
  const chunks = sections.length > 0 ? sections : [trimmed];

  const visible = chunks.filter((chunk) => {
    const header = chunk.split(/\n/)[0]?.trim() ?? chunk;
    if (/^#{1,3}\s*responding in\b/i.test(header)) return false;
    return !isAssistantThinkingText(chunk);
  });

  const joined = visible.join("\n\n").trim();
  if (!joined || isAssistantThinkingText(joined)) return null;
  return joined;
}
