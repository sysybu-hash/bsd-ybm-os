import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
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

    let sheetName: string;
    let rows: unknown[][];

    if (type === "quote") {
      sheetName = "הצעת מחיר";
      rows = [["תיאור סעיף", "יחידה", "כמות", "מחיר יחידה", 'סה"כ', "האם בוצע עבודה?", "מקדם"]];
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
    } else if (type === "progress" && billNumber > 0) {
      const bill = await prisma.progressBill.findFirst({
        where: { projectId, billNumber },
        include: { lines: true },
      });
      sheetName = `חשבון ${billNumber}`;
      rows = [["תיאור", "כמות חוזה", "מחיר", "בוצע", "מקדם", 'סה"כ']];
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
    } else {
      sheetName = "כתב כמויות";
      rows = [["תיאור סעיף", "יחידה", "כמות", "מחיר יחידה", 'סה"כ']];
      for (const l of lines) {
        rows.push([l.description, l.unit ?? "", l.quantity ?? "", l.unitPrice ?? "", l.lineTotal]);
      }
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);
    ws.addRows(rows);

    const buf = await wb.xlsx.writeBuffer();
    const filename = `${project?.name ?? "project"}-${type}.xlsx`;

    return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "export/excel");
  }
});
