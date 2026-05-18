"use client";

import type { InvoiceExportPayload } from "@/lib/invoice-export-types";
import { documentTypeLabel } from "@/lib/document-types";
import { formatVatPercent } from "@/lib/vat-config";

function money(n: number) {
  return `₪${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DocumentPreview({ payload }: { payload: InvoiceExportPayload }) {
  const title = documentTypeLabel(payload.type);
  const vatPct = formatVatPercent(payload.vatRatePercent);

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-white text-slate-900 shadow-xl dark:bg-slate-950 dark:text-slate-100"
      dir="rtl"
    >
      <div className="bg-indigo-600 px-5 py-4">
        <h3 className="text-lg font-black text-white">{title}</h3>
        <p className="text-xs text-indigo-200">
          {payload.orgName ?? "BSD-YBM"} · מס׳ {payload.number || "טיוטה"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4">
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-[10px] font-bold uppercase text-slate-500">מאת</p>
          <p className="text-sm font-bold">{payload.orgName ?? "—"}</p>
          {payload.orgTaxId ? (
            <p className="text-xs text-slate-500">ח.פ: {payload.orgTaxId}</p>
          ) : null}
        </div>
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-[10px] font-bold uppercase text-slate-500">לכבוד</p>
          <p className="text-sm font-bold">{payload.clientName || "—"}</p>
          <p className="mt-1 text-xs text-slate-500">תאריך: {payload.date}</p>
        </div>
      </div>

      <div className="px-4 pb-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-500 dark:bg-slate-800">
              <th className="p-2 text-right">תיאור</th>
              <th className="p-2 text-center">כמות</th>
              <th className="p-2 text-center">מחיר</th>
              <th className="p-2 text-left">סה״כ</th>
            </tr>
          </thead>
          <tbody>
            {payload.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-400">
                  הוסף פריטים לתצוגה מקדימה
                </td>
              </tr>
            ) : (
              payload.items.map((item, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-2 text-right">{item.desc}</td>
                  <td className="p-2 text-center">{item.qty}</td>
                  <td className="p-2 text-center">{money(item.price)}</td>
                  <td className="p-2 text-left font-semibold">{money(item.qty * item.price)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mx-4 mb-4 max-w-xs rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
        <div className="flex justify-between text-slate-600 dark:text-slate-400">
          <span>לפני מע״מ</span>
          <span>{money(payload.amount)}</span>
        </div>
        <div className="mt-1 flex justify-between text-slate-600 dark:text-slate-400">
          <span>מע״מ ({vatPct}%)</span>
          <span>{money(payload.vat)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-black text-indigo-600 dark:border-slate-700">
          <span>סה״כ לתשלום</span>
          <span>{money(payload.total)}</span>
        </div>
      </div>
    </div>
  );
}
