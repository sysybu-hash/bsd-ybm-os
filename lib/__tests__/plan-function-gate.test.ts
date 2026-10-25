/**
 * @jest-environment node
 *
 * Gate 2: a painted storey holds where each room has the render's pieces.
 * Gottlieb A, 17/10/2026: a bedroom painted as a living room and two WCs as
 * laundries passed the pixel judge.
 */
import sharp from "sharp";

import { compareCounts, planFunctionFaults, planFunctionText, type PlanPieceAsk } from "@/lib/projects/building/plan-function-gate";

const floor = { id: "floor-1", sheetWidth: 680, sheetHeight: 680, shift: { x: 0, y: 0 } };

async function solid(rgb: [number, number, number], size = 400): Promise<Buffer> {
  return sharp({ create: { width: size, height: size, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).jpeg().toBuffer();
}

describe("compareCounts", () => {
  it("is empty when the painting holds the render's pieces", () => {
    expect(compareCounts({ bed: 2, toilet: 1 }, { bed: 2, toilet: 1 })).toEqual([]);
  });

  it("names a sofa added in a bedroom and a toilet turned to a washer", () => {
    const faults = compareCounts({ bed: 2, toilet: 1 }, { bed: 2, sofa: 2, washing_machine: 1 });
    expect(faults).toEqual(
      expect.arrayContaining([
        { piece: "sofa", fault: "added", render: 0, painting: 2 },
        { piece: "washing_machine", fault: "added", render: 0, painting: 1 },
        { piece: "toilet", fault: "lost", render: 1, painting: 0 },
      ]),
    );
    expect(faults).toHaveLength(3);
  });
});

describe("planFunctionFaults", () => {
  const rooms = [
    { kind: "bedroom", name: "bed 3", x: 1, z: 1, w: 3.5, d: 3.8 },
    { kind: "bathroom", name: "wc", x: 5, z: 1, w: 1.3, d: 0.9 },
    { kind: "bathroom", name: "tiny", x: 8, z: 1, w: 0.4, d: 0.4 },
    { kind: "circulation", name: "hall", x: 1, z: 6, w: 3, d: 3 },
  ];

  it("reports the faults of each room and skips halls and closets", async () => {
    const asked: number[] = [];
    const ask: PlanPieceAsk = async (_prompt, images) => {
      asked.push(images.length);
      return {
        rooms: [
          { pair: 1, render: { bed: 2 }, painting: { bed: 2, sofa: 1, coffee_table: 1 } },
          { pair: 2, render: { toilet: 1 }, painting: { washing_machine: 1 } },
        ],
      };
    };
    const verdict = await planFunctionFaults({ render: await solid([200, 180, 150]), painting: await solid([190, 170, 140]), rooms, floor, padM: 0, ask });
    expect(asked).toEqual([4]);
    expect(verdict.checked).toBe(2);
    expect(verdict.ok).toBe(false);
    expect(verdict.faults.map((f) => `${f.room}:${f.piece}:${f.fault}`).sort()).toEqual(
      ["bed 3:coffee_table:added", "bed 3:sofa:added", "wc:toilet:lost", "wc:washing_machine:added"].sort(),
    );
    expect(planFunctionText(verdict.faults[0]!)).toMatch(/in a (bedroom|bathroom) \(render \d, painting \d\)/);
  });

  it("holds only when every room was read and none differs", async () => {
    const same: PlanPieceAsk = async () => ({
      rooms: [
        { pair: 1, render: { bed: 2 }, painting: { bed: 2 } },
        { pair: 2, render: { toilet: 1 }, painting: { toilet: 1 } },
      ],
    });
    const ok = await planFunctionFaults({ render: await solid([200, 180, 150]), painting: await solid([190, 170, 140]), rooms, floor, padM: 0, ask: same });
    expect(ok).toMatchObject({ ok: true, checked: 2, faults: [] });
  });

  it("is not a pass when the vision model does not answer", async () => {
    const mute: PlanPieceAsk = async () => null;
    const verdict = await planFunctionFaults({ render: await solid([200, 180, 150]), painting: await solid([190, 170, 140]), rooms, floor, padM: 0, ask: mute });
    expect(verdict.ok).toBe(false);
    expect(verdict.checked).toBe(0);
  });
});
