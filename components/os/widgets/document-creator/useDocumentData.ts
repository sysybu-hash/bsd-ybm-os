"use client";

import { useCallback, useEffect, useState } from "react";
import { resolveVatRatePercent } from "@/lib/vat-config";
import type { DocumentClientContact } from "@/components/os/widgets/invoice/DocumentClientPicker";
import type { IssuedDocEntry, OrgSettings } from "./types";

export function useDocumentData() {
  const [contacts, setContacts] = useState<DocumentClientContact[]>([]);
  const [fetchingContacts, setFetchingContacts] = useState(true);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [issuedList, setIssuedList] = useState<IssuedDocEntry[]>([]);
  const [issuedListLoading, setIssuedListLoading] = useState(true);

  const fetchIssuedDocuments = useCallback(async () => {
    try {
      setIssuedListLoading(true);
      const res = await fetch("/api/erp/issued-documents", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { documents?: IssuedDocEntry[] };
      setIssuedList(data.documents ?? []);
    } catch {
      /* optional list */
    } finally {
      setIssuedListLoading(false);
    }
  }, []);

  const fetchOrgSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/organization", { credentials: "include" });
      const data = await res.json();
      setOrgSettings({
        name: data.name || "BSD-YBM תשתיות",
        taxId: data.taxId || "",
        email: data.paypalMerchantEmail || data.adminEmail || "",
        vatRatePercent: resolveVatRatePercent(data.vatRatePercent),
        companyType: data.companyType,
        isReportable: data.isReportable !== false,
      });
    } catch {
      /* non-critical */
    }
  }, []);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/contacts", { credentials: "include" });
      const data = await res.json();
      const rows = Array.isArray(data.contacts) ? data.contacts : [];
      setContacts(
        rows.map((c: { id: string; name: string; email?: string | null; phone?: string | null }) => ({
          id: c.id,
          name: c.name,
          email: c.email ?? null,
          phone: c.phone ?? null,
        })),
      );
    } catch {
      /* non-critical */
    } finally {
      setFetchingContacts(false);
    }
  }, []);

  useEffect(() => {
    void fetchContacts();
    void fetchOrgSettings();
    void fetchIssuedDocuments();
  }, [fetchContacts, fetchOrgSettings, fetchIssuedDocuments]);

  return {
    contacts, setContacts,
    fetchingContacts,
    orgSettings,
    issuedList,
    issuedListLoading,
    fetchIssuedDocuments,
    fetchContacts,
  };
}
