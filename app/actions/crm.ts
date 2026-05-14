"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function revalidateCrmAndRelated() {
  revalidatePath("/app/clients");
  revalidatePath("/app/business");
  revalidatePath("/app/inbox");
  revalidatePath("/app/crm");
  revalidatePath("/app/erp");
  revalidatePath("/app");
}

async function getOrgContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: "נדרשת התחברות" as const };
  }
  const orgId = session.user.organizationId ?? null;
  if (!orgId) {
    return { error: "אין ארגון משויך. עבור להגדרות או התחבר מחדש." as const };
  }
  return { orgId, userId: session.user.id };
}

export async function createContactAction(formData: FormData) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const name = String(formData.get("name") || "").trim();
  const emailRaw = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const status = String(formData.get("status") || "LEAD").trim();
  const projectRaw = String(formData.get("projectId") || "").trim();
  const valueRaw = String(formData.get("value") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!name) {
    return { ok: false as const, error: "יש להזין שם לקוח" };
  }

  let projectId: string | undefined;
  if (projectRaw) {
    const p = await prisma.project.findFirst({
      where: { id: projectRaw, organizationId: ctx.orgId },
      select: { id: true },
    });
    projectId = p?.id;
  }

  await prisma.contact.create({
    data: {
      name,
      email: emailRaw || null,
      phone: phone || null,
      notes: notes || null,
      value: valueRaw ? parseFloat(valueRaw) : null,
      status: status || "LEAD",
      organizationId: ctx.orgId,
      projectId: projectId ?? null,
    },
  });

  revalidateCrmAndRelated();
  return { ok: true as const };
}

export async function createProjectAction(formData: FormData) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const name = String(formData.get("name") || "").trim();
  if (!name) {
    return { ok: false as const, error: "יש להזין שם פרויקט" };
  }

  const activeFromRaw = String(formData.get("activeFrom") || "").trim();
  const activeToRaw = String(formData.get("activeTo") || "").trim();
  const isActive = formData.has("isActive") && formData.get("isActive") !== "off" && formData.get("isActive") !== "false";

  await prisma.project.create({
    data: {
      name,
      organizationId: ctx.orgId,
      isActive,
      activeFrom: activeFromRaw ? new Date(`${activeFromRaw}T12:00:00`) : null,
      activeTo: activeToRaw ? new Date(`${activeToRaw}T12:00:00`) : null,
    },
  });

  revalidateCrmAndRelated();
  return { ok: true as const };
}

export async function updateProjectAction(formData: FormData) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const projectId = String(formData.get("projectId") || "").trim();
  if (!projectId) return { ok: false as const, error: "חסר מזהה פרויקט" };

  const row = await prisma.project.findFirst({
    where: { id: projectId, organizationId: ctx.orgId },
  });
  if (!row) return { ok: false as const, error: "פרויקט לא נמצא" };

  const name = String(formData.get("name") || "").trim();
  if (!name) return { ok: false as const, error: "יש להזין שם פרויקט" };

  const activeFromRaw = String(formData.get("activeFrom") || "").trim();
  const activeToRaw = String(formData.get("activeTo") || "").trim();
  const isActive = formData.has("isActive") && formData.get("isActive") !== "off" && formData.get("isActive") !== "false";

  const meckanoZoneRaw = String(formData.get("meckanoZoneId") ?? "").trim();
  let meckanoZoneId: string | null = null;
  if (meckanoZoneRaw) {
    const zone = await prisma.meckanoZone.findFirst({
      where: { id: meckanoZoneRaw, organizationId: ctx.orgId },
      select: { id: true },
    });
    if (!zone) return { ok: false as const, error: "אזור Meckano לא נמצא או שייך לארגון אחר" };
    meckanoZoneId = zone.id;
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      name,
      isActive,
      activeFrom: activeFromRaw ? new Date(`${activeFromRaw}T12:00:00`) : null,
      activeTo: activeToRaw ? new Date(`${activeToRaw}T12:00:00`) : null,
      meckanoZoneId,
    },
  });

  revalidateCrmAndRelated();
  revalidatePath(`/app/crm/project/${projectId}`);
  return { ok: true as const };
}

export async function deleteContactAction(contactId: string) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const row = await prisma.contact.findFirst({
    where: { id: contactId, organizationId: ctx.orgId },
  });
  if (!row) {
    return { ok: false as const, error: "לקוח לא נמצא" };
  }

  await prisma.quote.deleteMany({ where: { contactId } });
  await prisma.contact.delete({ where: { id: contactId } });
  revalidateCrmAndRelated();
  return { ok: true as const };
}

export async function updateContactAction(input: {
  contactId: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  projectId: string;
  value: string;
  notes: string;
}) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const name = input.name.trim();
  if (!name) {
    return { ok: false as const, error: "יש להזין שם לקוח" };
  }

  const row = await prisma.contact.findFirst({
    where: { id: input.contactId, organizationId: ctx.orgId },
  });
  if (!row) {
    return { ok: false as const, error: "לקוח לא נמצא" };
  }

  let projectId: string | null = input.projectId.trim() || null;
  if (projectId) {
    const p = await prisma.project.findFirst({
      where: { id: projectId, organizationId: ctx.orgId },
      select: { id: true },
    });
    projectId = p?.id ?? null;
  }

  await prisma.contact.update({
    where: { id: input.contactId },
    data: {
      name,
      email: input.email.trim() || null,
      phone: input.phone.trim() || null,
      status: input.status.trim() || "LEAD",
      projectId,
      value: input.value.trim() ? parseFloat(input.value) : null,
      notes: input.notes.trim() || null,
    },
  });

  revalidateCrmAndRelated();
  return { ok: true as const };
}

export async function updateContactStatusAction(contactId: string, status: string) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const row = await prisma.contact.findFirst({
    where: { id: contactId, organizationId: ctx.orgId },
  });
  if (!row) return { ok: false as const, error: "לקוח לא נמצא" };

  await prisma.contact.update({ where: { id: contactId }, data: { status } });

  /* ── סנכרון ERP: כשעסקה נסגרת בהצלחה — צור חשבונית ממתינה אוטומטית ── */
  if (status === "CLOSED_WON") {
    const existingInvoice = await prisma.issuedDocument.findFirst({
      where: { contactId, organizationId: ctx.orgId, type: "INVOICE" },
      select: { id: true },
    });
    if (!existingInvoice) {
      const amount = row.value ?? 0;
      const vat = Math.round(amount * 0.17 * 100) / 100;
      const total = Math.round((amount + vat) * 100) / 100;
      const last = await prisma.issuedDocument.findFirst({
        where: { organizationId: ctx.orgId, type: "INVOICE" },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      const nextNumber = (last?.number ?? 1000) + 1;
      await prisma.issuedDocument.create({
        data: {
          type: "INVOICE",
          number: nextNumber,
          clientName: row.name,
          amount,
          vat,
          total,
          items: [{ desc: "שירותים / מוצרים — נסגרה עסקה ב-CRM", qty: 1, price: amount }] as unknown as object,
          status: "PENDING",
          organizationId: ctx.orgId,
          contactId,
        },
      });
    }
  }

  revalidateCrmAndRelated();
  return { ok: true as const };
}

export async function deleteProjectAction(projectId: string) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { ok: false as const, error: ctx.error };

  const row = await prisma.project.findFirst({
    where: { id: projectId, organizationId: ctx.orgId },
  });
  if (!row) return { ok: false as const, error: "פרויקט לא נמצא" };

  // Unlink contacts from this project before deleting
  await prisma.contact.updateMany({ where: { projectId, organizationId: ctx.orgId }, data: { projectId: null } });
  await prisma.project.delete({ where: { id: projectId } });
  revalidateCrmAndRelated();
  revalidatePath(`/app/crm/project/${projectId}`);
  return { ok: true as const };
}
