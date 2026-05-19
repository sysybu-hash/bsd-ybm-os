/** מצטבר מקטעי תמלול (מילה-מילה או חלקיים) למשפט מלא */
export function mergeTranscriptChunk(previous: string, chunk: string): string {
  const next = chunk.trim();
  if (!next) return previous.trim();
  const prev = previous.trim();
  if (!prev) return next;
  if (next.startsWith(prev)) return next;
  if (prev.startsWith(next)) return prev;
  if (prev.endsWith(next)) return prev;
  return `${prev} ${next}`.replace(/\s+/g, " ").trim();
}
