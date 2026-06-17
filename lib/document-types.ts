import type { DocType } from "@prisma/client";

export type DocumentTypeOption = {
  id: DocType;
  labelHe: string;
  descriptionHe: string;
  color: "indigo" | "emerald" | "amber" | "sky" | "violet" | "rose";
};

export const ISSUED_DOCUMENT_TYPES: DocumentTypeOption[] = [
  {
    id: "QUOTE",
    labelHe: "הצעת מחיר",
    descriptionHe: "הצעה ללקוח לפני התחייבות — ללא חובת מספר הקצאה",
    color: "indigo",
  },
  {
    id: "TRANSACTION_INVOICE",
    labelHe: "חשבונית עסקה",
    descriptionHe: "חשבונית על עסקה — לפני או במקום חשבונית מס (מעל הסף: מספר הקצאה)",
    color: "sky",
  },
  {
    id: "INVOICE",
    labelHe: "חשבונית מס",
    descriptionHe: "חשבונית מס רשמית — מעל הסף חובת מספר הקצאה",
    color: "emerald",
  },
  {
    id: "INVOICE_RECEIPT",
    labelHe: "חשבונית מס וקבלה",
    descriptionHe: "חשבונית מס המשמשת גם כקבלה על תשלום",
    color: "violet",
  },
  {
    id: "RECEIPT",
    labelHe: "קבלה",
    descriptionHe: "אישור על קבלת תשלום — ללא מספר הקצאה",
    color: "amber",
  },
  {
    id: "CREDIT_NOTE",
    labelHe: "חשבונית זיכוי",
    descriptionHe: "זיכוי / ביטול חלקי או מלא של חשבונית קודמת",
    color: "rose",
  },
  {
    id: "PURCHASE_ORDER",
    labelHe: "הזמנת רכש",
    descriptionHe: "הזמנה רשמית לספק — מסמך רכש ממותג",
    color: "sky",
  },
];

export function documentTypeLabel(type: string): string {
  return ISSUED_DOCUMENT_TYPES.find((d) => d.id === type)?.labelHe ?? type;
}
