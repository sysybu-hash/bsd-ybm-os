/**
 * מטפלי אוטומציה שפונים ל-API (בניגוד לניתוב פתיחת ווידג'ט טהור).
 * פוצל מ-registry.ts — ללא שינוי התנהגות.
 */
import type {
  AutomationAction,
  AutomationResult,
  AutomationRunnerDeps,
  CreateContactParams,
  CreateTaskParams,
  ParseActionResponse,
} from "@/lib/os-automations/types";

function mapTaskStatus(raw: unknown): string | undefined {
  const s = String(raw ?? "").toLowerCase();
  if (s === "todo" || s === "לביצוע") return "TODO";
  if (s === "in-progress" || s === "in_progress" || s === "בתהליך") return "IN_PROGRESS";
  if (s === "review" || s === "בביקורת") return "REVIEW";
  if (s === "done" || s === "הושלם") return "DONE";
  return undefined;
}

function mapTaskPriority(raw: unknown): string | undefined {
  const p = String(raw ?? "").toLowerCase();
  if (p === "low" || p === "נמוך") return "LOW";
  if (p === "high" || p === "גבוה") return "HIGH";
  if (p === "medium" || p === "בינוני") return "MEDIUM";
  return undefined;
}

export async function createTaskAction(
  p: CreateTaskParams,
  deps: AutomationRunnerDeps,
): Promise<AutomationResult> {
  const title = String(p.title ?? "").trim();
  const projectName = String(p.projectName ?? p.project ?? "כללי").trim();
  if (!title) return { ok: false, message: "חסר כותרת משימה" };
  try {
    const res = await fetch("/api/projects/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        title,
        projectName,
        status: mapTaskStatus(p.status) ?? "TODO",
        priority: mapTaskPriority(p.priority) ?? "MEDIUM",
        dueDate: p.dueDate,
        budget: p.budget,
      }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !data.success) {
      return { ok: false, message: data.error ?? "יצירת משימה נכשלה" };
    }
    deps.openWidget("projectsHub", { tab: "project", dashboardTab: "tasks" });
    const msg = `נוספה משימה «${title}» בפרויקט ${projectName}`;
    deps.setSystemMessage(msg);
    return { ok: true, message: msg };
  } catch {
    return { ok: false, message: "שגיאה ביצירת משימה" };
  }
}

export async function createContactAction(
  p: CreateContactParams,
  deps: AutomationRunnerDeps,
): Promise<AutomationResult> {
  const name = String(p.name ?? p.clientName ?? "").trim();
  if (!name) return { ok: false, message: "חסר שם לקוח" };
  try {
    const res = await fetch("/api/crm/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name,
        email: p.email ?? null,
        phone: p.phone ?? null,
        notes: p.notes ?? null,
      }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !data.success) {
      return { ok: false, message: data.error ?? "יצירת לקוח נכשלה" };
    }
    deps.openWidget("crmTable");
    const msg = `נוצר לקוח «${name}»`;
    deps.setSystemMessage(msg);
    return { ok: true, message: msg };
  } catch {
    return { ok: false, message: "שגיאה ביצירת לקוח" };
  }
}

/** מריץ פקודת משתמש חופשית דרך parse-action; `runPlan` מוזרק כדי למנוע מעגל ייבוא. */
export async function executeUserCommandAction(
  params: Record<string, unknown>,
  deps: AutomationRunnerDeps,
  runPlan: (actions: AutomationAction[], deps: AutomationRunnerDeps) => Promise<AutomationResult[]>,
): Promise<AutomationResult> {
  const message = String(params.message ?? params.command ?? "").trim();
  if (!message) return { ok: false, message: "חסרה פקודה" };
  try {
    const res = await fetch("/api/os/assistant/parse-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ message }),
    });
    if (!res.ok) return { ok: false, message: "לא ניתן לפרש את הבקשה" };
    const data = (await res.json()) as ParseActionResponse & { error?: string };
    if (data.error) return { ok: false, message: data.error };
    if (data.actions?.length) {
      const results = await runPlan(data.actions, deps);
      const failed = results.filter((r) => !r.ok);
      const reply = data.reply?.trim();
      if (reply) deps.setSystemMessage(reply);
      if (failed.length > 0) {
        return { ok: false, message: reply ?? "חלק מהפעולות נכשלו" };
      }
      return { ok: true, message: reply ?? `בוצעו ${data.actions.length} פעולות` };
    }
    if (data.reply?.trim()) {
      deps.setSystemMessage(data.reply.trim());
      return { ok: true, message: data.reply.trim() };
    }
    return { ok: false, message: "לא זוהתה פעולה לביצוע" };
  } catch {
    return { ok: false, message: "שגיאה בביצוע הפקודה" };
  }
}

export async function searchClientAction(
  params: Record<string, unknown>,
  deps: AutomationRunnerDeps,
): Promise<AutomationResult> {
  const q = String(params.query ?? params.clientName ?? "").trim();
  if (!q) return { ok: false };
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    if (results[0]?.type === "project") {
      deps.openWidget("project", { name: results[0].name });
    } else {
      deps.openWidget("crmTable");
    }
  } catch {
    return { ok: false };
  }
  return { ok: true };
}
