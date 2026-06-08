"use client";

import React from "react";
import {
  AlertCircle, Calendar, ChevronRight, Edit3, Layers, Loader2, Save, TrendingUp,
} from "lucide-react";
import { useTheme } from "next-themes";
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { DocumentLineItem, ErpDocument, PriceComparison } from "./useErpDocuments";

type Props = {
  selectedDoc: ErpDocument;
  priceComparison: PriceComparison | null;
  editingLineId: string | null;
  editValues: Partial<DocumentLineItem>;
  isUpdating: boolean;
  setSelectedDoc: (doc: ErpDocument | null) => void;
  setEditValues: React.Dispatch<React.SetStateAction<Partial<DocumentLineItem>>>;
  startEditing: (line: DocumentLineItem) => void;
  saveLineItem: (id: string) => void;
};

export function ErpDocumentDetail({
  selectedDoc, priceComparison,
  editingLineId, editValues, isUpdating,
  setSelectedDoc, setEditValues, startEditing, saveLineItem,
}: Props) {
  const { theme } = useTheme();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50">
        <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4 md:gap-0">
          <div>
            <button
              onClick={() => setSelectedDoc(null)}
              className="mb-4 flex items-center gap-2 text-sm text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] transition-colors"
            >
              <ChevronRight className="w-4 h-4 rtl:rotate-180" /> חזרה לרשימה
            </button>
            <h2 className="text-xl font-bold text-[color:var(--foreground-main)] mb-1">{selectedDoc.fileName}</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--foreground-muted)]">
              <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {new Date(selectedDoc.createdAt).toLocaleDateString("he-IL")}</span>
              <span className="flex items-center gap-1.5"><Layers className="w-4 h-4" /> {selectedDoc.type}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedDoc.status === "PROCESSED" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                {selectedDoc.status}
              </span>
            </div>
          </div>
          <div className="bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex flex-col items-end shadow-sm dark:shadow-none">
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider mb-1">סה&quot;כ מסמך</span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              ₪{(selectedDoc.lineItems?.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0) ?? 0).toLocaleString()}
            </span>
          </div>
        </div>

        {priceComparison ? (
          <div className="bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl p-4 shadow-sm dark:shadow-none">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-bold text-[color:var(--foreground-main)]">היסטוריית מחירים: {priceComparison.productName}</span>
              </div>
            </div>
            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={priceComparison.data}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === "dark" ? "#ffffff05" : "#00000005"} vertical={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: theme === "dark" ? "#0f172a" : "#ffffff", border: theme === "dark" ? "1px solid #ffffff10" : "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
                    itemStyle={{ color: "#10b981" }}
                  />
                  <Area type="monotone" dataKey="price" stroke="#10b981" fillOpacity={1} fill="url(#colorPrice)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}
      </div>

      {/* Line Items Table */}
      <div data-widget-scroll-pane className="custom-scrollbar p-4 md:p-6">
        <div className="overflow-x-auto min-w-0">
          <table className="w-full border-collapse min-w-[600px]">
            <thead>
              <tr className="text-right text-xs font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest border-b border-[color:var(--border-main)]/30">
                <th className="pb-3 pr-2 w-10">#</th>
                <th className="pb-3 pr-4 text-right">תיאור פריט</th>
                <th className="pb-3 px-4 text-center w-24">כמות</th>
                <th className="pb-3 px-4 text-center w-32">מחיר יחידה</th>
                <th className="pb-3 pl-4 text-left w-32">סה&quot;כ</th>
                <th className="pb-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border-main)]/30">
              {selectedDoc.lineItems?.map((item, index) => (
                <tr key={item.id} className={`group hover:bg-[color:var(--foreground-muted)]/5 transition-colors ${item.priceAlertPending ? "bg-amber-500/5" : ""}`}>
                  <td className="py-4 pr-2 text-xs text-[color:var(--foreground-muted)]">{index + 1}</td>
                  <td className="py-4 pr-4">
                    {editingLineId === item.id ? (
                      <input
                        className="w-full bg-[color:var(--surface-card)]/50 border border-emerald-500/50 rounded px-2 py-1 text-sm focus:outline-none text-[color:var(--foreground-main)] shadow-sm dark:shadow-none"
                        value={editValues.description ?? ""}
                        onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
                      />
                    ) : (
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-[color:var(--foreground-main)]">{item.description}</span>
                        {item.priceAlertPending ? (
                          <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                            <AlertCircle className="w-3 h-3" /> נדרש עדכון מחיר
                          </span>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="py-4 px-4 text-center">
                    {editingLineId === item.id ? (
                      <input type="number" inputMode="decimal"
                        className="w-16 bg-[color:var(--surface-card)]/50 border border-emerald-500/50 rounded px-2 py-1 text-sm text-center focus:outline-none text-[color:var(--foreground-main)] shadow-sm dark:shadow-none"
                        value={editValues.quantity ?? ""}
                        onChange={(e) => setEditValues((v) => ({ ...v, quantity: parseFloat(e.target.value) || 0 }))}
                      />
                    ) : (
                      <span className="text-sm text-[color:var(--foreground-muted)]">{item.quantity}</span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-center font-mono">
                    {editingLineId === item.id ? (
                      <input type="number" inputMode="decimal"
                        className="w-24 bg-[color:var(--surface-card)]/50 border border-emerald-500/50 rounded px-2 py-1 text-sm text-center focus:outline-none text-[color:var(--foreground-main)] shadow-sm dark:shadow-none"
                        value={editValues.unitPrice ?? ""}
                        onChange={(e) => setEditValues((v) => ({ ...v, unitPrice: parseFloat(e.target.value) || 0 }))}
                      />
                    ) : (
                      <span className="text-sm text-[color:var(--foreground-muted)]">₪{(item.unitPrice ?? 0).toLocaleString()}</span>
                    )}
                  </td>
                  <td className="py-4 pl-4 text-left font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    ₪{((editingLineId === item.id
                      ? (editValues.unitPrice ?? 0) * (editValues.quantity ?? 0)
                      : (item.lineTotal ?? 0)
                    )).toLocaleString()}
                  </td>
                  <td className="py-4 text-center">
                    <div className="flex justify-center gap-2">
                      {editingLineId === item.id ? (
                        <button onClick={() => saveLineItem(item.id)} disabled={isUpdating}
                          className="p-1.5 bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors">
                          {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-white" />}
                        </button>
                      ) : (
                        <button onClick={() => startEditing(item)}
                          className="p-1.5 hover:bg-[color:var(--foreground-muted)]/10 rounded-lg text-[color:var(--foreground-muted)] hover:text-emerald-600 dark:hover:text-emerald-400 transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
