// Breuer 21: the painting estimate for N pictures, per size, with the platform's first image model. Free: prices only, no call.
import { estimateHousePainting } from "@/lib/projects/building/house-cost";
import { houseImageModels } from "@/lib/projects/building/house-booklet-job";
const n = Number(process.argv[2] ?? 3), model = houseImageModels()[0]!;
for (const size of ["1K", "2K", "4K"] as const) { const e = estimateHousePainting({ pictures: n, model, size }); console.log(size, model, `per picture ₪${e.perPictureIls.toFixed(2)}`, `likely ₪${e.likelyIls.toFixed(2)}`, `most ₪${e.mostIls.toFixed(2)}`); }
