import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { applyRateLimit } from "@/lib/rate-limit";
import { buildBlueprintExcel } from "@/lib/projects/blueprint-excel";
import type { BlueprintAnalysis } from "@/lib/projects/blueprint-analysis-schema";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const POST = withWorkspacesAuth(async (req) => {
  const limited = await applyRateLimit(req, "blueprint:export-excel", 15, 60_000);
  if (limited) return limited;

  const { analysis, projectName, enginesUsed } = (await req.json()) as {
    analysis: BlueprintAnalysis;
    projectName?: string;
    enginesUsed?: string[];
  };

  const buffer = await buildBlueprintExcel(analysis, projectName ?? "פרויקט", enginesUsed ?? []);
  const safeName = `blueprint-${(projectName ?? "export").replace(/[^\wא-ת._-]/g, "_")}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    },
  });
});
