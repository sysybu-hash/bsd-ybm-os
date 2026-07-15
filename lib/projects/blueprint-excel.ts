import ExcelJS from "exceljs";
import type { BlueprintAnalysis } from "@/lib/projects/blueprint-analysis-schema";
import {
  BLUEPRINT_EXCEL_COLORS,
  buildBoqSheet,
  buildMilestonesSheet,
  buildSummarySheet,
  buildTasksSheet,
} from "@/lib/projects/blueprint-excel-builders";

export async function buildBlueprintExcel(
  analysis: BlueprintAnalysis,
  projectName: string,
  enginesUsed: string[] = [],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BSD YBM OS";
  wb.created = new Date();
  wb.title = `כתב כמויות — ${projectName}`;
  wb.subject = "Blueprint BOQ Analysis";
  wb.keywords = "גרמושקה, BOQ, כתב כמויות";

  const C = BLUEPRINT_EXCEL_COLORS;
  const wsSummary = wb.addWorksheet("סיכום", { properties: { tabColor: { argb: C.tabSummary } } });
  const wsBoq = wb.addWorksheet("כתב כמויות", { properties: { tabColor: { argb: C.tabBoq } } });
  const wsTasks = wb.addWorksheet("לוח זמנים", { properties: { tabColor: { argb: C.tabTasks } } });
  const wsMilestones = wb.addWorksheet("אבני דרך", { properties: { tabColor: { argb: C.tabMilestones } } });

  const { grandTotalRow, grandTotalValue } = buildBoqSheet(wsBoq, analysis);
  const { contractValueRow } = buildSummarySheet(
    wsSummary,
    analysis,
    projectName,
    enginesUsed,
    grandTotalRow,
    grandTotalValue,
  );

  buildTasksSheet(wsTasks, analysis);
  buildMilestonesSheet(wsMilestones, analysis, contractValueRow);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
