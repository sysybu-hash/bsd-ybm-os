// Elevation openings above a level (default the roof, +25.20).
import { readElevOpenings } from "./elev-openings.mts";
const lv = Number(process.argv[3] ?? 25.2);
for (const o of readElevOpenings(process.argv[2]!)) if (o.z0 + 0.2 >= lv - 0.3) console.log(o.sheet, o.x0, o.x1, (o.z0 + 0.2).toFixed(2), (o.z1 + 0.2).toFixed(2));
