"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderPlus, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { createProjectWithClientAction } from "@/app/actions/crm";
import { CrmOverlayPortal } from "@/components/os/widgets/crm-table/CrmOverlayPortal";
import { useI18n } from "@/components/os/system/I18nProvider";

const inputClass =
  "w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-4 py-2.5 text-sm text-[color:var(--foreground-main)] outline-none focus:ring-2 focus:ring-indigo-500/50";
const labelClass = "text-[10px] font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]";

type ContactRow = { id: string; name: string };

type ClientMode = "existing" | "new";

type Props = Readonly<{
  open: boolean;
  onClose: () => void;
  onCreated: (project: { id: string; name: string }) => void;
}>;

export default function AddProjectDialog({ open, onClose, onCreated }: Props) {
  const { t, dir } = useI18n();
  const prefix = "workspaceWidgets.hubs.projects.addProject";

  const [clientMode, setClientMode] = useState<ClientMode>("existing");
  const [projectName, setProjectName] = useState("");
  const [contactId, setContactId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetForm = useCallback(() => {
    setClientMode("existing");
    setProjectName("");
    setContactId("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
  }, []);

  useEffect(() => {
    if (!open) return;
    resetForm();
    let cancelled = false;
    setContactsLoading(true);
    void fetch("/api/crm/contacts?take=200", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { contacts?: ContactRow[] } | null) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.contacts) ? data.contacts : [];
        setContacts(rows.map((c) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {
        if (!cancelled) setContacts([]);
      })
      .finally(() => {
        if (!cancelled) setContactsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, resetForm]);

  const handleSave = async () => {
    const name = projectName.trim();
    if (!name) {
      toast.error(t(`${prefix}.projectNameRequired`));
      return;
    }
    if (clientMode === "existing" && !contactId) {
      toast.error(t(`${prefix}.contactRequired`));
      return;
    }
    if (clientMode === "new" && !contactName.trim()) {
      toast.error(t(`${prefix}.newContactNameRequired`));
      return;
    }

    setSaving(true);
    try {
      const result =
        clientMode === "existing"
          ? await createProjectWithClientAction({
              clientMode: "existing",
              projectName: name,
              contactId,
            })
          : await createProjectWithClientAction({
              clientMode: "new",
              projectName: name,
              contactName: contactName.trim(),
              contactEmail: contactEmail.trim() || undefined,
              contactPhone: contactPhone.trim() || undefined,
            });

      if (!result.ok) {
        toast.error(result.error ?? t(`${prefix}.saveFailed`));
        return;
      }
      if (!("projectId" in result) || !result.projectId) {
        toast.error(t(`${prefix}.saveFailed`));
        return;
      }
      toast.success(t(`${prefix}.success`));
      onCreated({
        id: result.projectId,
        name: result.projectName ?? name,
      });
      onClose();
    } catch {
      toast.error(t(`${prefix}.saveFailed`));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <CrmOverlayPortal>
      <div
        className="my-auto w-full max-w-lg shrink-0 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-5 shadow-2xl sm:rounded-[2rem] sm:p-8"
        dir={dir}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-project-dialog-title"
      >
        <div className="mb-5 flex items-center justify-between sm:mb-6">
          <h3
            id="add-project-dialog-title"
            className="flex items-center gap-2 text-lg font-bold text-[color:var(--foreground-main)] sm:text-xl"
          >
            <FolderPlus className="text-indigo-500" size={22} aria-hidden />
            {t(`${prefix}.title`)}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full p-2 text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-elevated)]"
            aria-label={t("workspaceWidgets.confirm.cancel")}
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[min(65vh,28rem)] space-y-4 overflow-y-auto overscroll-y-contain pe-0.5 custom-scrollbar">
          <div className="space-y-1.5">
            <label className={labelClass} htmlFor="add-project-name">
              {t(`${prefix}.projectName`)}
            </label>
            <input
              id="add-project-name"
              className={inputClass}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={t(`${prefix}.projectNamePlaceholder`)}
              autoComplete="off"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className={labelClass}>{t(`${prefix}.clientSection`)}</legend>
            <div className="flex flex-col gap-2 sm:flex-row">
              {(["existing", "new"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setClientMode(mode)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors ${
                    clientMode === mode
                      ? "border-indigo-500/60 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                      : "border-[color:var(--border-main)] text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)]"
                  }`}
                  aria-pressed={clientMode === mode}
                >
                  {t(`${prefix}.clientMode.${mode}`)}
                </button>
              ))}
            </div>
          </fieldset>

          {clientMode === "existing" ? (
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="add-project-contact">
                {t(`${prefix}.existingContact`)}
              </label>
              <select
                id="add-project-contact"
                className={`${inputClass} appearance-none`}
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                disabled={contactsLoading}
              >
                <option value="">
                  {contactsLoading
                    ? t(`${prefix}.contactsLoading`)
                    : t(`${prefix}.contactPlaceholder`)}
                </option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="add-project-contact-name">
                  {t(`${prefix}.newContactName`)}
                </label>
                <input
                  id="add-project-contact-name"
                  className={inputClass}
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder={t(`${prefix}.newContactNamePlaceholder`)}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="add-project-contact-phone">
                    {t(`${prefix}.newContactPhone`)}
                  </label>
                  <input
                    id="add-project-contact-phone"
                    type="tel"
                    className={inputClass}
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass} htmlFor="add-project-contact-email">
                    {t(`${prefix}.newContactEmail`)}
                  </label>
                  <input
                    id="add-project-contact-email"
                    type="email"
                    className={inputClass}
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-lg transition-colors hover:bg-indigo-500 disabled:opacity-60"
        >
          {saving ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Save size={18} aria-hidden />}
          {saving ? t(`${prefix}.saving`) : t(`${prefix}.save`)}
        </button>
      </div>
    </CrmOverlayPortal>
  );
}
