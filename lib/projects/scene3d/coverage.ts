import type { SceneInput } from "@/lib/projects/scene3d/build-scene";

/**
 * How much of the apartment the measurement actually found.
 *
 * The renderer draws what was measured and nothing else, which is the whole
 * point of it — and the cost of that honesty is that an incomplete measurement
 * makes an incomplete still. On דירה 14 the segmenter names four rooms while
 * the sheet prints nine, and the render came back as four rooms: correct, and
 * useless beside the model's photograph.
 *
 * So the engine is made to know when it does not know. The sheet's own room
 * names are the reference — they are read off the drawing and verified, and
 * they say how many rooms this flat has. Where the measurement finds most of
 * them the still is trustworthy; where it does not, no still is offered and
 * the run keeps the one it has.
 */

export type MeasurementCoverage = {
  /** Rooms the flood found and the scene can name. */
  named: number;
  /** Rooms the sheet itself labels inside this flat. */
  labelled: number;
  /** Openings the measurement placed in the walls. */
  openings: number;
  /** named / labelled, or 1 when the sheet labels nothing to compare against. */
  ratio: number;
  /** Why it was rejected, in Hebrew, for the log and the run's report. */
  shortfall?: string;
};

/** A labelled room counts only where the measured floor puts one. */
function labelledInsideTheFlat(input: SceneInput): number {
  const labels = input.labelledRooms ?? [];
  if (labels.length === 0) return 0;
  return labels.filter((label) =>
    input.floorRects.some((rect) => {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      return (
        cx >= label.box.x &&
        cx <= label.box.x + label.box.w &&
        cy >= label.box.y &&
        cy <= label.box.y + label.box.h
      );
    }),
  ).length;
}

/**
 * Rooms this flat should have, against rooms it was measured to have.
 *
 * Two thirds is the line. Below it the still is missing whole rooms — walls
 * that were never found, doorways that were never sealed — and no amount of
 * light or material makes that a sales image.
 */
export const COVERAGE_FLOOR = 2 / 3;

/** At least this many openings, or the flat is a set of sealed boxes. */
export const MIN_OPENINGS_PER_ROOM = 0.8;

export function measurementCoverage(input: SceneInput): MeasurementCoverage {
  const named = input.rooms.length;
  const labelled = labelledInsideTheFlat(input);
  const openings = input.openings.length;
  const ratio = labelled > 0 ? named / labelled : 1;

  const coverage: MeasurementCoverage = { named, labelled, openings, ratio };
  if (labelled > 0 && ratio < COVERAGE_FLOOR) {
    coverage.shortfall = `המדידה מצאה ${named} חדרים מתוך ${labelled} שמודפסים על הגיליון`;
    return coverage;
  }
  if (named > 1 && openings < Math.floor(named * MIN_OPENINGS_PER_ROOM)) {
    coverage.shortfall = `נמצאו ${openings} פתחים ל-${named} חדרים`;
    return coverage;
  }
  return coverage;
}

/** True when the measurement is complete enough to photograph. */
export function measurementIsCompleteEnough(input: SceneInput): boolean {
  return measurementCoverage(input).shortfall == null;
}
