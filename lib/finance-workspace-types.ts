/** שורות טבלה במסך כספים — נטענות בשרת ומועברות לרכיב לקוח */

export type FinanceIssuedRow = {
  id: string;
  type: string;
  number: number;
  status: string;
  clientName: string;
  total: number;
  date: string;
  contactId: string | null;
  /** שם פרויקט מ-CRM כשהמסמך מקושר ללקוח עם פרויקט */
  projectName: string | null;
  projectId: string | null;
  contactEmail: string | null;
};

export type FinanceExpenseRow = {
  id: string;
  vendorName: string;
  invoiceNumber: string | null;
  description: string | null;
  expenseDate: string;
  total: number;
  amountNet: number;
  vat: number;
  allocation: string;
  status: string;
  projectId: string | null;
  contactId: string | null;
  projectName: string | null;
  contactName: string | null;
};

export type FinanceSelectOption = { id: string; name: string };
