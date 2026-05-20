import { prisma } from "@/lib/prisma";

/** מסנכרן primaryContactId עם Contact.projectId כש-autoSyncCrm פעיל */
export async function syncProjectCrmContact(
  projectId: string,
  organizationId: string,
  primaryContactId: string | null | undefined,
  autoSyncCrm: boolean,
) {
  if (!autoSyncCrm || !primaryContactId) return;

  const contact = await prisma.contact.findFirst({
    where: { id: primaryContactId, organizationId },
    select: { id: true, projectId: true },
  });
  if (!contact) return;

  if (contact.projectId !== projectId) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { projectId },
    });
  }
}

/** אם autoSync פעיל ואין לקוח ראשי — בוחר contact יחיד של הפרויקט */
export async function resolvePrimaryContactId(
  projectId: string,
  organizationId: string,
  primaryContactId: string | null | undefined,
  autoSyncCrm: boolean,
): Promise<string | null | undefined> {
  if (primaryContactId) return primaryContactId;
  if (!autoSyncCrm) return primaryContactId;

  const contacts = await prisma.contact.findMany({
    where: { projectId, organizationId },
    select: { id: true },
    take: 2,
  });
  if (contacts.length === 1) return contacts[0].id;
  return primaryContactId ?? null;
}
