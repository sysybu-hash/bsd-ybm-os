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
import { useDocumentCreator } from "./document-creator/useDocumentCreator";
import { IssuedDocumentsList } from "./document-creator/IssuedDocumentsList";
import { DocItemsForm } from "./document-creator/DocItemsForm";
import { DocGeneratedSuccess } from "./document-creator/DocGeneratedSuccess";
import type { DocumentCreatorWidgetProps } from "./document-creator/types";

export default function DocumentCreatorWidget({ liveData = null }: DocumentCreatorWidgetProps) {
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
    <div className="flex h-full min-h-0 flex-col bg-transparent text-[color:var(--foreground-main)] overflow-x-hidden" dir={dir}>
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-[color:var(--border-main)] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-[color:var(--background-main)]/50">
        <div className="flex items-center gap-3 min-w-0">
          <select
            value={d.docType}
            onChange={(e) => d.setDocType(e.target.value as DocType)}
            className="w-full max-w-[200px] rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 px-3 py-2 text-xs font-bold text-[color:var(--foreground-main)]"
          >
            {ISSUED_DOCUMENT_TYPES.map((dt) => (
              <option key={dt.id} value={dt.id}>{dt.labelHe}</option>
            ))}
          </select>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[color:var(--foreground-main)] md:text-lg">מחולל מסמכים חכם</h2>
            <p className="text-[10px] text-[color:var(--foreground-muted)] uppercase tracking-widest font-bold">BSD-YBM Financial Engine</p>
          </div>
        </div>
        <div className="flex flex-row items-center justify-between gap-4 sm:flex-col sm:items-end">
          <KnowledgeVaultAttachButton onSelect={(item) => toast.success(`${t("workspaceWidgets.documentCreator.selectedFromVault")}: ${item.name}`)} />
          <div className="text-left space-y-0.5">
            <span className="text-[10px] font-bold text-[color:var(--foreground-muted)] block">
              {t("workspaceWidgets.documentCreator.preVatLabel", { vat: String(formatVatPercent(d.vatRatePercent)) })}
            </span>
            <span className="text-xs text-[color:var(--foreground-muted)]">{t("workspaceWidgets.documentCreator.vatAmountLabel", { amount: billing.vat.toLocaleString() })}</span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 block">
              ₪{billing.total.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-4 sm:p-6 sm:space-y-8">
        <IssuedDocumentsList
          issuedList={d.issuedList}
          issuedListLoading={d.issuedListLoading}
          onOpen={(id) => d.navigateIssued(id)}
          onRefresh={() => void d.fetchIssuedDocuments()}
        />

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

        {/* Additional settings */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">3</div>
              <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">תאריך פירעון</h3>
            </div>
            <div className="relative">
              <Calendar className="absolute right-3 top-3 w-4 h-4 text-[color:var(--foreground-muted)]" />
              <input type="date" className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-3 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-[color:var(--foreground-main)]"
                defaultValue={new Date().toISOString().split("T")[0]} />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">4</div>
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

        {/* Preview */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">5</div>
            <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">תצוגה מקדימה</h3>
          </div>
          {d.selectedTypeMeta ? (
            <p className="mb-3 text-xs text-[color:var(--foreground-muted)]">{d.selectedTypeMeta.descriptionHe}</p>
          ) : null}
          <DocumentPreview
            payload={previewPayloadFromDraft({
              type: d.docType,
              clientName: d.clientNameInput.trim() || d.contacts.find((c) => c.id === d.selectedContactId)?.name || "",
              items: d.items.map((i) => ({ desc: i.description, qty: i.quantity, price: i.price })),
              net: billing.net,
              vat: billing.vat,
              total: billing.total,
              vatRatePercent: d.vatRatePercent,
              orgName: d.orgSettings?.name ?? "BSD-YBM",
              orgTaxId: d.orgSettings?.taxId,
            })}
          />
        </section>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/50">
        <button
          type="button"
          onClick={() => void d.generateDocument()}
          disabled={d.loading || !d.clientNameInput.trim()}
          className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 text-white font-black text-lg rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3"
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
          <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
            ₪{billing.total.toLocaleString()}
          </p>
          <button
            type="button"
            onClick={() => void d.generateDocument()}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-500"
          >
            {t("workspaceWidgets.docCreator.draftConfirm")}
          </button>
        </div>
      </OsFloatingPanel>
    </div>
  );
}
