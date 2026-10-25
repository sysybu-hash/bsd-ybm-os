import { sideTerraces } from "@/lib/projects/building/house-yard";

/**
 * Where a side door's flight goes down to land the elevations mark below the
 * floor, the plot beside the house on that side is a lower terrace at that
 * level — the flight lands on it, not into a lawn laid at ±0.00.
 */
describe("a plot's lower terraces beside the house", () => {
  const house = [[[5, 4], [20, 4], [20, 18], [5, 18]]] as Array<Array<[number, number]>>;
  const plot = { x0: 1, z0: 1, x1: 24, z1: 23 };

  it("lays the strip between the house and the boundary at the flight's foot, as long as the house", () => {
    const [t] = sideTerraces(house, plot, { west: -1.1, east: 1.1, sideFlights: { west: -1.37 } });
    expect(t).toMatchObject({ side: "west", level: -1.37, x1: 5, z0: 4, z1: 18 });
    expect(t!.x0).toBeGreaterThan(plot.x0);
  });

  it("keeps the plot whole where no flight goes down, or the side is too narrow to hold a terrace", () => {
    expect(sideTerraces(house, plot, { west: 0, east: 0 })).toEqual([]);
    expect(sideTerraces(house, plot, { west: 0, east: 0, sideFlights: { east: -0.05 } })).toEqual([]);
    expect(sideTerraces([[[1.5, 4], [20, 4], [20, 18], [1.5, 18]]], plot, { west: 0, east: 0, sideFlights: { west: -1 } })).toEqual([]);
  });
});
