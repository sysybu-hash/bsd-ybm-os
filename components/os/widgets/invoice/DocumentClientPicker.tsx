"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { User, Mail, Phone, FileText } from "lucide-react";

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
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
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
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleNameInput = (value: string) => {
    onNameChange(value);
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
        <div className="relative">
          <User className="absolute right-3 top-3 h-4 w-4 text-[color:var(--foreground-muted)]" />
          <input
            type="text"
            list={listId}
            autoComplete="off"
            disabled={loading}
            value={name}
            placeholder={loading ? "טוען לקוחות…" : "הקלד שם לקוח או בחר מהרשימה…"}
            onFocus={() => setOpen(true)}
            onChange={(e) => handleNameInput(e.target.value)}
            className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 py-3 pl-4 pr-10 text-sm text-[color:var(--foreground-main)] focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          />
          <datalist id={listId}>
            {contacts.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </div>

        {open && suggestions.length > 0 && name.trim().length > 0 ? (
          <ul
            className="absolute z-20 max-h-48 w-full overflow-y-auto rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-lg"
            role="listbox"
          >
            {suggestions.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.id === selectedContactId}
                  className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-right text-sm hover:bg-[color:var(--background-main)]/60"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelectContact(c);
                    onIsNewClientChange(false);
                    setOpen(false);
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
