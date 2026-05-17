"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { deleteIssuedDocument, updateIssuedDocument } from "@/app/actions/issued-documents";
import type { DocStatus, DocType } from "@prisma/client";
import InvoiceActionBar from "@/components/os/widgets/invoice/InvoiceActionBar";

type LineItem = { desc: string; qty: number; price: number };

type IssuedDoc = {
  id: string;
  type: DocType;
  number: number;
  clientName: string;
  amount: number;
  vat: number;
  total: number;
  status: DocStatus;
  items: LineItem[];
  projectId: string | null;
  project?: { id: string; name: string } | null;
};

type ProjectOption = { id: string; name: string };

type InvoiceDocumentViewProps = {
  issuedDocumentId: string;
  onDeleted?: () => void;
};

export default function InvoiceDocumentView({ issuedDocumentId, onDeleted }: InvoiceDocumentViewProps) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<IssuedDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/issued/${issuedDocumentId}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const raw = data.document;
      const items = Array.isArray(raw.items)
        ? raw.items.map((row: { desc?: string; qty?: number; price?: number }) => ({
            desc: String(row.desc ?? ""),
            qty: Number(row.qty) || 0,
            price: Number(row.price) || 0,
          }))
        : [];
      setDoc({
        id: raw.id,
        type: raw.type,
        number: raw.number,
        clientName: raw.clientName,
        amount: raw.amount,
        vat: raw.vat,
        total: raw.total,
        status: raw.status,
        items,
        projectId: raw.projectId ?? null,
        project: raw.project ?? null,
      });
    } catch {
      toast.error(t("workspaceWidgets.invoice.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [issuedDocumentId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/projects", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.projects) ? data.projects : Array.isArray(data) ? data : [];
          setProjects(list.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
        }
      } catch {
        /* optional */
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!doc) return;
    setSaving(true);
    const net = doc.items.reduce((s, i) => s + i.qty * i.price, 0);
    const result = await updateIssuedDocument({
      id: doc.id,
      type: doc.type,
      clientName: doc.clientName,
      netAmount: net,
      items: doc.items,
      status: doc.status,
      projectId: doc.projectId ?? undefined,
    });
    setSaving(false);
    if (result.ok) {
      toast.success(t("workspaceWidgets.invoice.saved"));
      void load();
    } else {
      toast.error(result.error);
    }
  };

  const handleDelete = async () => {
    if (!doc || !confirm(t("workspaceWidgets.invoice.deleteConfirm"))) return;
    const result = await deleteIssuedDocument(doc.id);
    if (result.ok) {
      toast.success(t("workspaceWidgets.invoice.deleted"));
      onDeleted?.();
    } else {
      toast.error(result.error);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-[color:var(--foreground-muted)]">
        <Loader2 className="animate-spin" size={28} aria-hidden />
      </div>
    );
  }

  if (!doc) {
    return (
      <p className="p-6 text-sm text-[color:var(--foreground-muted)]">{t("workspaceWidgets.invoice.loadFailed")}</p>
    );
  }

  return (
    <div className="custom-scrollbar flex h-full flex-col overflow-y-auto p-4">
      <header className="mb-4">
        <h2 className="text-lg font-black">
          {t("workspaceWidgets.invoice.title")} #{doc.number}
        </h2>
        <p className="text-xs text-[color:var(--foreground-muted)]">{doc.type}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[10px] font-bold text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.invoice.client")}
          <input
            value={doc.clientName}
            onChange={(e) => setDoc({ ...doc, clientName: e.target.value })}
            className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs"
          />
        </label>
        <label className="text-[10px] font-bold text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.invoice.project")}
          <select
            value={doc.projectId ?? ""}
            onChange={(e) => setDoc({ ...doc, projectId: e.target.value || null })}
            className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs"
          >
            <option value="">{t("workspaceWidgets.invoice.noProject")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[color:var(--border-main)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[color:var(--border-main)] bg-[color:var(--surface-soft)]">
              <th className="p-2 text-start font-bold">{t("workspaceWidgets.invoice.lineDesc")}</th>
              <th className="p-2 text-end font-bold">{t("workspaceWidgets.invoice.lineQty")}</th>
              <th className="p-2 text-end font-bold">{t("workspaceWidgets.invoice.linePrice")}</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item, idx) => (
              <tr key={idx} className="border-b border-[color:var(--border-main)]/60">
                <td className="p-2">
                  <input
                    value={item.desc}
                    onChange={(e) => {
                      const items = [...doc.items];
                      items[idx] = { ...item, desc: e.target.value };
                      setDoc({ ...doc, items });
                    }}
                    className="w-full rounded border border-[color:var(--border-main)] px-2 py-1"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    value={item.qty}
                    onChange={(e) => {
                      const items = [...doc.items];
                      items[idx] = { ...item, qty: Number(e.target.value) || 0 };
                      setDoc({ ...doc, items });
                    }}
                    className="w-16 rounded border border-[color:var(--border-main)] px-2 py-1 text-end"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    value={item.price}
                    onChange={(e) => {
                      const items = [...doc.items];
                      items[idx] = { ...item, price: Number(e.target.value) || 0 };
                      setDoc({ ...doc, items });
                    }}
                    className="w-20 rounded border border-[color:var(--border-main)] px-2 py-1 text-end"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-end text-sm font-bold">
        {t("workspaceWidgets.invoice.total")}: ₪{doc.total.toLocaleString("he-IL")}
      </div>

      <InvoiceActionBar
        documentId={doc.id}
        saving={saving}
        onSave={() => void handleSave()}
        onDelete={() => void handleDelete()}
      />
    </div>
  );
}
