/**
 * שני גרשיים ASCII ('') — נתמך ב-Noto/Arial ב-PDF; גרש עברי U+05F3 עלול להופיע כריבוע.
 */
export const LBL_BEFORE_VAT = "לפני מע''מ";
export const LBL_VAT = "מע''מ";
export const LBL_TOTAL = "סה''כ";
export const LBL_DOC_NUM = "מסמך מס''";
export function formatMoney(n: number): string {
  const amount = Number.isFinite(n) ? n : 0;
  return amount.toLocaleString("en-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** סכום מבודד ל-RTL — מונע היפוך ל־.00₪852 */
export function moneyHtml(n: number): string {
  return `<bdi class="money" dir="ltr">₪${formatMoney(n)}</bdi>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
