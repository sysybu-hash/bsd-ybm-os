"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import type { DocType } from "@prisma/client";
import { ISSUED_DOCUMENT_TYPES } from "@/lib/document-types";
import { calculateDocumentTotalsFromOrg } from "@/lib/billing-calculations";
import {
  FLOATING_PANEL_EXIT_MS,
  waitForFloatingPanelExit,
} from "@/components/os/layout/OsFloatingPanel";
import type { NewClientDetails } from "@/components/os/widgets/invoice/DocumentClientPicker";
import { downloadIssuedDocumentExport } from "@/lib/invoice-download-client";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { DocItem, GeneratedDocState } from "./types";
import { useDocumentData } from "./useDocumentData";
import { resolveContactForIssue } from "./resolveContactForIssue";

export function useDocumentCreator(liveData: Record<string, unknown> | null | undefined) {
  const { t } = useI18n();
  const [showDraft, setShowDraft] = useState(false);
  const [docType, setDocType] = useState<DocType>("QUOTE");
  const [clientNameInput, setClientNameInput] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [isNewClient, setIsNewClient] = useState(false);
  const [newClient, setNewClient] = useState<NewClientDetails>({ email: "", phone: "", notes: "" });
  const [items, setItems] = useState<DocItem[]>([
    { id: "1", description: "", quantity: 1, price: 0 },
  ]);
  const [loading, setLoading] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState<GeneratedDocState | null>(null);
  const [openIssuedId, setOpenIssuedId] = useState<string | null>(null);
  /** Empty = use auto nextNumber on issue */
  const [documentNumberInput, setDocumentNumberInput] = useState("");
  const [suggestedNumber, setSuggestedNumber] = useState<number | null>(null);
  const [numberManuallyEdited, setNumberManuallyEdited] = useState(false);
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));

  const draftPanelExitRef = useRef<(() => void) | null>(null);

  const {
    contacts, setContacts,
    fetchingContacts, orgSettings,
    issuedList, issuedListLoading,
    fetchIssuedDocuments,
  } = useDocumentData();

  // Suggested next document number for current type (auto-fill unless user edited)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/erp/issued-documents?nextFor=${encodeURIComponent(docType)}`,
          { credentials: "include" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { nextNumber?: number };
        if (cancelled || typeof data.nextNumber !== "number") return;
        setSuggestedNumber(data.nextNumber);
        if (!numberManuallyEdited) {
          setDocumentNumberInput(String(data.nextNumber));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docType, numberManuallyEdited]);

  const setDocTypeAndResetNumber = useCallback((type: DocType) => {
    setDocType(type);
    setNumberManuallyEdited(false);
  }, []);

  // ── navigation ────────────────────────────────────────────────────────────
  const applyDocNav = useCallback((view: WidgetViewState) => {
    const id = view.issuedDocumentId;
    if (typeof id === "string") setOpenIssuedId(id);
    else if (!view.issuedDocumentId && Object.keys(view).length === 0) setOpenIssuedId(null);
  }, []);

  const { pushView } = useSyncedWidgetNavigation(applyDocNav);

  const navigateIssued = useCallback(
    (id: string | null) => {
      setOpenIssuedId(id);
      if (id) pushView({ issuedDocumentId: id });
      else pushView({});
    },
    [pushView],
  );

  const issuedDocumentId =
    typeof liveData?.issuedDocumentId === "string" ? liveData.issuedDocumentId : openIssuedId;

  // ── panel close ───────────────────────────────────────────────────────────
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

  // ── liveData (automation draft) ───────────────────────────────────────────
  useEffect(() => {
    if (liveData?.automation !== "invoice_draft") return;
    const dt = liveData.docType;
    if (typeof dt === "string" && ISSUED_DOCUMENT_TYPES.some((d) => d.id === dt)) {
      setDocType(dt as DocType);
    } else if (dt === "quote") { setDocType("QUOTE"); }
    else if (dt === "invoice") { setDocType("INVOICE"); }

    const contactName = liveData.contactName;
    if (typeof contactName === "string" && contactName) {
      setContacts((prev) => {
        const exists = prev.find((c) => c.name === contactName);
        if (exists) {
          setSelectedContactId(exists.id);
          setClientNameInput(contactName);
          setIsNewClient(false);
          return prev;
        }
        const id = `draft-${Date.now()}`;
        setSelectedContactId(id);
        setClientNameInput(contactName);
        setIsNewClient(true);
        return [...prev, { id, name: contactName, email: null }];
      });
    }
    if (typeof liveData.contactId === "string") {
      setSelectedContactId(liveData.contactId);
      const c = contacts.find((x) => x.id === liveData.contactId);
      if (c) setClientNameInput(c.name);
    }
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
    setShowDraft(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveData]);

  // ── item helpers ──────────────────────────────────────────────────────────
  const addItem = () => {
    setItems((prev) => [...prev, { id: Math.random().toString(36).substring(2, 11), description: "", quantity: 1, price: 0 }]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((item) => item.id !== id)));
  };

  const updateItem = (id: string, field: keyof DocItem, value: string | number) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  // ── billing ───────────────────────────────────────────────────────────────
  const vatRatePercent = orgSettings?.vatRatePercent ?? 18;
  const calculateSubtotal = () => items.reduce((sum, item) => sum + item.quantity * item.price, 0);

  const calculateBilling = () => {
    const net = calculateSubtotal();
    if (!orgSettings?.companyType) return { net, vat: 0, total: net, isExempt: false, vatRatePercent };
    return calculateDocumentTotalsFromOrg(
      net,
      {
        companyType: orgSettings.companyType as import("@prisma/client").CompanyType,
        isReportable: orgSettings.isReportable !== false,
        vatRatePercent,
      },
      { docType },
    );
  };

  // ── generate document ─────────────────────────────────────────────────────
  const selectedTypeMeta = ISSUED_DOCUMENT_TYPES.find((d) => d.id === docType);

  const generateDocument = async () => {
    const contact = await resolveContactForIssue({
      contacts, selectedContactId, clientNameInput, isNewClient, newClient,
      setContacts, setSelectedContactId, setClientNameInput, setIsNewClient, t,
    });
    if (!contact) return;
    if (items.some((item) => !item.description || item.price <= 0)) {
      toast.error(t("workspaceWidgets.documentCreator.fillAllItems")); return;
    }
    const trimmedNum = documentNumberInput.trim();
    const parsedManualNumber = trimmedNum ? Number.parseInt(trimmedNum, 10) : NaN;
    const numberToSend =
      Number.isFinite(parsedManualNumber) && parsedManualNumber > 0
        ? parsedManualNumber
        : undefined;
    // If input matches suggestion and user never edited — let server allocate (avoids stale race).
    const useServerAuto =
      !numberManuallyEdited || numberToSend == null;
    setLoading(true);
    try {
      await closeDraftPanel();
      const res = await fetch("/api/erp/issued-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: docType,
          contactId: contact.id,
          clientName: contact.name,
          items: items.map((i) => ({ desc: i.description, qty: i.quantity, price: i.price })),
          date: issueDate || undefined,
          dueDate: dueDate || undefined,
          ...(useServerAuto ? {} : { number: numberToSend }),
        }),
      });

      type IssuedDocBody = { id?: string; number?: number; documentNumber?: number; token?: string };
      type CreateIssuedResponse = { document?: IssuedDocBody; error?: string; signUrl?: string; itaError?: string };
      let data: CreateIssuedResponse = {};
      try { data = (await res.json()) as CreateIssuedResponse; } catch {
        toast.error(res.ok ? t("workspaceWidgets.documentCreator.serverResponseError") : `${t("workspaceWidgets.documentCreator.serverResponseError")} (${res.status})`); return;
      }
      if (res.ok) {
        const doc = data.document;
        if (!doc?.id) { toast.error(t("workspaceWidgets.documentCreator.serverResponseError")); return; }
        await waitForFloatingPanelExit(FLOATING_PANEL_EXIT_MS + 80);
        setGeneratedDoc({
          id: doc.id,
          token: doc.token ?? "",
          documentNumber: doc.number ?? doc.documentNumber ?? 0,
          signUrl: data.signUrl ?? "",
          clientName: contact.name,
          items,
          amount: calculateSubtotal(),
        });
        navigateIssued(doc.id);
        if (data.itaError) toast.warning(`המסמך הופק; מספר הקצאה: ${data.itaError}`);
        toast.success(`${selectedTypeMeta?.labelHe ?? t("workspaceWidgets.documentCreator.docGenerationSuccess")}`);
        void fetchIssuedDocuments();
      } else {
        toast.error(data.error || `${t("workspaceWidgets.documentCreator.docGenerationFailed")} (${res.status})`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("workspaceWidgets.documentCreator.serverConnectionError"));
    } finally {
      setLoading(false);
    }
  };

  // ── PDF download ──────────────────────────────────────────────────────────
  const downloadPDF = async () => {
    if (!generatedDoc?.id) { toast.error(t("workspaceWidgets.documentCreator.pdfRequired")); return; }
    const result = await downloadIssuedDocumentExport(generatedDoc.id, "pdf");
    if (!result.ok) { toast.error(result.error); return; }
    toast.success(t("workspaceWidgets.documentCreator.pdfDownloaded"));
  };

  return {
    showDraft, setShowDraft,
    docType, setDocType: setDocTypeAndResetNumber,
    orgSettings,
    contacts, setContacts,
    clientNameInput, setClientNameInput,
    selectedContactId, setSelectedContactId,
    isNewClient, setIsNewClient,
    newClient, setNewClient,
    items,
    loading,
    fetchingContacts,
    generatedDoc, setGeneratedDoc,
    issuedDocumentId,
    issuedList,
    issuedListLoading,
    vatRatePercent,
    selectedTypeMeta,
    documentNumberInput,
    setDocumentNumberInput: (v: string) => {
      setNumberManuallyEdited(true);
      setDocumentNumberInput(v);
    },
    suggestedNumber,
    issueDate, setIssueDate,
    dueDate, setDueDate,
    previewNumber:
      Number.parseInt(documentNumberInput.trim(), 10) || suggestedNumber || 0,
    addItem, removeItem, updateItem,
    calculateSubtotal, calculateBilling,
    generateDocument, downloadPDF,
    fetchIssuedDocuments,
    navigateIssued,
    closeDraftPanel, onDraftPanelExitComplete,
  };
}
