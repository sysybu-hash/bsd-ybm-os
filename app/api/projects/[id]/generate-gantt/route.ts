import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonTooManyRequests } from "@/lib/api-json";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import { runAiChat } from "@/lib/ai-chat";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { parseModelJsonText } from "@/lib/ai-document-json";
import { addIsraeliWorkDays, adjustToNextIsraeliWorkday } from "@/lib/date/israeli-workdays";
import { deleteTaskCalendarEvents, pushGanttTasksToCalendar } from "@/lib/projects/gantt-calendar";

/** מקור משימות שנוצרו ע"י סוכן הגאנט — משמש לזיהוי והחלפה */
const GANTT_AGENT_SOURCE = "AI_GANTT";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** הנחיית הסוכן — מנהל פרויקטים בנייה שמקבץ שורות BOQ לשלבים כרונולוגיים */
const GANTT_AGENT_SYSTEM = `You are an Expert Construction Project Manager building a Gantt timeline.
Analyze the project's Bill of Quantities (BOQ) lines and group them into logical,
CHRONOLOGICAL construction phases — the natural build order on a real site
(e.g. Site Preparation → Earthworks & Infrastructure → Structure → Plumbing & Electrical
rough-in → Drywall & Flooring → Finishes → Cleanup & Handover). Merge granular BOQ
items into a small number of high-level milestones (typically 5–12, never more than 25).

Return ONLY a strict JSON object (no markdown) in exactly this shape:
{
  "phases": [
    {
      "taskName": "short phase title",
      "description": "one sentence summarizing which BOQ items this phase covers",
      "estimatedDays": <positive integer — realistic working days for this phase>,
      "orderIndex": <0-based integer giving the chronological order>
    }
  ]
}
Rules:
- orderIndex must be unique and sequential starting at 0, in true build order.
- estimatedDays must be a positive whole number proportional to the phase scope.
- Do not invent work that is not implied by the BOQ.
- Human-readable strings (taskName, description) in the requested language.`;

const phaseSchema = z.object({
  taskName: z.string().min(1).max(160),
  description: z.string().max(600).optional().default(""),
  estimatedDays: z.coerce.number().int().positive().max(365).catch(7),
  orderIndex: z.coerce.number().int().nonnegative().catch(0),
});

const responseSchema = z.object({
  phases: z.array(phaseSchema).min(1).max(25),
});

export const POST = withWorkspacesAuthDynamic<{ id: string }>(async (_req, { orgId, userId }, segment) => {
  const { id: projectId } = await segment.params;
  try {
    const rl = await checkRateLimit(`gantt-generate:user:${userId}`, 15, 60 * 60 * 1000);
    if (!rl.success) {
      return jsonTooManyRequests("חריגה ממכסת יצירת לוחות גאנט — נסו שוב מאוחר יותר.");
    }

    const industryBlock = await guardConstructionOnlyApi(orgId);
    if (industryBlock) return industryBlock;

    const gate = await requireProjectForOrg(projectId, orgId);
    if (!gate.ok) return gate.response;

    if (!isGeminiConfigured()) {
      return NextResponse.json({ error: "שירות AI לא מוגדר", code: "ai_unconfigured" }, { status: 503 });
    }

    // 1. שורות ה-BOQ של הפרויקט (ללא שורות סיכום-מקטע)
    const boqLines = await prisma.projectBoqLine.findMany({
      where: { projectId, organizationId: orgId, isSectionSubtotal: false },
      orderBy: { sortOrder: "asc" },
      select: { description: true, unit: true, quantity: true },
    });

    if (boqLines.length === 0) {
      return jsonBadRequest("כתב הכמויות ריק — אין שורות לניתוח", "empty_boq");
    }

    // 2. ניתוח AI — קיבוץ לשלבים כרונולוגיים
    const context = `${GANTT_AGENT_SYSTEM}

PROJECT: ${gate.project.name}
BOQ LINES (${boqLines.length}):
${JSON.stringify(
  boqLines.slice(0, 400).map((l) => ({
    description: l.description,
    unit: l.unit,
    quantity: l.quantity,
  })),
)}`;

    const { text } = await runAiChat(
      "gemini",
      "Group these BOQ lines into chronological construction phases as instructed.",
      context,
      "he",
    );

    const parsed = responseSchema.safeParse(parseModelJsonText(text));
    if (!parsed.success || parsed.data.phases.length === 0) {
      return NextResponse.json(
        { error: "ניתוח ה-AI נכשל — נסו שוב", code: "ai_parse_failed" },
        { status: 502 },
      );
    }

    // 3. מיון כרונולוגי + שרשור תאריכים על לוח עבודה ישראלי (דילוג שישי/שבת)
    const phases = [...parsed.data.phases].sort((a, b) => a.orderIndex - b.orderIndex);
    // נקודת ההתחלה — activeFrom או היום, מוזזת קדימה לראשון אם נופלת בסופ"ש
    const timelineStart = adjustToNextIsraeliWorkday(gate.project.activeFrom ?? new Date());

    // מזהי משימות הגאנט הישנות — נדרשים לניקוי אירועי Google Calendar שלהן
    const oldTaskIds = (
      await prisma.task.findMany({
        where: { projectId, organizationId: orgId, source: GANTT_AGENT_SOURCE },
        select: { id: true },
      })
    ).map((t) => t.id);

    type CreatedTask = {
      id: string;
      title: string;
      description: string | null;
      startDate: Date | null;
      endDate: Date | null;
    };

    // 4. החלפה אטומית: מחיקת משימות הגאנט הקודמות שנוצרו ע"י ה-AI (לא הידניות)
    //    והזרקת החדשות — הכל בטרנזקציה אחת. כל שלב תלוי בקודמו (sequential Gantt).
    const { created, replaced } = await prisma.$transaction(async (tx) => {
      const del = await tx.task.deleteMany({
        where: { projectId, organizationId: orgId, source: GANTT_AGENT_SOURCE },
      });

      const tasks: CreatedTask[] = [];
      let cursor = timelineStart;
      let previousId: string | null = null;

      for (const phase of phases) {
        // השלב מתחיל ביום העבודה הנוכחי ונמשך estimatedDays ימי עבודה (Sun–Thu)
        const startDate = adjustToNextIsraeliWorkday(cursor);
        const endDate = addIsraeliWorkDays(startDate, phase.estimatedDays);
        const task: CreatedTask = await tx.task.create({
          data: {
            title: phase.taskName.trim(),
            description: phase.description.trim() || null,
            projectId,
            organizationId: orgId,
            source: GANTT_AGENT_SOURCE,
            status: "TODO",
            priority: "MEDIUM",
            progress: 0,
            startDate,
            endDate,
            dependencies: previousId ? JSON.stringify([previousId]) : null,
          },
          select: { id: true, title: true, description: true, startDate: true, endDate: true },
        });
        tasks.push(task);
        previousId = task.id;
        // השלב הבא מתחיל היכן שהנוכחי הסתיים
        cursor = endDate;
      }
      return { created: tasks, replaced: del.count };
    });

    // 5. Google Calendar — best-effort, מחוץ לטרנזקציה (קריאות רשת חיצוניות).
    //    כשל סנכרון לא מפיל את יצירת המשימות.
    let calendar: { connected: boolean; synced: number } = { connected: false, synced: 0 };
    try {
      // ניקוי אירועי הגאנט הישנים לפני יצירת החדשים (sync integrity)
      await deleteTaskCalendarEvents(userId, orgId, oldTaskIds);
      calendar = await pushGanttTasksToCalendar(userId, orgId, created);
    } catch (calErr: unknown) {
      // נבלע בכוונה — המשימות כבר נוצרו בהצלחה
      calendar = { connected: false, synced: 0 };
      void calErr;
    }

    return NextResponse.json({
      ok: true,
      created: created.length,
      replaced,
      calendar,
      tasks: created.map((t) => ({ id: t.id, title: t.title })),
    });
  } catch (error) {
    return apiErrorResponse(error, "Project generate-gantt POST");
  }
});
