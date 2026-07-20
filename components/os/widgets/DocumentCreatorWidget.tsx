"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React from "react";
import { ISSUED_DOCUMENT_TYPES } from "@/lib/document-types";
import { previewPayloadFromDraft } from "@/lib/invoice-payload";
import { formatVatPercent } from "@/lib/vat-config";
import InvoiceDocumentView from "@/components/os/widgets/invoice/InvoiceDocumentView";
import DocumentPreview from "@/components/os/widgets/invoice/DocumentPreview";
import DocumentClientPicker from "@/components/os/widgets/invoice/DocumentClientPicker";
import OsFloatingPanel from "@/components/os/layout/OsFloatingPanel";
import { Calendar, CreditCard, Loader2, Send } from "lucide-react";
import KnowledgeVaultAttachButton from "@/components/os/knowledge-vault/KnowledgeVaultAttachButton";
import { toast } from "sonner";
import type { DocType } from "@prisma/client";
import { WidgetColumns } from "@/components/os/layout/WidgetCanvas";
import { useDocumentCreator } from "./document-creator/useDocumentCreator";
import { IssuedDocumentsList } from "./document-creator/IssuedDocumentsList";
import { DocItemsForm } from "./document-creator/DocItemsForm";
import { DocGeneratedSuccess } from "./document-creator/DocGeneratedSuccess";
import type { DocumentCreatorWidgetProps } from "./document-creator/types";

export default function DocumentCreatorWidget({ liveData = null, embeddedInHub = false }: DocumentCreatorWidgetProps) {
  const { dir, t } = useI18n();
  const d = useDocumentCreator(liveData);

  // ── issued doc deep-link ──────────────────────────────────────────────────
  if (d.issuedDocumentId) {
    return (
      <InvoiceDocumentView
        issuedDocumentId={d.issuedDocumentId}
        onDeleted={() => { d.setGeneratedDoc(null); d.navigateIssued(null); }}
      />
    );
  }

  // ── success screen ────────────────────────────────────────────────────────
  if (d.generatedDoc) {
    return (
      <DocGeneratedSuccess
        generatedDoc={d.generatedDoc}
        docTypeLabel={d.selectedTypeMeta?.labelHe ?? "מסמך"}
        onDownloadPDF={() => void d.downloadPDF()}
        onReset={() => { d.setGeneratedDoc(null); d.navigateIssued(null); }}
      />
    );
  }

  const billing = d.calculateBilling();

  // ── main form ─────────────────────────────────────────────────────────────
  return (
    <div
      data-widget-sticky-chrome={embeddedInHub ? undefined : true}
      data-embedded-in-hub={embeddedInHub ? "true" : undefined}
      data-hub-inner-scroll={embeddedInHub ? "true" : undefined}
      className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)]"
      dir={dir}
    >
      {/* Header — compact single row. Inside the hub the tab bar already gives
          context, so we drop the large title/caption to reclaim vertical space. */}
      <div className="shrink-0 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 px-3 py-2 sm:px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <select
            value={d.docType}
            onChange={(e) => d.setDocType(e.target.value as DocType)}
            className="max-w-[200px] rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 px-2.5 py-1.5 text-xs font-bold text-[color:var(--foreground-main)]"
          >
            {ISSUED_DOCUMENT_TYPES.map((dt) => (
              <option key={dt.id} value={dt.id}>{dt.labelHe}</option>
            ))}
          </select>
          <h2 className="truncate text-sm font-bold text-[color:var(--foreground-main)]">
            מחולל מסמכים חכם
          </h2>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <KnowledgeVaultAttachButton onSelect={(item) => toast.success(`${t("workspaceWidgets.documentCreator.selectedFromVault")}: ${item.name}`)} />
          <div className="text-end leading-tight">
            <span className="block text-[9px] font-bold text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.documentCreator.preVatLabel", { vat: String(formatVatPercent(d.vatRatePercent)) })}
              {" · "}
              {t("workspaceWidgets.documentCreator.vatAmountLabel", { amount: billing.vat.toLocaleString() })}
            </span>
            <span className="text-lg font-black text-[color:var(--accent)] dark:text-emerald-400">
              ₪{billing.total.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable body — container query host: reflows to the WINDOW width */}
      <div
        data-widget-scroll-pane={embeddedInHub ? undefined : true}
        className="widget-canvas custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3 sm:p-6 [-webkit-overflow-scrolling:touch]"
      >
        <div className="mx-auto w-full max-w-[100rem] space-y-4 @2xl:space-y-6">
          <IssuedDocumentsList
            issuedList={d.issuedList}
            issuedListLoading={d.issuedListLoading}
            onOpen={(id) => d.navigateIssued(id)}
            onRefresh={() => void d.fetchIssuedDocuments()}
          />

          {/* Narrow window → single column. Wide window → form + sticky preview. */}
          <WidgetColumns splitAt="@2xl" template="3-2" className="items-start">
            {/* Form column */}
            <div className="min-w-0 space-y-4 @2xl:space-y-6">
              <DocumentClientPicker
                contacts={d.contacts}
                loading={d.fetchingContacts}
                name={d.clientNameInput}
                selectedContactId={d.selectedContactId}
                isNewClient={d.isNewClient}
                newClient={d.newClient}
                onNameChange={d.setClientNameInput}
                onSelectContact={(c) => { d.setSelectedContactId(c.id); d.setClientNameInput(c.name); }}
                onNewClientChange={(patch) => d.setNewClient((prev) => ({ ...prev, ...patch }))}
                onIsNewClientChange={d.setIsNewClient}
              />

              <DocItemsForm
                items={d.items}
                onAdd={d.addItem}
                onRemove={d.removeItem}
                onUpdate={d.updateItem}
              />

              {/* Number + dates */}
              <section className="grid grid-cols-1 @lg:grid-cols-3 gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">3</div>
                    <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">מספר מסמך</h3>
                  </div>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={d.documentNumberInput}
                    onChange={(e) => d.setDocumentNumberInput(e.target.value)}
                    placeholder={d.suggestedNumber != null ? String(d.suggestedNumber) : "אוטומטי"}
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-[color:var(--foreground-main)]"
                  />
                  <p className="mt-1.5 text-[10px] text-[color:var(--foreground-muted)]">
                    מתמלא אוטומטית — ניתן לשנות ידנית
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">4</div>
                    <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">תאריך הנפקה</h3>
                  </div>
                  <div className="relative">
                    <Calendar className="absolute right-3 top-3 w-4 h-4 text-[color:var(--foreground-muted)]" />
                    <input
                      type="date"
                      value={d.issueDate}
                      onChange={(e) => d.setIssueDate(e.target.value)}
                      className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-3 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-[color:var(--foreground-main)]"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">5</div>
                    <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">תאריך פירעון</h3>
                  </div>
                  <div className="relative">
                    <Calendar className="absolute right-3 top-3 w-4 h-4 text-[color:var(--foreground-muted)]" />
                    <input
                      type="date"
                      value={d.dueDate}
                      onChange={(e) => d.setDueDate(e.target.value)}
                      className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-3 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-[color:var(--foreground-main)]"
                    />
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">6</div>
                    <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">אמצעי תשלום</h3>
                  </div>
                  <div className="relative">
                    <CreditCard className="absolute right-3 top-3 w-4 h-4 text-[color:var(--foreground-muted)]" />
                    <select className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-3 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 appearance-none text-[color:var(--foreground-main)]">
                      <option>PayPlus (אשראי)</option>
                      <option>העברה בנקאית</option>
                      <option>צ&apos;ק / מזומן</option>
                    </select>
                  </div>
                </div>
              </section>
            </div>

            {/* Preview column — sticks beside the form on wide windows */}
            <section className="min-w-0 @2xl:sticky @2xl:top-0 @2xl:self-start">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">7</div>
                <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">תצוגה מקדימה</h3>
              </div>
              {d.selectedTypeMeta ? (
                <p className="mb-3 text-xs text-[color:var(--foreground-muted)]">{d.selectedTypeMeta.descriptionHe}</p>
              ) : null}
              <DocumentPreview
                payload={previewPayloadFromDraft({
                  type: d.docType,
                  number: d.previewNumber,
                  clientName: d.clientNameInput.trim() || d.contacts.find((c) => c.id === d.selectedContactId)?.name || "",
                  items: d.items.map((i) => ({ desc: i.description, qty: i.quantity, price: i.price })),
                  net: billing.net,
                  vat: billing.vat,
                  total: billing.total,
                  vatRatePercent: d.vatRatePercent,
                  orgName: d.orgSettings?.name ?? "BSD-YBM",
                  orgTaxId: d.orgSettings?.taxId,
                  orgCompanyType: d.orgSettings?.companyType,
                  issueDate: d.issueDate,
                  dueDate: d.dueDate,
                })}
              />
            </section>
          </WidgetColumns>
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/50">
        <button
          type="button"
          onClick={() => void d.generateDocument()}
          disabled={d.loading || !d.clientNameInput.trim()}
          className="w-full h-14 bg-[color:var(--accent)] hover:bg-[color:var(--accent-strong)] disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 text-white font-black text-lg rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3"
        >
          {d.loading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <>הפק {d.selectedTypeMeta?.labelHe ?? "מסמך"} <Send className="w-5 h-5" /></>
          )}
        </button>
      </div>

      {/* Draft panel */}
      <OsFloatingPanel
        open={d.showDraft}
        onClose={() => d.setShowDraft(false)}
        onExitComplete={d.onDraftPanelExitComplete}
        title={t("workspaceWidgets.docCreator.draftTitle")}
      >
        <div className="space-y-4 text-sm text-[color:var(--foreground-main)]">
          <p>
            <span className="font-bold">
              {d.clientNameInput.trim() || d.contacts.find((c) => c.id === d.selectedContactId)?.name}
            </span>
            {" · "}
            {d.selectedTypeMeta?.labelHe ?? d.docType}
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-[color:var(--foreground-muted)]">
            {d.items.map((item) => (
              <li key={item.id}>
                {item.description || "—"} × {item.quantity} = ₪{(item.quantity * item.price).toLocaleString()}
              </li>
            ))}
          </ul>
          <p className="text-sm text-[color:var(--foreground-muted)]">
            לפני מע״מ: ₪{billing.net.toLocaleString()} · מע״מ ({formatVatPercent(d.vatRatePercent)}%): ₪{billing.vat.toLocaleString()}
          </p>
          <p className="text-lg font-black text-[color:var(--accent)] dark:text-emerald-400">
            ₪{billing.total.toLocaleString()}
          </p>
          <button
            type="button"
            onClick={() => void d.generateDocument()}
            className="w-full rounded-xl bg-[color:var(--accent)] py-3 text-sm font-bold text-white hover:opacity-90"
          >
            {t("workspaceWidgets.docCreator.draftConfirm")}
          </button>
        </div>
      </OsFloatingPanel>
    </div>
  );
}
