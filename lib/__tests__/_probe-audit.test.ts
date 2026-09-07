/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";

require("dotenv").config({ path: ".env.local" });

import { auditFloorplanStill } from "@/lib/projects/floorplan-viz-audit";

const DIR = path.join(process.cwd(), "תוכניות לביצוע הדמיות");

it("probe", async () => {
  const still = fs.readFileSync(path.join(DIR, "מוכן", process.env.SRC!));
  const plan = fs.readFileSync(path.join(DIR, process.env.PLAN!));
  console.log(
    JSON.stringify(
      await auditFloorplanStill(
        { base64: still.toString("base64"), mimeType: "image/jpeg" },
        { base64: plan.toString("base64"), mimeType: "application/pdf" },
      ),
      null,
      2,
    ),
  );
}, 300_000);
