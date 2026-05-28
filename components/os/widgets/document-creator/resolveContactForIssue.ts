import { toast } from "sonner";
import type { DocumentClientContact, NewClientDetails } from "@/components/os/widgets/invoice/DocumentClientPicker";
import { findContactByName } from "@/components/os/widgets/invoice/DocumentClientPicker";

type ResolveArgs = {
  contacts: DocumentClientContact[];
  selectedContactId: string;
  clientNameInput: string;
  isNewClient: boolean;
  newClient: NewClientDetails;
  setContacts: React.Dispatch<React.SetStateAction<DocumentClientContact[]>>;
  setSelectedContactId: (id: string) => void;
  setClientNameInput: (name: string) => void;
  setIsNewClient: (v: boolean) => void;
  t: (key: string) => string;
};

export async function resolveContactForIssue({
  contacts, selectedContactId, clientNameInput, isNewClient, newClient,
  setContacts, setSelectedContactId, setClientNameInput, setIsNewClient, t,
}: ResolveArgs): Promise<DocumentClientContact | null> {
  const trimmedName = clientNameInput.trim();
  if (!trimmedName) { toast.error(t("documentCreatorContact.enterClientName")); return null; }

  const fromList =
    contacts.find((c) => c.id === selectedContactId && !c.id.startsWith("draft-")) ??
    findContactByName(contacts, trimmedName);

  if (fromList && !isNewClient) return fromList;
  if (!isNewClient && fromList) return fromList;

  const emailTrim = newClient.email.trim();
  if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
    toast.error(t("documentCreatorContact.invalidEmail"));
    return null;
  }

  try {
    const res = await fetch("/api/crm/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: trimmedName,
        email: emailTrim || null,
        phone: newClient.phone.trim() || null,
        notes: newClient.notes.trim() || null,
        status: "LEAD",
      }),
    });
    const data = (await res.json()) as { contact?: DocumentClientContact; error?: string };
    if (!res.ok) { toast.error(data.error || t("documentCreatorContact.createClientFailed")); return null; }
    const created = data.contact;
    if (!created?.id) { toast.error(t("documentCreatorContact.createClientFailed")); return null; }
    const row: DocumentClientContact = {
      id: created.id,
      name: created.name,
      email: created.email ?? null,
      phone: created.phone ?? null,
    };
    setContacts((prev) => (prev.some((c) => c.id === row.id) ? prev : [row, ...prev]));
    setSelectedContactId(row.id);
    setClientNameInput(row.name);
    setIsNewClient(false);
    toast.success(t("documentCreatorContact.clientAdded"));
    return row;
  } catch {
    toast.error(t("documentCreatorContact.createClientError"));
    return null;
  }
}
