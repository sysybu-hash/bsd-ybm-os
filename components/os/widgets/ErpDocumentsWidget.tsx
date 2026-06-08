"use client";

import React, { useState } from "react";
import { FileText, Package, Search, Trash2 } from "lucide-react";
import WidgetState from "@/components/os/WidgetState";
import WidgetSplitPanels from "@/components/os/layout/WidgetSplitPanels";
import { useErpDocuments } from "./erp-documents/useErpDocuments";
import { ErpDocumentDetail } from "./erp-documents/ErpDocumentDetail";

export default function ErpDocumentsWidget() {
  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");
  const {
    t, dir,
    documents, selectedDoc, setSelectedDoc,
    loading, searchQuery, setSearchQuery,
    editingLineId, editValues, setEditValues,
    priceComparison, isUpdating,
    handleSearch, startEditing, saveLineItem, deleteDocument,
    fetchDocDetails,
  } = useErpDocuments();

  const sidebar = (
    <div className="flex h-full flex-col overflow-hidden border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 md:border-l">
      <div className="shrink-0 border-b border-[color:var(--border-main)] p-4">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-[color:var(--foreground-muted)]" />
          <input
            type="text"
            placeholder={t("workspaceWidgets.erp.searchPlaceholder")}
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-lg py-2 pr-10 pl-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-[color:var(--foreground-main)] shadow-sm dark:shadow-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>
      </div>

      <div data-widget-scroll-pane className="custom-scrollbar">
        {loading ? (
          <WidgetState variant="loading" message={t("workspaceWidgets.erp.loading")} />
        ) : documents.length === 0 ? (
          <WidgetState variant="empty" message={t("workspaceWidgets.erp.empty")} />
        ) : (
          documents.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => { void fetchDocDetails(doc.id); setMobilePane("detail"); }}
              className={`w-full text-start p-4 border-b border-[color:var(--border-main)]/30 hover:bg-[color:var(--foreground-muted)]/5 transition-colors group ${selectedDoc?.id === doc.id ? "bg-emerald-500/5 dark:bg-emerald-500/10 border-e-2 border-e-emerald-600 dark:border-e-emerald-500" : ""}`}
            >
              <div className="flex items-center gap-3 mb-1">
                <FileText className={`w-4 h-4 ${selectedDoc?.id === doc.id ? "text-emerald-600 dark:text-emerald-400" : "text-[color:var(--foreground-muted)]"}`} />
                <span className="text-sm font-medium truncate flex-1 text-[color:var(--foreground-main)]">{doc.fileName}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void deleteDocument(doc.id); }}
                  className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 hover:text-rose-600 dark:text-rose-400 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex justify-between text-[10px] text-[color:var(--foreground-muted)]">
                <span>{new Date(doc.createdAt).toLocaleDateString("he-IL")}</span>
                <span className="uppercase">{doc.type}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );

  const detail = (
    <div className="flex h-full flex-col overflow-hidden">
      {selectedDoc ? (
        <ErpDocumentDetail
          selectedDoc={selectedDoc}
          priceComparison={priceComparison}
          editingLineId={editingLineId}
          editValues={editValues}
          isUpdating={isUpdating}
          setSelectedDoc={setSelectedDoc}
          setEditValues={setEditValues}
          startEditing={startEditing}
          saveLineItem={(id) => void saveLineItem(id)}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-[color:var(--foreground-muted)] bg-transparent">
          <div className="w-16 h-16 bg-[color:var(--background-main)]/50 rounded-full flex items-center justify-center mb-4 border border-[color:var(--border-main)]">
            <Package className="w-8 h-8 opacity-50" />
          </div>
          <p className="text-sm">{t("workspaceWidgets.erp.selectDoc")}</p>
        </div>
      )}
    </div>
  );

  return (
    <div data-widget-sticky-chrome className="flex h-full min-h-0 flex-col overflow-x-hidden bg-transparent text-[color:var(--foreground-main)]" dir={dir}>
      {/* Mobile pane switcher */}
      <div className="flex shrink-0 gap-1 border-b border-[color:var(--border-main)] p-1.5 md:hidden" role="tablist">
        {(["list", "detail"] as const).map((pane) => {
          const label = pane === "list" ? t("workspaceWidgets.erp.mobileTabList") || "רשימה" : t("workspaceWidgets.erp.mobileTabDetail") || "מסמך";
          return (
            <button
              key={pane}
              type="button"
              role="tab"
              aria-selected={mobilePane === pane}
              onClick={() => setMobilePane(pane)}
              className={`min-h-[44px] flex-1 rounded-lg text-sm font-bold transition ${
                mobilePane === pane ? "bg-emerald-600 text-white" : "bg-[color:var(--surface-soft)] text-[color:var(--foreground-muted)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Desktop: split panels */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <WidgetSplitPanels
          className="min-h-0 flex-1"
          direction="horizontal"
          stackBelowPx={768}
          panels={[
            { id: "erp-docs-sidebar", defaultSize: 28, minSize: 18, children: sidebar },
            { id: "erp-docs-detail",  defaultSize: 72, minSize: 40, children: detail  },
          ]}
        />
      </div>

      {/* Mobile: single pane */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:hidden">
        {mobilePane === "list" ? sidebar : detail}
      </div>
    </div>
  );
}
