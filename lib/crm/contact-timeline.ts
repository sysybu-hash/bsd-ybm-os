import { prisma } from "@/lib/prisma";
import { documentTypeLabel } from "@/lib/document-types";
import { normalizeContactStatus } from "@/lib/crm/pipeline-status";
import type { DocType } from "@prisma/client";

export type ContactTimelineEvent = {
  id: string;
  at: string;
  kind: "document" | "quote" | "project" | "note" | "work_diary" | "status";
  title: string;
  detail?: string;
};

const QUOTE_STATUS_LABELS: Record<string, string> = {
  PENDING: "ממתין לחתימה",
  CLOSED_WON: "נחתם",
  CLOSED_LOST: "נדחה",
  SIGNED: "נחתם",
};

function formatIls(amount: number): string {
  return `₪${amount.toLocaleString("he-IL")}`;
}

export async function buildContactTimeline(
  contactId: string,
  organizationId: string,
): Promise<ContactTimelineEvent[]> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    select: {
      id: true,
      name: true,
      notes: true,
      status: true,
      value: true,
      createdAt: true,
      projectId: true,
      project: { select: { id: true, name: true, createdAt: true } },
      issuedDocuments: {
        orderBy: { createdAt: "desc" },
        take: 80,
        select: {
          id: true,
          type: true,
          number: true,
          total: true,
          status: true,
          date: true,
          createdAt: true,
        },
      },
      quotes: {
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          id: true,
          amount: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!contact) return [];

  const events: ContactTimelineEvent[] = [
    {
      id: `contact-created-${contact.id}`,
      at: contact.createdAt.toISOString(),
      kind: "note",
      title: "לקוח נוצר במערכת",
      detail: contact.value != null && contact.value > 0 ? `ערך עסקה: ${formatIls(contact.value)}` : undefined,
    },
  ];

  const pipelineStatus = normalizeContactStatus(contact.status);
  if (pipelineStatus !== "LEAD") {
    events.push({
      id: `contact-status-${contact.id}`,
      at: contact.createdAt.toISOString(),
      kind: "status",
      title: `סטטוס צינור מכירות: ${pipelineStatus}`,
    });
  }

  if (contact.notes?.trim()) {
    events.push({
      id: `contact-notes-${contact.id}`,
      at: contact.createdAt.toISOString(),
      kind: "note",
      title: "הערות לקוח",
      detail: contact.notes.trim(),
    });
  }

  if (contact.project) {
    events.push({
      id: `project-link-${contact.project.id}`,
      at: contact.project.createdAt.toISOString(),
      kind: "project",
      title: `שויך לפרויקט: ${contact.project.name}`,
    });
  }

  for (const doc of contact.issuedDocuments) {
    const label = documentTypeLabel(doc.type as DocType);
    const isQuote = doc.type === "QUOTE";
    events.push({
      id: `doc-${doc.id}`,
      at: (doc.date ?? doc.createdAt).toISOString(),
      kind: isQuote ? "quote" : "document",
      title: `${label} #${doc.number}`,
      detail: `${formatIls(doc.total)} · ${doc.status}`,
    });
  }

  for (const quote of contact.quotes) {
    const statusLabel = QUOTE_STATUS_LABELS[quote.status] ?? quote.status;
    const signedAt =
      quote.status === "CLOSED_WON" || quote.status === "SIGNED"
        ? quote.updatedAt.toISOString()
        : quote.createdAt.toISOString();
    events.push({
      id: `quote-${quote.id}`,
      at: quote.createdAt.toISOString(),
      kind: "quote",
      title: `הצעת מחיר · ${formatIls(quote.amount)}`,
      detail: statusLabel,
    });
    if (quote.updatedAt.getTime() > quote.createdAt.getTime() + 1000) {
      events.push({
        id: `quote-update-${quote.id}`,
        at: signedAt,
        kind: "quote",
        title: `עדכון הצעת מחיר · ${formatIls(quote.amount)}`,
        detail: statusLabel,
      });
    }
  }

  if (contact.projectId) {
    const diaries = await prisma.workDiary.findMany({
      where: { projectId: contact.projectId, organizationId },
      orderBy: { date: "desc" },
      take: 30,
      select: { id: true, date: true, description: true, workHours: true },
    });
    for (const row of diaries) {
      events.push({
        id: `diary-${row.id}`,
        at: row.date.toISOString(),
        kind: "work_diary",
        title: "רשומת יומן עבודה",
        detail: [row.description, row.workHours != null ? `${row.workHours} שעות` : null]
          .filter(Boolean)
          .join(" · "),
      });
    }
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
