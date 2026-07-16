"use client";

import type { InvoiceExportPayload } from "@/lib/invoice-export-types";
import { documentTypeLabel } from "@/lib/document-types";
import { formatVatPercent } from "@/lib/vat-config";
import { useI18n } from "@/components/os/system/I18nProvider";
import { intlLocaleForApp } from "@/lib/i18n/intl-locale";
import { isRtlLocale, type AppLocale } from "@/lib/i18n/config";

export default function DocumentPreview({ payload }: { payload: InvoiceExportPayload }) {
  const { t, locale } = useI18n();
  const intlLocale = intlLocaleForApp(locale as AppLocale);
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";

  const money = (n: number) =>
    `₪${n.toLocaleString(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const title = documentTypeLabel(payload.type);
  const vatPct = formatVatPercent(payload.vatRatePercent);
  const docNumber = payload.number || t("workspaceWidgets.documentPreview.draft");

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-white text-slate-900 shadow-xl dark:bg-slate-950 dark:text-slate-100"
      dir={dir}
    >
      <div className="bg-[color:var(--win-accent,#6366f1)] px-5 py-4">
        <h3 className="text-lg font-black text-white">{title}</h3>
        <p className="text-xs text-indigo-700 dark:text-indigo-200">
          {payload.orgName ?? "BSD-YBM"} · {t("workspaceWidgets.documentPreview.numberPrefix")} {docNumber}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4">
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-[10px] font-bold uppercase text-slate-500">{t("workspaceWidgets.documentPreview.fromLabel")}</p>
          <p className="text-sm font-bold">{payload.orgName ?? "—"}</p>
          {payload.orgTaxIdLine ? (
            <p className="text-xs text-slate-500">{payload.orgTaxIdLine}</p>
          ) : null}
        </div>
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-[10px] font-bold uppercase text-slate-500">{t("workspaceWidgets.documentPreview.toLabel")}</p>
          <p className="text-sm font-bold">{payload.clientName || "—"}</p>
          <p className="mt-1 text-xs text-slate-500">
            {t("workspaceWidgets.documentPreview.dateLabel")} {payload.date}
          </p>
        </div>
      </div>

      <div className="px-4 pb-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-500 dark:bg-slate-800">
              <th className="p-2 text-right">{t("workspaceWidgets.documentPreview.colDescription")}</th>
              <th className="p-2 text-center">{t("workspaceWidgets.documentPreview.colQty")}</th>
              <th className="p-2 text-center">{t("workspaceWidgets.documentPreview.colPrice")}</th>
              <th className="p-2 text-left">{t("workspaceWidgets.documentPreview.colTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {payload.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-400">
                  {t("workspaceWidgets.documentPreview.emptyItems")}
                </td>
              </tr>
            ) : (
              payload.items.map((item, i) => (
                <tr key={`${item.desc}-${i}`} className="border-b border-slate-100 dark:border-slate-800">
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
          <span>{t("workspaceWidgets.documentPreview.subtotalBeforeVat")}</span>
          <span>{money(payload.amount)}</span>
        </div>
        <div className="mt-1 flex justify-between text-slate-600 dark:text-slate-400">
          <span>{t("workspaceWidgets.documentPreview.vatLabel", { percent: vatPct })}</span>
          <span>{money(payload.vat)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-black text-[color:var(--win-accent,#6366f1)] dark:border-slate-700">
          <span>{t("workspaceWidgets.documentPreview.totalDue")}</span>
          <span>{money(payload.total)}</span>
        </div>
      </div>
    </div>
  );
}
