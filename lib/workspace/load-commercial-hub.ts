import { DocType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  readScanProjectClientLabels,
  scannedDocumentNeedsCompletion,
} from "@/lib/commercial-billing-helpers";
import { loadFinanceForecast, type FinanceForecast } from "@/lib/finance-forecast";

export * from "@/lib/workspace/commercial-hub-types";
import type {
  CommercialClientSnapshot,
  CommercialDocumentDraftSnapshot,
  CommercialHubSnapshot,
  CommercialIssuedDocumentSnapshot,
  CommercialProjectSnapshot,
} from "@/lib/workspace/commercial-hub-types";

export async function loadCommercialHubSnapshot(
  organizationId: string,
): Promise<CommercialHubSnapshot> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const prevMonthStart = new Date(monthStart);
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);

  const [
    contactsRaw,
    projectsRaw,
    recentIssuedRaw,
    documentsForDrafts,
    forecast,
    issuedThisMonth,
    issuedPrevMonth,
    pendingIssuedAgg,
    pendingBillingAgg,
    paidIssuedAgg,
  ] = await Promise.all([
    prisma.contact.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        notes: true,
        status: true,
        value: true,
        createdAt: true,
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        issuedDocuments: {
          select: {
            total: true,
            status: true,
          },
        },
      },
    }),
    prisma.project.findMany({
      where: { organizationId },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        isActive: true,
        activeFrom: true,
        activeTo: true,
        _count: {
          select: {
            contacts: true,
          },
        },
      },
    }),
    prisma.issuedDocument.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        type: true,
        status: true,
        clientName: true,
        total: true,
        date: true,
        contactId: true,
        contact: {
          select: {
            email: true,
            name: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.document.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        fileName: true,
        status: true,
        aiData: true,
        createdAt: true,
        _count: { select: { lineItems: true } },
      },
    }),
    loadFinanceForecast(organizationId),
    prisma.issuedDocument.aggregate({
      where: { organizationId, date: { gte: monthStart } },
      _sum: { total: true },
    }),
    prisma.issuedDocument.aggregate({
      where: { organizationId, date: { gte: prevMonthStart, lt: monthStart } },
      _sum: { total: true },
    }),
    prisma.issuedDocument.aggregate({
      where: { organizationId, status: "PENDING" },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.issuedDocument.aggregate({
      where: {
        organizationId,
        status: "PENDING",
        type: { in: [DocType.INVOICE, DocType.INVOICE_RECEIPT] },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.issuedDocument.aggregate({
      where: { organizationId, status: "PAID" },
      _sum: { total: true },
      _count: { _all: true },
    }),
  ]);

  const projectMetrics = new Map<
    string,
    { totalValue: number; activeDeals: number; pendingCollection: number; billedTotal: number }
  >();

  const contacts = contactsRaw.map((contact) => {
    const totalBilled = contact.issuedDocuments.reduce((sum, document) => sum + document.total, 0);
    const totalPending = contact.issuedDocuments
      .filter((document) => document.status === "PENDING")
      .reduce((sum, document) => sum + document.total, 0);

    if (contact.project?.id) {
      const current = projectMetrics.get(contact.project.id) ?? {
        totalValue: 0,
        activeDeals: 0,
        pendingCollection: 0,
        billedTotal: 0,
      };
      current.totalValue += contact.value ?? 0;
      current.pendingCollection += totalPending;
      current.billedTotal += totalBilled;
      if (!["LOST", "CLOSED_LOST"].includes(contact.status)) {
        current.activeDeals += 1;
      }
      projectMetrics.set(contact.project.id, current);
    }

    return {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      notes: contact.notes,
      status: contact.status,
      value: contact.value,
      createdAt: contact.createdAt.toISOString(),
      project: contact.project,
      invoiceCount: contact.issuedDocuments.length,
      totalBilled,
      totalPending,
    } satisfies CommercialClientSnapshot;
  });

  const projects = projectsRaw.map((project) => {
    const metrics = projectMetrics.get(project.id) ?? {
      totalValue: 0,
      activeDeals: 0,
      pendingCollection: 0,
      billedTotal: 0,
    };

    return {
      id: project.id,
      name: project.name,
      isActive: project.isActive,
      activeFrom: project.activeFrom?.toISOString() ?? null,
      activeTo: project.activeTo?.toISOString() ?? null,
      contactCount: project._count.contacts,
      totalValue: metrics.totalValue,
      activeDeals: metrics.activeDeals,
      pendingCollection: metrics.pendingCollection,
      billedTotal: metrics.billedTotal,
    } satisfies CommercialProjectSnapshot;
  });

  const recentIssued = recentIssuedRaw.map((document) => ({
    id: document.id,
    type: document.type,
    status: document.status,
    clientName: document.clientName,
    total: document.total,
    date: document.date.toISOString(),
    contactId: document.contactId,
    projectName: document.contact?.project?.name ?? null,
    projectId: document.contact?.project?.id ?? null,
    contactEmail: document.contact?.email ?? null,
  }));

  const documentsNeedingWork = documentsForDrafts.filter((d) => scannedDocumentNeedsCompletion(d));
  const documentDrafts = documentsNeedingWork.slice(0, 8).map((d) => {
    const labels = readScanProjectClientLabels(d.aiData);
    return {
      id: d.id,
      fileName: d.fileName,
      createdAt: d.createdAt.toISOString(),
      projectLabel: labels.projectLabel,
      clientLabel: labels.clientLabel,
    } satisfies CommercialDocumentDraftSnapshot;
  });

  const issuedThisSum = issuedThisMonth._sum.total ?? 0;
  const issuedPrevSum = issuedPrevMonth._sum.total ?? 0;
  const issuedMonthOverMonthPct =
    issuedPrevSum > 0
      ? Math.round(((issuedThisSum - issuedPrevSum) / issuedPrevSum) * 100)
      : issuedThisSum > 0
        ? 100
        : 0;

  return {
    forecast,
    contacts,
    projects,
    recentIssued,
    documentDrafts,
    issuedMonthOverMonthPct,
    totals: {
      clientsCount: contacts.length,
      activeProjects: projects.filter((project) => project.isActive).length,
      pipelineValue: contacts.reduce((sum, contact) => sum + (contact.value ?? 0), 0),
      pendingCollection: contacts.reduce((sum, contact) => sum + contact.totalPending, 0),
      pendingIssuedTotal: pendingIssuedAgg._sum.total ?? 0,
      pendingIssuedCount: pendingIssuedAgg._count._all,
      billingPendingTotal: pendingBillingAgg._sum.total ?? 0,
      billingPendingCount: pendingBillingAgg._count._all,
      documentDraftsCount: documentsNeedingWork.length,
      paidIssuedTotal: paidIssuedAgg._sum.total ?? 0,
      paidIssuedCount: paidIssuedAgg._count._all,
    },
  };
}

