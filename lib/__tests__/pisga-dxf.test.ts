import { logicalLabel } from "@/lib/projects/building/pisga-dxf";

describe("pisga-dxf labels", () => {
  it("turns the drawing's visual-order figures into the printed ones", () => {
    expect(logicalLabel("עיצוב מרחבי למידה 901 מר")).toBe('עיצוב מרחבי למידה 109 מ"ר');
    expect(logicalLabel("אולם רב תכליתי 531 מר")).toBe('אולם רב תכליתי 135 מ"ר');
    expect(logicalLabel("כיתה 05 מר")).toBe('כיתה 50 מ"ר');
  });

  it('reads the mis-keyed ממ"ד', () => {
    expect(logicalLabel('ממ"מ')).toBe('ממ"ד');
  });
});
