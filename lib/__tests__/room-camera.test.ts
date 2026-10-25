import { blocksOf, chooseRoomCamera, type Block } from "@/lib/projects/building/dwf-views";
import type { Primitive } from "@/lib/projects/building/model";

const wall = (x0: number, x1: number, z0: number, z1: number): Block => ({ x0, x1, z0, z1, y0: 0, y1: 2.8, wall: true });
const bed: Block = { x0: 0.2, x1: 1.0, z0: 0.3, z1: 2.3, y0: 0, y1: 0.5 };
// A 4.8 × 2.8 room, walled all round, with a stub of wall standing in it by its middle and a bed against the far-left wall.
const room = { x: 0, z: 0, w: 4.8, d: 2.8 };
const blocks: Block[] = [wall(-0.2, 0, -0.2, 3), wall(4.8, 5, -0.2, 3), wall(-0.2, 5, -0.2, 0), wall(-0.2, 5, 2.8, 3), wall(2.4, 3.5, 1.7, 2.3), bed];

describe("chooseRoomCamera", () => {
  const view = chooseRoomCamera({ room, level: 0, blocks, fovDeg: 62, aspect: 1.5 })!;

  it("finds a place that is neither in a wall, nor against one, nor behind the stub of wall", () => {
    expect(view).not.toBeNull();
    const against = blocks.filter((b) => b.wall).some((b) => view.eye.x > b.x0 - 0.3 && view.eye.x < b.x1 + 0.3 && view.eye.z > b.z0 - 0.3 && view.eye.z < b.z1 + 0.3);
    expect(against).toBe(false);
    expect(view.ahead).toBeGreaterThanOrEqual(2.4);
  });

  it("looks at what the room is for: the bed is inside its view", () => {
    const [vx, vz] = [view.at.x - view.eye.x, view.at.z - view.eye.z];
    const [bx, bz] = [0.6 - view.eye.x, 1.3 - view.eye.z];
    const angle = Math.abs(Math.atan2(vx * bz - vz * bx, vx * bx + vz * bz));
    expect(angle).toBeLessThan(Math.atan(Math.tan((62 * Math.PI) / 360) * 1.5));
  });

  it("answers null where the room has nowhere to stand", () => {
    const full: Block[] = [{ x0: -1, x1: 6, z0: -1, z1: 4, y0: 0, y1: 0.8 }];
    expect(chooseRoomCamera({ room, level: 0, blocks: full, fovDeg: 62, aspect: 1.5 })).toBeNull();
  });
});

describe("blocksOf", () => {
  it("takes a storey's walls and furniture, not its windows, floors or the yard", () => {
    const box = (tag: string, y: number, h: number): Primitive => ({ type: "box", centre: { x: 1, y, z: 1 }, size: { x: 1, y: h, z: 0.3 }, material: "plaster", tag });
    const got = blocksOf([box("floor-0", 1.4, 2.8), box("floor-0:window", 1.6, 1), box("floor-0:inside:furniture", 0.4, 0.8), box("yard:fence", 0.3, 1), box("floor-0:inside:finish", 0, 0.04)]);
    expect(got).toHaveLength(2);
    expect(got.filter((b) => b.wall)).toHaveLength(1);
  });
});
