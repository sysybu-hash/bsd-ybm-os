/** A revision is acceptable only when it removes failures without adding one. */
export function isNetImprovement(before: string[], after: string[]): boolean {
  return after.length < before.length && after.every((issue) => before.includes(issue));
}
