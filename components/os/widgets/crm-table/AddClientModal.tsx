"use client";

import React, { useState } from "react";
import { UserPlus, X, User, Mail, Phone, Save } from "lucide-react";
import { toast } from "sonner";
import type { Client } from "./types";
import { CrmOverlayPortal } from "./CrmOverlayPortal";

type AddClientModalProps = {
  onClose: () => void;
  onCreated: () => void;
  t: (key: string) => string;
};

export function AddClientModal({ onClose, onCreated, t }: AddClientModalProps) {
  const [form, setForm] = useState<{
    name: string;
    email: string;
    phone: string;
    status: Client["status"];
  }>({ name: "", email: "", phone: "", status: "lead" });

  const handleAdd = async () => {
    if (!form.name || !form.email) {
      toast.error(t("workspaceWidgets.crmTable.nameEmailRequired"));
      return;
    }
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success(t("workspaceWidgets.crmTable.created"));
        onClose();
        onCreated();
      } else {
        throw new Error("Failed to create client");
      }
    } catch {
      toast.error(t("workspaceWidgets.crmTable.createFailed"));
    }
  };

  return (
    <CrmOverlayPortal>
      <div className="w-full max-w-md shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-[2.5rem] p-8 shadow-2xl my-auto">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <UserPlus className="text-emerald-600 dark:text-emerald-400" size={24} /> הוספת לקוח חדש
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-500 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 mb-8">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">שם מלא</label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                placeholder="ישראל ישראלי"
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-slate-900 dark:text-slate-200"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">אימייל</label>
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="email"
                placeholder="israel@example.com"
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-slate-900 dark:text-slate-200"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">טלפון</label>
            <div className="relative">
              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                placeholder="050-0000000"
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-slate-900 dark:text-slate-200"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">סטטוס</label>
            <select
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 appearance-none text-slate-900 dark:text-slate-200"
              value={form.status}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "active" || v === "lead" || v === "inactive") setForm({ ...form, status: v });
              }}
            >
              <option value="lead">ליד (Lead)</option>
              <option value="active">פעיל (Active)</option>
              <option value="inactive">לא פעיל (Inactive)</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleAdd()}
          className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xl transition-all flex items-center justify-center gap-2"
        >
          <Save size={18} /> שמור לקוח
        </button>
      </div>
    </CrmOverlayPortal>
  );
}
