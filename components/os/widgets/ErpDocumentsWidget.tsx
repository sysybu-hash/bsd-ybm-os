"use client";

import React from "react";
import { FileText, Package, Search, Trash2 } from "lucide-react";
import WidgetState from "@/components/os/WidgetState";
import { useErpDocuments } from "./erp-documents/useErpDocuments";
import { ErpDocumentDetail } from "./erp-documents/ErpDocumentDetail";

export default function ErpDocumentsWidget() {
  const {
    t, dir,
    documents, selectedDoc, setSelectedDoc,
    loading, searchQuery, setSearchQuery,
    editingLineId, editValues, setEditValues,
    priceComparison, isUpdating,
    handleSearch, startEditing, saveLineItem, deleteDocument,
    fetchDocDetails,
  } = useErpDocuments();

  return (
    <div className="flex flex-col md:flex-row h-full bg-transparent text-[color:var(--foreground-main)] overflow-hidden" dir={dir}>
      {/* Sidebar – Document List */}
      <div className={`w-full md:w-80 border-b md:border-b-0 md:border-l border-[color:var(--border-main)] flex-col bg-[color:var(--background-main)]/50 ${selectedDoc ? "hidden md:flex" : "flex flex-1"}`}>
        <div className="p-4 border-b border-[color:var(--border-main)]">
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

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <WidgetState variant="loading" message={t("workspaceWidgets.erp.loading")} />
          ) : documents.length === 0 ? (
            <WidgetState variant="empty" message={t("workspaceWidgets.erp.empty")} />
          ) : (
            documents.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => void fetchDocDetails(doc.id)}
                className={`w-full text-right p-4 border-b border-[color:var(--border-main)]/30 hover:bg-[color:var(--foreground-muted)]/5 transition-colors group ${selectedDoc?.id === doc.id ? "bg-emerald-500/5 dark:bg-emerald-500/10 border-r-2 border-r-emerald-600 dark:border-r-emerald-500" : ""}`}
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

      {/* Main Content */}
      <div className={`flex-1 flex-col overflow-hidden ${!selectedDoc ? "hidden md:flex" : "flex"}`}>
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
          <div className="flex-1 flex flex-col items-center justify-center text-[color:var(--foreground-muted)] bg-transparent">
            <div className="w-16 h-16 bg-[color:var(--background-main)]/50 rounded-full flex items-center justify-center mb-4 border border-[color:var(--border-main)]">
              <Package className="w-8 h-8 opacity-50" />
            </div>
            <p>בחר מסמך מהרשימה כדי לצפות בפרטים ולערוך שורות</p>
          </div>
        )}
      </div>
    </div>
  );
}
