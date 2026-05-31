import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { parseExcelProjectWorkbook } from "@/lib/imports/excel-project-workbook";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { requireProjectForOrg } from "@/lib/projects/project-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withWorkspacesAuthDynamic<{ id: string }>(async (req, { orgId }, segment) => {
  const { id: projectId } = await segment.params;
  try {
    const industryBlock = await guardConstructionOnlyApi(orgId);
    if (industryBlock) return industryBlock;

    const gate = await requireProjectForOrg(projectId, orgId);
    if (!gate.ok) return gate.response;

    const form = await req.formData();
    const file = form.get("file");
    const confirm = form.get("confirm") === "true";
    if (!file || !(file instanceof File)) {
      return jsonBadRequest("לא נמצא קובץ Excel", "missing_file");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseExcelProjectWorkbook(buffer, file.name);

    if (!confirm) {
      return NextResponse.json({
        preview: true,
        kind: parsed.kind,
        lineCount: parsed.boqLines.length,
        billCount: parsed.progressBills.length,
        totalAmount: parsed.totalAmount,
        sampleLines: parsed.boqLines.slice(0, 15),
      });
    }

    const quote = await prisma.projectQuote.create({
      data: {
        projectId,
        organizationId: orgId,
        title: parsed.title,
        status: "draft",
        sourceFileName: parsed.sourceFileName,
        totalAmount: parsed.totalAmount,
      },
    });

    for (const line of parsed.boqLines) {
      const created = await prisma.projectBoqLine.create({
        data: {
          projectId,
          organizationId: orgId,
          quoteId: quote.id,
          sortOrder: line.sortOrder,
          sectionTitle: line.sectionTitle,
          description: line.description,
          unit: line.unit,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          isSectionSubtotal: line.isSectionSubtotal,
          isWorkDone: line.isWorkDone ?? false,
          progressCoefficient: line.progressCoefficient,
          executedQuantity: line.isWorkDone ? line.quantity : undefined,
        },
      });

      if (line.phases?.length) {
        for (const ph of line.phases) {
          await prisma.projectBoqPhaseColumn.create({
            data: {
              boqLineId: created.id,
              phaseIndex: ph.phaseIndex,
              coefficient: ph.coefficient,
              phaseAmount: ph.phaseAmount,
            },
          });
        }
      }
    }

    for (const bill of parsed.progressBills) {
      const pb = await prisma.progressBill.create({
        data: {
          projectId,
          organizationId: orgId,
          billNumber: bill.billNumber,
          subtotal: bill.subtotal,
          total: bill.total,
        },
      });
      for (const bl of bill.lines) {
        await prisma.progressBillLine.create({
          data: {
            billId: pb.id,
            description: bl.description,
            contractQty: bl.contractQty,
            unitPrice: bl.unitPrice,
            executedQty: bl.executedQty,
            executedCoef: bl.executedCoef,
            lineTotal: bl.lineTotal,
          },
        });
      }
    }

    if (parsed.totalAmount > 0) {
      await prisma.project.update({
        where: { id: projectId },
        data: { budget: parsed.totalAmount },
      });
    }

    return NextResponse.json({
      ok: true,
      quoteId: quote.id,
      linesImported: parsed.boqLines.length,
      billsImported: parsed.progressBills.length,
    });
  } catch (error) {
    return apiErrorResponse(error, "import/excel");
  }
});
