import { logicalLabel } from "@/lib/projects/building/pisga-dxf";

describe("pisga-dxf labels", () => {
  it('turns the bare מר of a room label into the printed מ"ר', () => {
    expect(logicalLabel("עיצוב מרחבי למידה 109 מר")).toBe('עיצוב מרחבי למידה 109 מ"ר');
    expect(logicalLabel("אולם רב תכליתי 135 מר")).toBe('אולם רב תכליתי 135 מ"ר');
    expect(logicalLabel("כיתה 50 מר")).toBe('כיתה 50 מ"ר');
  });

  it('reads the mis-keyed ממ"ד', () => {
    expect(logicalLabel('ממ"מ')).toBe('ממ"ד');
  });
});
