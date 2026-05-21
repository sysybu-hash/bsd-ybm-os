import { prisma } from "@/lib/prisma";

export type CrmSyncDirection = "link_only" | "bidirectional" | "project_to_contact";
export type OnContactProjectChange = "sync" | "warn" | "block";

export type CrmSyncPolicy = {
  syncDirection?: CrmSyncDirection;
  onContactProjectChange?: OnContactProjectChange;
};

/** מניעת לולאות סנכרון דו-כיווני */
let syncInProgress = false;

export function isCrmSyncInProgress(): boolean {
  return syncInProgress;
}

export async function withCrmSyncGuard<T>(fn: () => Promise<T>): Promise<T> {
  if (syncInProgress) return fn();
  syncInProgress = true;
  try {
    return await fn();
  } finally {
    syncInProgress = false;
  }
}

function parsePolicy(raw: unknown): CrmSyncPolicy {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const syncDirection =
    o.syncDirection === "link_only" ||
    o.syncDirection === "bidirectional" ||
    o.syncDirection === "project_to_contact"
      ? o.syncDirection
      : undefined;
  const onContactProjectChange =
    o.onContactProjectChange === "sync" ||
    o.onContactProjectChange === "warn" ||
    o.onContactProjectChange === "block"
      ? o.onContactProjectChange
      : undefined;
  return { syncDirection, onContactProjectChange };
}

function directionAllowsContactToProject(policy: CrmSyncPolicy): boolean {
  const d = policy.syncDirection ?? "bidirectional";
  return d === "bidirectional" || d === "project_to_contact";
}

function directionAllowsProjectToContact(policy: CrmSyncPolicy): boolean {
  const d = policy.syncDirection ?? "bidirectional";
  return d === "bidirectional" || d === "link_only";
}

/** מסנכרן primaryContactId עם Contact.projectId כש-autoSyncCrm פעיל */
export async function syncProjectCrmContact(
  projectId: string,
  organizationId: string,
  primaryContactId: string | null | undefined,
  autoSyncCrm: boolean,
  opts?: { skipReverseSync?: boolean },
) {
  if (!autoSyncCrm || !primaryContactId || opts?.skipReverseSync || syncInProgress) return;

  await withCrmSyncGuard(async () => {
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { crmSyncPolicyJson: true },
    });
    const policy = parsePolicy(project?.crmSyncPolicyJson);
    if (!directionAllowsProjectToContact(policy)) return;

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
  });
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

/** כשמשנים Contact.projectId — מעדכן primaryContactId בפרויקט אם autoSyncCrm פעיל */
export async function syncContactToProject(
  contactId: string,
  projectId: string | null,
  organizationId: string,
  options?: { setPrimary?: boolean; skipReverseSync?: boolean },
) {
  if (!projectId || options?.skipReverseSync || syncInProgress) return;

  await withCrmSyncGuard(async () => {
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, autoSyncCrm: true, primaryContactId: true, crmSyncPolicyJson: true },
    });
    if (!project?.autoSyncCrm) return;

    const policy = parsePolicy(project.crmSyncPolicyJson);
    if (!directionAllowsContactToProject(policy)) return;

    const onChange = policy.onContactProjectChange ?? "sync";
    if (onChange === "block") return;

    const linkOnly = policy.syncDirection === "link_only" || onChange === "warn";
    const setPrimary = options?.setPrimary !== false && !linkOnly;
    if (setPrimary && project.primaryContactId !== contactId) {
      await prisma.project.update({
        where: { id: project.id },
        data: { primaryContactId: contactId },
      });
    }
  });
}

/** ניתוק: מנקה primaryContactId כשמדיניות מאפשרת */
async function unlinkContactFromProject(
  contactId: string,
  previousProjectId: string,
  organizationId: string,
) {
  const project = await prisma.project.findFirst({
    where: { id: previousProjectId, organizationId },
    select: { id: true, autoSyncCrm: true, primaryContactId: true, crmSyncPolicyJson: true },
  });
  if (!project?.autoSyncCrm || project.primaryContactId !== contactId) return;

  const policy = parsePolicy(project.crmSyncPolicyJson);
  if (policy.syncDirection === "project_to_contact") return;

  await prisma.project.update({
    where: { id: project.id },
    data: { primaryContactId: null },
  });
}

/** עדכון projectId על contact + סנכרון דו-כיווני */
export async function assignContactProject(
  contactId: string,
  projectId: string | null,
  organizationId: string,
) {
  const existing = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    select: { projectId: true },
  });
  if (!existing) throw new Error("איש קשר לא נמצא");

  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, crmSyncPolicyJson: true },
    });
    if (!project) throw new Error("פרויקט לא נמצא");

    const policy = parsePolicy(project.crmSyncPolicyJson);
    if (policy.onContactProjectChange === "block" && existing.projectId && existing.projectId !== projectId) {
      throw new Error("שינוי שיוך פרויקט חסום לפי מדיניות CRM");
    }
  }

  await withCrmSyncGuard(async () => {
    if (existing.projectId && existing.projectId !== projectId) {
      await unlinkContactFromProject(contactId, existing.projectId, organizationId);
    }

    await prisma.contact.update({
      where: { id: contactId },
      data: { projectId },
    });

    if (projectId) {
      await syncContactToProject(contactId, projectId, organizationId, { skipReverseSync: true });
    }
  });
}

/** בדיקה לפני שינוי שיוך ב-UI (אזהרה / חסימה) */
export async function evaluateContactProjectChange(
  contactId: string,
  nextProjectId: string | null,
  organizationId: string,
): Promise<{ allowed: boolean; warn?: string }> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    select: { projectId: true },
  });
  if (!contact) return { allowed: false };

  if (!nextProjectId || contact.projectId === nextProjectId) return { allowed: true };

  const project = await prisma.project.findFirst({
    where: { id: nextProjectId, organizationId },
    select: { crmSyncPolicyJson: true, name: true },
  });
  if (!project) return { allowed: false };

  const policy = parsePolicy(project.crmSyncPolicyJson);
  if (policy.onContactProjectChange === "block" && contact.projectId) {
    return { allowed: false, warn: "שינוי שיוך חסום לפי מדיניות הפרויקט" };
  }
  if (policy.onContactProjectChange === "warn" && contact.projectId) {
    return {
      allowed: true,
      warn: `הלקוח כבר משויך לפרויקט אחר. המשך יעדכן את השיוך ל«${project.name}».`,
    };
  }
  return { allowed: true };
}
