import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { prisma } from "@/lib/prisma";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { requireProjectForOrg } from "@/lib/projects/project-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withWorkspacesAuthDynamic<{ id: string }>(async (req, { orgId }, segment) => {
  const { id: projectId } = await segment.params;
  try {
    const industryBlock = await guardConstructionOnlyApi(orgId);
    if (industryBlock) return industryBlock;

    const gate = await requireProjectForOrg(projectId, orgId);
    if (!gate.ok) return gate.response;

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "account";
    const billNumber = Number(searchParams.get("billNumber") ?? "0");

    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      select: { name: true },
    });

    const lines = await prisma.projectBoqLine.findMany({
      where: { projectId, organizationId: orgId },
      orderBy: { sortOrder: "asc" },
    });

    const wb = XLSX.utils.book_new();

    if (type === "quote") {
      const rows: unknown[][] = [
        ["תיאור סעיף", "יחידה", "כמות", "מחיר יחידה", 'סה"כ', "האם בוצע עבודה?", "מקדם"],
      ];
      for (const l of lines) {
        rows.push([
          l.description,
          l.unit ?? "",
          l.quantity ?? "",
          l.unitPrice ?? "",
          l.lineTotal,
          l.isWorkDone ? "כן" : "לא",
          l.progressCoefficient ?? "",
        ]);
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "הצעת מחיר");
    } else if (type === "progress" && billNumber > 0) {
      const bill = await prisma.progressBill.findFirst({
        where: { projectId, billNumber },
        include: { lines: true },
      });
      const rows: unknown[][] = [["תיאור", "כמות חוזה", "מחיר", "בוצע", "מקדם", 'סה"כ']];
      for (const bl of bill?.lines ?? []) {
        rows.push([
          bl.description ?? "",
          bl.contractQty ?? "",
          bl.unitPrice ?? "",
          bl.executedQty ?? "",
          bl.executedCoef ?? "",
          bl.lineTotal,
        ]);
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), `חשבון ${billNumber}`);
    } else {
      const rows: unknown[][] = [["תיאור סעיף", "יחידה", "כמות", "מחיר יחידה", 'סה"כ']];
      for (const l of lines) {
        rows.push([l.description, l.unit ?? "", l.quantity ?? "", l.unitPrice ?? "", l.lineTotal]);
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "כתב כמויות");
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const filename = `${project?.name ?? "project"}-${type}.xlsx`;

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "export/excel");
  }
});
