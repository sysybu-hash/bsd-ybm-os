import type { Rect } from "@/lib/projects/scene3d/floors";

/** Sinks further apart than this are in different kitchens. */
export const KITCHEN_REACH_M = 3.5;

/**
 * Which drawn sinks are built as double sinks.
 *
 * A haredi kitchen washes meat and dairy apart. Where the sheet draws two
 * sinks — side by side or across the kitchen, as each of Gottlieb's kitchens
 * does — they are two single sinks, never one double. Where it draws one, a
 * haredi kitchen has it as a double sink, its two bowls in the drawn box. Any
 * other audience builds every sink as drawn.
 */
export function doubleSinks(sinks: Rect[], haredi: boolean, unitsPerMetre: number): boolean[] {
  if (!haredi) return sinks.map(() => false);
  const reach = KITCHEN_REACH_M * unitsPerMetre;
  const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  // A kitchen: the sinks within reach of each other, one to the next.
  const kitchen = sinks.map((_, i) => i);
  const root = (i: number): number => (kitchen[i] === i ? i : (kitchen[i] = root(kitchen[i]!)));
  for (let i = 0; i < sinks.length; i++) {
    for (let j = i + 1; j < sinks.length; j++) {
      const [a, b] = [centre(sinks[i]!), centre(sinks[j]!)];
      if (Math.hypot(a.x - b.x, a.y - b.y) <= reach) kitchen[root(j)] = root(i);
    }
  }
  const count = new Map<number, number>();
  sinks.forEach((_, i) => count.set(root(i), (count.get(root(i)) ?? 0) + 1));
  return sinks.map((_, i) => count.get(root(i)) === 1);
}
