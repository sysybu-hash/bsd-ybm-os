/**
 * Where an old notification should open.
 *
 * `linkType` was added to InAppNotification after the fact. Rows written before
 * it exist in every workspace and cannot be backfilled — nothing recorded what
 * they pointed at. Their text is the only clue left, so this reads it.
 *
 * Two things keep the guessing honest:
 *
 * - It is a fallback. A row that carries its own `linkType` never reaches here,
 *   and every writer that has a destination sets one now.
 * - The caller only consults it when there is a `targetId`. Admin broadcasts
 *   carry free text and no target, so keyword-matching them would open a widget
 *   the message never referred to — worse than not navigating at all.
 *
 * The keywords are Hebrew because the notification titles are: they are written
 * server-side as literals (`⚠️ זוהתה קפיצת מחיר בסריקה`), not through `t()`.
 * If those are ever localized this stops matching, which is the correct failure
 * — by then the rows will all carry a real `linkType`.
 */
export type NotificationTextFields = {
  title: string;
  message?: string;
  text?: string;
  description?: string;
};

/** Longest-standing first: a row mentioning both a project and a price is a price alert. */
const RULES: ReadonlyArray<{ linkType: string; keywords: readonly string[] }> = [
  { linkType: "erp", keywords: ["ERP", "מחיר"] },
  { linkType: "meckanoReports", keywords: ["מקאנו"] },
  { linkType: "projectBoard", keywords: ["פרויקט", "משימה"] },
];

export function inferNotificationLinkType(n: NotificationTextFields): string {
  const haystack = [n.title, n.message, n.text, n.description].filter(Boolean).join(" ");
  for (const rule of RULES) {
    if (rule.keywords.some((k) => haystack.includes(k))) return rule.linkType;
  }
  return "general";
}
