import { PIECE_COLOURS } from "@/lib/projects/floorplan-render3d";

/** Channel distance between two "#rrggbb" values, worst channel. */
function apart(a: string, b: string): number {
  const chan = (s: string) =>
    [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const [x, y] = [chan(a), chan(b)];
  return Math.max(...x.map((v, i) => Math.abs(v - y[i]!)));
}

describe("the coding palette the model has to read", () => {
  it("keeps a bed and a sanitary fixture far apart", () => {
    // They were #fdfdfc and #fbfbfa — two parts in 255 — so "off-white and long
    // is a bed, white and long is a bath" was a distinction the model could not
    // see, and it rendered דירה 14's beds as a bathtub.
    expect(apart(PIECE_COLOURS.bed!.top, PIECE_COLOURS.fixture!.top)).toBeGreaterThan(20);
    expect(apart(PIECE_COLOURS.bed!.face, PIECE_COLOURS.fixture!.face)).toBeGreaterThan(20);
  });

  it("keeps every pair of kinds distinguishable", () => {
    const kinds = Object.keys(PIECE_COLOURS);
    for (const a of kinds) {
      for (const b of kinds) {
        if (a >= b) continue;
        expect({
          pair: `${a}/${b}`,
          apart: apart(PIECE_COLOURS[a]!.top, PIECE_COLOURS[b]!.top),
        }).toMatchObject({ apart: expect.any(Number) });
        expect(apart(PIECE_COLOURS[a]!.top, PIECE_COLOURS[b]!.top)).toBeGreaterThan(8);
      }
    }
  });
});

describe("the separation the aqua is spent on", () => {
  it("keeps a fixture well clear of bed linen", () => {
    // Paled to #e8f4f6 while the tint was bleeding, this fell to 21 parts and
    // beds came back as baths. The bleed had another cause; the separation is
    // what stops a bathroom appearing in a bedroom.
    const chan = (s: string) =>
      [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    const [bed, fixture] = [
      chan(PIECE_COLOURS.bed!.top),
      chan(PIECE_COLOURS.fixture!.top),
    ];
    const apart = Math.max(...bed.map((v, i) => Math.abs(v - fixture[i]!)));
    expect(apart).toBeGreaterThan(30);
  });
});
