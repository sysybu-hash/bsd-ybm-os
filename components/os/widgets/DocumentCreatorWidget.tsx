"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { DocType } from "@prisma/client";
import { ISSUED_DOCUMENT_TYPES, documentTypeLabel } from "@/lib/document-types";
import { previewPayloadFromDraft } from "@/lib/invoice-payload";
import { calculateTotals, COMPANY_TYPE } from "@/lib/billing-calculations";
import { formatVatPercent, resolveVatRatePercent } from "@/lib/vat-config";
import InvoiceDocumentView from "@/components/os/widgets/invoice/InvoiceDocumentView";
import DocumentPreview from "@/components/os/widgets/invoice/DocumentPreview";
import OsFloatingPanel, {
  FLOATING_PANEL_EXIT_MS,
  waitForFloatingPanelExit,
} from "@/components/os/layout/OsFloatingPanel";
import { 
  FilePlus, 
  User, 
  Plus, 
  Trash2, 
  Send, 
  CheckCircle2, 
  Loader2, 
  Copy, 
  ExternalLink, 
  FileText, 
  CreditCard, 
  Calendar,
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import { downloadIssuedDocumentExport } from "@/lib/invoice-download-client";
interface Contact {
  id: string;
  name: string;
  email: string | null;
}

interface DocItem {
  id: string;
  description: string;
  quantity: number;
  price: number;
}

type DocumentCreatorWidgetProps = {
  liveData?: Record<string, unknown> | null;
};

export default function DocumentCreatorWidget({ liveData = null }: DocumentCreatorWidgetProps) {
  const { dir, t } = useI18n();
  const [showDraft, setShowDraft] = useState(false);
  const [docType, setDocType] = useState<DocType>("QUOTE");
  const [orgSettings, setOrgSettings] = useState<{
    name: string;
    taxId: string;
    email: string;
    vatRatePercent: number;
    companyType?: string;
  } | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [items, setItems] = useState<DocItem[]>([
    { id: '1', description: '', quantity: 1, price: 0 }
  ]);
  const [loading, setLoading] = useState(false);
  const [fetchingContacts, setFetchingContacts] = useState(true);
  const [generatedDoc, setGeneratedDoc] = useState<{
    id?: string;
    token: string;
    documentNumber: number;
    signUrl: string;
    paymentLink?: string;
    clientName: string;
    items: DocItem[];
    amount: number;
  } | null>(null);

  const [openIssuedId, setOpenIssuedId] = useState<string | null>(null);
  const [issuedList, setIssuedList] = useState<
    Array<{
      id: string;
      type: DocType;
      number: number;
      clientName: string;
      total: number;
      date: string;
    }>
  >([]);
  const [issuedListLoading, setIssuedListLoading] = useState(true);
  const draftPanelExitRef = useRef<(() => void) | null>(null);

  const closeDraftPanel = useCallback((): Promise<void> => {
    if (!showDraft) return Promise.resolve();
    return new Promise((resolve) => {
      draftPanelExitRef.current = resolve;
      setShowDraft(false);
      window.setTimeout(() => {
        if (!draftPanelExitRef.current) return;
        draftPanelExitRef.current();
        draftPanelExitRef.current = null;
      }, FLOATING_PANEL_EXIT_MS + 80);
    });
  }, [showDraft]);

  const onDraftPanelExitComplete = useCallback(() => {
    draftPanelExitRef.current?.();
    draftPanelExitRef.current = null;
  }, []);

  const issuedDocumentId =
    typeof liveData?.issuedDocumentId === "string"
      ? liveData.issuedDocumentId
      : openIssuedId;

  useEffect(() => {
    fetchContacts();
    fetchOrgSettings();
    void fetchIssuedDocuments();
  }, []);

  const fetchIssuedDocuments = async () => {
    try {
      setIssuedListLoading(true);
      const res = await fetch("/api/erp/issued-documents", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        documents?: Array<{
          id: string;
          type: DocType;
          number: number;
          clientName: string;
          total: number;
          date: string;
        }>;
      };
      setIssuedList(data.documents ?? []);
    } catch {
      /* רשימה אופציונלית */
    } finally {
      setIssuedListLoading(false);
    }
  };

  useEffect(() => {
    if (liveData?.automation !== "invoice_draft") return;
    const dt = liveData.docType;
    if (typeof dt === "string" && ISSUED_DOCUMENT_TYPES.some((d) => d.id === dt)) {
      setDocType(dt as DocType);
    } else if (dt === "quote") {
      setDocType("QUOTE");
    } else if (dt === "invoice") {
      setDocType("INVOICE");
    }
    const contactName = liveData.contactName;
    if (typeof contactName === "string" && contactName) {
      setContacts((prev) => {
        const exists = prev.find((c) => c.name === contactName);
        if (exists) {
          setSelectedContactId(exists.id);
          return prev;
        }
        const id = `draft-${Date.now()}`;
        setSelectedContactId(id);
        return [...prev, { id, name: contactName, email: null }];
      });
    }
    if (typeof liveData.contactId === "string") setSelectedContactId(liveData.contactId);
    const draftItems = liveData.items;
    if (Array.isArray(draftItems) && draftItems.length > 0) {
      setItems(
        draftItems.map((row, i) => {
          const r = row as { description?: string; desc?: string; quantity?: number; qty?: number; price?: number };
          return {
            id: String(i + 1),
            description: String(r.description ?? r.desc ?? ""),
            quantity: Number(r.quantity ?? r.qty) || 1,
            price: Number(r.price) || 0,
          };
        }),
      );
    }
  }, [liveData]);

  const fetchOrgSettings = async () => {
    try {
      const res = await fetch('/api/organization', { credentials: 'include' });
      const data = await res.json();
      setOrgSettings({
        name: data.name || "BSD-YBM תשתיות",
        taxId: data.taxId || "",
        email: data.paypalMerchantEmail || data.adminEmail || "",
        vatRatePercent: resolveVatRatePercent(data.vatRatePercent),
        companyType: data.companyType,
      });
    } catch (err) {
      console.error('Failed to fetch org settings:', err);
    }
  };

  const fetchContacts = async () => {
    try {
      const res = await fetch('/api/crm/contacts');
      const data = await res.json();
      const rows = Array.isArray(data.contacts) ? data.contacts : [];
      setContacts(rows.map((c: { id: string; name: string; email?: string | null }) => ({
        id: c.id,
        name: c.name,
        email: c.email
      })));
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    } finally {
      setFetchingContacts(false);
    }
  };

  const addItem = () => {
    setItems([...items, { id: Math.random().toString(36).substr(2, 9), description: '', quantity: 1, price: 0 }]);
  };

  const removeItem = (id: string) => {
    if (items.length === 1) return;
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, field: keyof DocItem, value: string | number) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const vatRatePercent = orgSettings?.vatRatePercent ?? 18;

  const calculateSubtotal = () =>
    items.reduce((sum, item) => sum + item.quantity * item.price, 0);

  const calculateBilling = () => {
    const net = calculateSubtotal();
    const companyType =
      orgSettings?.companyType === COMPANY_TYPE.EXEMPT_DEALER
        ? COMPANY_TYPE.EXEMPT_DEALER
        : COMPANY_TYPE.LICENSED_DEALER;
    return calculateTotals(net, companyType, vatRatePercent);
  };

  const selectedTypeMeta = ISSUED_DOCUMENT_TYPES.find((d) => d.id === docType);

  const generateDocument = async () => {
    const contact = contacts.find(c => c.id === selectedContactId);
    if (!contact) {
      toast.error('אנא בחר לקוח');
      return;
    }

    if (items.some(item => !item.description || item.price <= 0)) {
      toast.error('אנא מלא את כל פרטי הפריטים');
      return;
    }

    setLoading(true);
    try {
      await closeDraftPanel();
      const res = await fetch("/api/erp/issued-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: docType,
          contactId: selectedContactId.startsWith("draft-") ? undefined : selectedContactId,
          clientName: contact.name,
          items: items.map((i) => ({ desc: i.description, qty: i.quantity, price: i.price })),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const result = data.document ?? data;
        await waitForFloatingPanelExit(FLOATING_PANEL_EXIT_MS + 80);
        setGeneratedDoc({
          id: result.id,
          token: result.token ?? "",
          documentNumber: result.number ?? result.documentNumber,
          signUrl: data.signUrl ?? "",
          clientName: contact.name,
          items,
          amount: calculateSubtotal(),
        });
        setOpenIssuedId(result.id);
        if (data.itaError) {
          toast.warning(`המסמך הופק; מספר הקצאה: ${data.itaError}`);
        }
        toast.success(`${selectedTypeMeta?.labelHe ?? "המסמך"} הופק בהצלחה`);
        void fetchIssuedDocuments();
      } else {
        toast.error(data.error || 'שגיאה בהפקת המסמך');
      }
    } catch (error) {
      toast.error('שגיאה בחיבור לשרת');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!generatedDoc?.id) {
      toast.error("יש להפיק את המסמך לפני הורדת PDF");
      return;
    }
    const result = await downloadIssuedDocumentExport(generatedDoc.id, "pdf");
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("PDF הורד בהצלחה");
  };

  if (issuedDocumentId) {
    return (
      <InvoiceDocumentView
        issuedDocumentId={issuedDocumentId}
        onDeleted={() => {
          setGeneratedDoc(null);
          setOpenIssuedId(null);
        }}
      />
    );
  }

  if (generatedDoc) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 bg-transparent text-[color:var(--foreground-main)]" dir={dir}>
        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-2xl font-bold mb-2 text-[color:var(--foreground-main)]">{selectedTypeMeta?.labelHe ?? "מסמך"} #{generatedDoc.documentNumber} הופק!</h2>
        <p className="text-[color:var(--foreground-muted)] mb-8 text-center">המסמך נשמר בבסיס הנתונים ומוכן להורדה או לשליחה.</p>

        <div className="w-full max-w-md space-y-4">
          <button 
            onClick={downloadPDF}
            className="w-full py-4 bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80 border border-[color:var(--border-main)] rounded-2xl font-bold transition-all flex items-center justify-center gap-3 text-[color:var(--foreground-main)] shadow-sm dark:shadow-none"
          >
            <Download size={20} className="text-blue-600 dark:text-blue-400" /> הורד קובץ PDF
          </button>

          <div className="bg-[color:var(--background-main)]/50 border border-[color:var(--border-main)] rounded-2xl p-4 shadow-sm dark:shadow-none">
            <label className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest block mb-2">קישור לחתימה דיגיטלית</label>
            <div className="flex gap-2">
              <input readOnly value={generatedDoc.signUrl || '#'} className="flex-1 bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-lg px-3 py-2 text-xs text-[color:var(--foreground-muted)] outline-none" />
              <button onClick={() => { navigator.clipboard.writeText(generatedDoc.signUrl || ''); toast.success('הועתק'); }} className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors border border-emerald-500/20">
                <Copy size={16} />
              </button>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              onClick={() => {
                setGeneratedDoc(null);
                setOpenIssuedId(null);
              }}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-all"
            >
              הפק מסמך חדש
            </button>
            {generatedDoc.signUrl && (
              <a href={generatedDoc.signUrl} target="_blank" className="p-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl transition-all flex items-center justify-center"><ExternalLink size={20} /></a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-transparent text-[color:var(--foreground-main)] overflow-hidden" dir={dir}>
      {/* Header */}
      <div className="p-6 border-b border-[color:var(--border-main)] flex justify-between items-center bg-[color:var(--background-main)]/50">
        <div className="flex items-center gap-4">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
            className="max-w-[220px] rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 px-3 py-2 text-xs font-bold text-[color:var(--foreground-main)]"
          >
            {ISSUED_DOCUMENT_TYPES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.labelHe}
              </option>
            ))}
          </select>
          <div>
            <h2 className="text-lg font-bold text-[color:var(--foreground-main)]">מחולל מסמכים חכם</h2>
            <p className="text-[10px] text-[color:var(--foreground-muted)] uppercase tracking-widest font-bold">BSD-YBM Financial Engine</p>
          </div>
        </div>
        <div className="text-left space-y-0.5">
          <span className="text-[10px] font-bold text-[color:var(--foreground-muted)] block">
            לפני מע״מ · מע״מ {formatVatPercent(vatRatePercent)}%
          </span>
          <span className="text-xs text-[color:var(--foreground-muted)]">
            מע״מ: ₪{calculateBilling().vat.toLocaleString()}
          </span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 block">
            ₪{calculateBilling().total.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
        <section className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-bold text-[color:var(--foreground-main)]">מסמכים שהונפקו</h3>
            </div>
            <button
              type="button"
              onClick={() => void fetchIssuedDocuments()}
              className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              רענון
            </button>
          </div>
          {issuedListLoading ? (
            <p className="text-xs text-[color:var(--foreground-muted)]">טוען רשימה…</p>
          ) : issuedList.length === 0 ? (
            <p className="text-xs text-[color:var(--foreground-muted)]">
              עדיין אין מסמכים. לאחר הפקה הם יופיעו כאן.
            </p>
          ) : (
            <ul className="max-h-44 space-y-1 overflow-y-auto custom-scrollbar">
              {issuedList.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => setOpenIssuedId(doc.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-transparent px-3 py-2 text-right text-xs transition-colors hover:border-[color:var(--border-main)] hover:bg-[color:var(--background-main)]/60"
                  >
                    <span className="font-bold text-[color:var(--foreground-main)]">
                      {documentTypeLabel(doc.type)} #{doc.number}
                    </span>
                    <span className="truncate text-[color:var(--foreground-muted)]">{doc.clientName}</span>
                    <span className="shrink-0 font-bold text-emerald-600 dark:text-emerald-400">
                      ₪{doc.total.toLocaleString("he-IL")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Client Selection */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">1</div>
            <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">בחירת לקוח מה-CRM</h3>
          </div>
          <div className="relative">
            <User className="absolute right-3 top-3 w-4 h-4 text-[color:var(--foreground-muted)]" />
            <select className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-3 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 appearance-none text-[color:var(--foreground-main)]" value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)} disabled={fetchingContacts}>
              <option value="">{fetchingContacts ? 'טוען לקוחות...' : 'בחר לקוח מהרשימה...'}</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.email || 'אין אימייל'})</option>)}
            </select>
          </div>
        </section>

        {/* Items */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">2</div>
              <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">פירוט עבודה / פריטים</h3>
            </div>
            <button onClick={addItem} className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 flex items-center gap-1 transition-colors"><Plus size={14} /> הוסף פריט</button>
          </div>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex gap-3 items-start group">
                <div className="flex-1 bg-[color:var(--background-main)]/30 border border-[color:var(--border-main)] rounded-xl p-3 flex flex-col md:flex-row gap-4 shadow-sm dark:shadow-none">
                  <div className="flex-1"><input placeholder="תיאור הפריט או העבודה..." className="w-full bg-transparent border-none text-sm text-[color:var(--foreground-main)] focus:outline-none placeholder:text-[color:var(--foreground-muted)] opacity-80" value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)} /></div>
                  <div className="w-full md:w-20 border-t md:border-t-0 md:border-r border-[color:var(--border-main)]/30 pt-2 md:pt-0 md:pr-4"><input type="number" inputMode="numeric" placeholder="כמות" className="w-full bg-transparent border-none text-sm text-center text-[color:var(--foreground-muted)] focus:outline-none" value={item.quantity} onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value))} /></div>
                  <div className="w-full md:w-32 border-t md:border-t-0 md:border-r border-[color:var(--border-main)]/30 pt-2 md:pt-0 md:pr-4 flex items-center gap-1"><span className="text-xs text-[color:var(--foreground-muted)]">₪</span><input type="number" inputMode="decimal" placeholder="מחיר" className="w-full bg-transparent border-none text-sm text-left text-emerald-600 dark:text-emerald-400 font-bold focus:outline-none" value={item.price} onChange={(e) => updateItem(item.id, 'price', parseFloat(e.target.value))} /></div>
                </div>
                <button onClick={() => removeItem(item.id)} className="p-3 text-[color:var(--foreground-muted)] hover:text-red-600 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        </section>

        {/* Additional Settings */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">3</div>
              <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">תאריך פירעון</h3>
            </div>
            <div className="relative">
              <Calendar className="absolute right-3 top-3 w-4 h-4 text-[color:var(--foreground-muted)]" />
              <input type="date" className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-3 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-[color:var(--foreground-main)]" defaultValue={new Date().toISOString().split('T')[0]} />
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

        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">
              5
            </div>
            <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">תצוגה מקדימה</h3>
          </div>
          {selectedTypeMeta ? (
            <p className="mb-3 text-xs text-[color:var(--foreground-muted)]">{selectedTypeMeta.descriptionHe}</p>
          ) : null}
          <DocumentPreview
            payload={previewPayloadFromDraft({
              type: docType,
              clientName: contacts.find((c) => c.id === selectedContactId)?.name ?? "",
              items: items.map((i) => ({
                desc: i.description,
                qty: i.quantity,
                price: i.price,
              })),
              net: calculateBilling().net,
              vat: calculateBilling().vat,
              total: calculateBilling().total,
              vatRatePercent,
              orgName: orgSettings?.name ?? "BSD-YBM",
              orgTaxId: orgSettings?.taxId,
            })}
          />
        </section>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/50">
        <button
          type="button"
          onClick={() => void generateDocument()}
          disabled={loading || !selectedContactId}
          className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 text-white font-black text-lg rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3"
        >
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <>
              הפק {selectedTypeMeta?.labelHe ?? "מסמך"} <Send className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
      <OsFloatingPanel
        open={showDraft}
        onClose={() => setShowDraft(false)}
        onExitComplete={onDraftPanelExitComplete}
        title={t("workspaceWidgets.docCreator.draftTitle")}
      >
        <div className="space-y-4 text-sm text-[color:var(--foreground-main)]">
          <p>
            <span className="font-bold">{contacts.find((c) => c.id === selectedContactId)?.name}</span>
            {" · "}
            {selectedTypeMeta?.labelHe ?? docType}
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-[color:var(--foreground-muted)]">
            {items.map((item) => (
              <li key={item.id}>
                {item.description || "—"} × {item.quantity} = ₪{(item.quantity * item.price).toLocaleString()}
              </li>
            ))}
          </ul>
          <p className="text-sm text-[color:var(--foreground-muted)]">
            לפני מע״מ: ₪{calculateBilling().net.toLocaleString()} · מע״מ ({formatVatPercent(vatRatePercent)}%): ₪
            {calculateBilling().vat.toLocaleString()}
          </p>
          <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
            ₪{calculateBilling().total.toLocaleString()}
          </p>
          <button
            type="button"
            onClick={() => void generateDocument()}
            className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-500"
          >
            {t("workspaceWidgets.docCreator.draftConfirm")}
          </button>
        </div>
      </OsFloatingPanel>
    </div>
  );
}
