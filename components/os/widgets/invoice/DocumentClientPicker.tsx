"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { User, Mail, Phone, FileText, ChevronDown } from "lucide-react";

export type DocumentClientContact = {
  id: string;
  name: string;
  email: string | null;
  phone?: string | null;
};

export type NewClientDetails = {
  email: string;
  phone: string;
  notes: string;
};

type DocumentClientPickerProps = {
  contacts: DocumentClientContact[];
  loading?: boolean;
  name: string;
  selectedContactId: string;
  isNewClient: boolean;
  newClient: NewClientDetails;
  onNameChange: (name: string) => void;
  onSelectContact: (contact: DocumentClientContact) => void;
  onNewClientChange: (patch: Partial<NewClientDetails>) => void;
  onIsNewClientChange: (isNew: boolean) => void;
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findContactByName(
  contacts: DocumentClientContact[],
  name: string,
): DocumentClientContact | undefined {
  const key = normalizeName(name);
  if (!key) return undefined;
  return contacts.find((c) => normalizeName(c.name) === key);
}

export default function DocumentClientPicker({
  contacts,
  loading = false,
  name,
  selectedContactId,
  isNewClient,
  newClient,
  onNameChange,
  onSelectContact,
  onNewClientChange,
  onIsNewClientChange,
}: DocumentClientPickerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q) return contacts.slice(0, 12);
    return contacts
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 12);
  }, [contacts, name]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  const pickContact = (contact: DocumentClientContact) => {
    onNameChange(contact.name);
    onSelectContact(contact);
    onIsNewClientChange(false);
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleNameInput = (value: string) => {
    onNameChange(value);
    setOpen(true);
    const match = findContactByName(contacts, value);
    if (match) {
      onSelectContact(match);
      onIsNewClientChange(false);
    } else if (value.trim().length >= 2) {
      onIsNewClientChange(true);
    } else {
      onIsNewClientChange(false);
    }
  };

  const selected = contacts.find((c) => c.id === selectedContactId);

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 text-[10px] font-bold text-[color:var(--foreground-muted)]">
          1
        </div>
        <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">לקוח</h3>
      </div>

      <div ref={wrapRef} className="relative space-y-3">
        <div className="relative flex gap-1">
          <div className="relative min-w-0 flex-1">
            <User className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[color:var(--foreground-muted)]" />
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              disabled={loading}
              value={name}
              placeholder={loading ? "טוען לקוחות…" : "הקלד שם לקוח או בחר מהרשימה…"}
              onFocus={() => setOpen(true)}
              onChange={(e) => handleNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
              aria-expanded={open && suggestions.length > 0}
              aria-autocomplete="list"
              className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 py-3 pl-4 pr-10 text-sm text-[color:var(--foreground-main)] focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>
          <button
            type="button"
            disabled={loading || contacts.length === 0}
            aria-label="פתח רשימת לקוחות"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen((v) => !v);
              inputRef.current?.focus();
            }}
            className="flex h-[46px] w-11 shrink-0 items-center justify-center rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 text-[color:var(--foreground-muted)] hover:bg-[color:var(--background-main)]/60 disabled:opacity-40"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>

        {open && suggestions.length > 0 ? (
          <ul
            className="absolute z-[100] max-h-48 w-full overflow-y-auto rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-lg"
            role="listbox"
          >
            {suggestions.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.id === selectedContactId}
                  className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-right text-sm hover:bg-[color:var(--background-main)]/60"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    pickContact(c);
                  }}
                >
                  <span className="font-bold text-[color:var(--foreground-main)]">{c.name}</span>
                  <span className="text-[10px] text-[color:var(--foreground-muted)]">
                    {c.email || c.phone || "ללא פרטי קשר"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : open && !loading && contacts.length === 0 ? (
          <p className="absolute z-[100] w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-xs text-[color:var(--foreground-muted)] shadow-lg">
            אין לקוחות ב-CRM — הקלידו שם ליצירת לקוח חדש
          </p>
        ) : null}

        {selected && !isNewClient ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            לקוח קיים: {selected.name}
            {selected.email ? ` · ${selected.email}` : ""}
          </p>
        ) : null}

        {isNewClient && name.trim().length >= 2 ? (
          <div className="space-y-3 rounded-xl border border-amber-200/60 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
            <p className="text-xs font-bold text-amber-900 dark:text-amber-100">
              לקוח חדש — ייווצר ב-CRM בעת הפקת המסמך
            </p>
            <div className="relative">
              <Mail className="absolute right-3 top-3 h-4 w-4 text-[color:var(--foreground-muted)]" />
              <input
                type="email"
                inputMode="email"
                value={newClient.email}
                onChange={(e) => onNewClientChange({ email: e.target.value })}
                placeholder="אימייל (אופציונלי)"
                className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80 py-2.5 pl-3 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/40"
              />
            </div>
            <div className="relative">
              <Phone className="absolute right-3 top-3 h-4 w-4 text-[color:var(--foreground-muted)]" />
              <input
                type="tel"
                inputMode="tel"
                value={newClient.phone}
                onChange={(e) => onNewClientChange({ phone: e.target.value })}
                placeholder="טלפון (אופציונלי)"
                className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80 py-2.5 pl-3 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/40"
              />
            </div>
            <div className="relative">
              <FileText className="absolute right-3 top-3 h-4 w-4 text-[color:var(--foreground-muted)]" />
              <input
                type="text"
                value={newClient.notes}
                onChange={(e) => onNewClientChange({ notes: e.target.value })}
                placeholder="הערות (אופציונלי)"
                className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80 py-2.5 pl-3 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/40"
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
