import { prisma } from "@/lib/prisma";
import { documentTypeLabel } from "@/lib/document-types";
import type { DocType } from "@prisma/client";

export type ContactTimelineEvent = {
  id: string;
  at: string;
  kind: "document" | "quote" | "project" | "note" | "work_diary";
  title: string;
  detail?: string;
};

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
          createdAt: true,
        },
      },
      quotes: {
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { id: true, amount: true, status: true, createdAt: true },
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
    },
  ];

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
    events.push({
      id: `doc-${doc.id}`,
      at: doc.createdAt.toISOString(),
      kind: "document",
      title: `${label} #${doc.number}`,
      detail: `₪${doc.total.toLocaleString("he-IL")} · ${doc.status}`,
    });
  }

  for (const quote of contact.quotes) {
    events.push({
      id: `quote-${quote.id}`,
      at: quote.createdAt.toISOString(),
      kind: "quote",
      title: `Quote · ${quote.amount}`,
      detail: quote.status,
    });
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
