"use server";

import {
  type ChartDataPoint,
} from "@/lib/app-builder/dashboard-allowlists";
import { prisma } from "@/lib/prisma";
import type { DataConfig } from "@/lib/validation/schemas/app-builder";

export async function fetchProjectsData(orgId: string, config: DataConfig): Promise<ChartDataPoint[]> {
  if (config.aggregation === "raw") {
    const rows = await prisma.project.findMany({
      where: { organizationId: orgId },
      select: { name: true, budget: true },
      take: 50,
    });
    return rows.map((row) => ({ name: row.name, value: row.budget }));
  }

  if (config.aggregation === "count" && config.groupBy === "status") {
    const grouped = await prisma.project.groupBy({
      by: ["status"],
      _count: { id: true },
      where: { organizationId: orgId },
    });
    return grouped.map((g) => ({ name: g.status, value: g._count.id }));
  }

  if (config.aggregation === "count") {
    const total = await prisma.project.count({ where: { organizationId: orgId } });
    return [{ name: "Total", value: total }];
  }

  if (config.valueField === "budget" && config.aggregation === "sum" && config.groupBy === "status") {
    const grouped = await prisma.project.groupBy({
      by: ["status"],
      _sum: { budget: true },
      where: { organizationId: orgId },
    });
    return grouped.map((g) => ({ name: g.status, value: g._sum.budget ?? 0 }));
  }

  if (config.valueField === "budget" && config.aggregation === "sum") {
    const agg = await prisma.project.aggregate({
      where: { organizationId: orgId },
      _sum: { budget: true },
    });
    return [{ name: "Total budget", value: agg._sum.budget ?? 0 }];
  }

  if (config.valueField === "budget" && config.aggregation === "avg") {
    const agg = await prisma.project.aggregate({
      where: { organizationId: orgId },
      _avg: { budget: true },
    });
    return [{ name: "Avg budget", value: agg._avg.budget ?? 0 }];
  }

  return [];
}

async function sumExpensesByGroup(
  orgId: string,
  groupBy: "allocation" | "status",
  field: "total" | "amountNet" | "vat",
): Promise<ChartDataPoint[]> {
  if (groupBy === "allocation") {
    if (field === "amountNet") {
      const grouped = await prisma.expenseRecord.groupBy({
        by: ["allocation"],
        _sum: { amountNet: true },
        where: { organizationId: orgId },
      });
      return grouped.map((g) => ({ name: g.allocation, value: g._sum.amountNet ?? 0 }));
    }
    if (field === "vat") {
      const grouped = await prisma.expenseRecord.groupBy({
        by: ["allocation"],
        _sum: { vat: true },
        where: { organizationId: orgId },
      });
      return grouped.map((g) => ({ name: g.allocation, value: g._sum.vat ?? 0 }));
    }
    const grouped = await prisma.expenseRecord.groupBy({
      by: ["allocation"],
      _sum: { total: true },
      where: { organizationId: orgId },
    });
    return grouped.map((g) => ({ name: g.allocation, value: g._sum.total ?? 0 }));
  }

  if (field === "amountNet") {
    const grouped = await prisma.expenseRecord.groupBy({
      by: ["status"],
      _sum: { amountNet: true },
      where: { organizationId: orgId },
    });
    return grouped.map((g) => ({ name: g.status, value: g._sum.amountNet ?? 0 }));
  }
  if (field === "vat") {
    const grouped = await prisma.expenseRecord.groupBy({
      by: ["status"],
      _sum: { vat: true },
      where: { organizationId: orgId },
    });
    return grouped.map((g) => ({ name: g.status, value: g._sum.vat ?? 0 }));
  }
  const grouped = await prisma.expenseRecord.groupBy({
    by: ["status"],
    _sum: { total: true },
    where: { organizationId: orgId },
  });
  return grouped.map((g) => ({ name: g.status, value: g._sum.total ?? 0 }));
}

export async function fetchExpensesData(orgId: string, config: DataConfig): Promise<ChartDataPoint[]> {
  const valueField = (config.valueField ?? "total") as "total" | "amountNet" | "vat";

  if (config.aggregation === "raw") {
    const rows = await prisma.expenseRecord.findMany({
      where: { organizationId: orgId },
      select: { vendorName: true, total: true },
      take: 50,
      orderBy: { expenseDate: "desc" },
    });
    return rows.map((row) => ({ name: row.vendorName, value: row.total }));
  }

  if (config.aggregation === "count" && config.groupBy === "allocation") {
    const grouped = await prisma.expenseRecord.groupBy({
      by: ["allocation"],
      _count: { id: true },
      where: { organizationId: orgId },
    });
    return grouped.map((g) => ({ name: g.allocation, value: g._count.id }));
  }

  if (config.aggregation === "count" && config.groupBy === "status") {
    const grouped = await prisma.expenseRecord.groupBy({
      by: ["status"],
      _count: { id: true },
      where: { organizationId: orgId },
    });
    return grouped.map((g) => ({ name: g.status, value: g._count.id }));
  }

  if (config.aggregation === "count") {
    const total = await prisma.expenseRecord.count({ where: { organizationId: orgId } });
    return [{ name: "Total", value: total }];
  }

  if (config.aggregation === "sum") {
    if (config.groupBy === "allocation" || config.groupBy === "status") {
      return sumExpensesByGroup(orgId, config.groupBy, valueField);
    }
    if (valueField === "amountNet") {
      const agg = await prisma.expenseRecord.aggregate({
        where: { organizationId: orgId },
        _sum: { amountNet: true },
      });
      return [{ name: valueField, value: agg._sum.amountNet ?? 0 }];
    }
    if (valueField === "vat") {
      const agg = await prisma.expenseRecord.aggregate({
        where: { organizationId: orgId },
        _sum: { vat: true },
      });
      return [{ name: valueField, value: agg._sum.vat ?? 0 }];
    }
    const agg = await prisma.expenseRecord.aggregate({
      where: { organizationId: orgId },
      _sum: { total: true },
    });
    return [{ name: valueField, value: agg._sum.total ?? 0 }];
  }

  if (config.aggregation === "avg") {
    if (valueField === "amountNet") {
      const agg = await prisma.expenseRecord.aggregate({
        where: { organizationId: orgId },
        _avg: { amountNet: true },
      });
      return [{ name: `Avg ${valueField}`, value: agg._avg.amountNet ?? 0 }];
    }
    if (valueField === "vat") {
      const agg = await prisma.expenseRecord.aggregate({
        where: { organizationId: orgId },
        _avg: { vat: true },
      });
      return [{ name: `Avg ${valueField}`, value: agg._avg.vat ?? 0 }];
    }
    const agg = await prisma.expenseRecord.aggregate({
      where: { organizationId: orgId },
      _avg: { total: true },
    });
    return [{ name: `Avg ${valueField}`, value: agg._avg.total ?? 0 }];
  }

  return [];
}

export async function fetchContactsData(orgId: string, config: DataConfig): Promise<ChartDataPoint[]> {
  const where = { organizationId: orgId };

  if (config.aggregation === "raw") {
    const rows = await prisma.contact.findMany({
      where,
      select: { name: true, value: true },
      take: 50,
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({ name: row.name, value: row.value ?? 0 }));
  }

  if (config.aggregation === "count" && config.groupBy === "status") {
    const grouped = await prisma.contact.groupBy({
      by: ["status"],
      _count: { id: true },
      where,
    });
    return grouped.map((g) => ({ name: g.status, value: g._count.id }));
  }

  if (config.aggregation === "count") {
    const total = await prisma.contact.count({ where });
    return [{ name: "Total", value: total }];
  }

  if (config.valueField === "value" && config.aggregation === "sum" && config.groupBy === "status") {
    const grouped = await prisma.contact.groupBy({
      by: ["status"],
      _sum: { value: true },
      where,
    });
    return grouped.map((g) => ({ name: g.status, value: g._sum.value ?? 0 }));
  }

  if (config.valueField === "value" && config.aggregation === "sum") {
    const agg = await prisma.contact.aggregate({ where, _sum: { value: true } });
    return [{ name: "Total value", value: agg._sum.value ?? 0 }];
  }

  if (config.valueField === "value" && config.aggregation === "avg") {
    const agg = await prisma.contact.aggregate({ where, _avg: { value: true } });
    return [{ name: "Avg value", value: agg._avg.value ?? 0 }];
  }

  return [];
}

export async function fetchTasksData(orgId: string, config: DataConfig): Promise<ChartDataPoint[]> {
  const where = { organizationId: orgId };

  if (config.aggregation === "raw") {
    const rows = await prisma.task.findMany({
      where,
      select: { title: true, progress: true },
      take: 50,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((row) => ({ name: row.title, value: row.progress }));
  }

  if (config.aggregation === "count" && config.groupBy === "status") {
    const grouped = await prisma.task.groupBy({
      by: ["status"],
      _count: { id: true },
      where,
    });
    return grouped.map((g) => ({ name: g.status, value: g._count.id }));
  }

  if (config.aggregation === "count" && config.groupBy === "priority") {
    const grouped = await prisma.task.groupBy({
      by: ["priority"],
      _count: { id: true },
      where,
    });
    return grouped.map((g) => ({ name: g.priority, value: g._count.id }));
  }

  if (config.aggregation === "count") {
    const total = await prisma.task.count({ where });
    return [{ name: "Total", value: total }];
  }

  return [];
}

type IssuedDocSumField = "amount" | "total" | "vat";

async function sumIssuedDocsByGroup(
  orgId: string,
  groupBy: "type" | "status",
  field: IssuedDocSumField,
): Promise<ChartDataPoint[]> {
  const where = { organizationId: orgId, deletedAt: null };
  if (field === "amount") {
    const grouped = await prisma.issuedDocument.groupBy({
      by: [groupBy],
      _sum: { amount: true },
      where,
    });
    return grouped.map((g) => ({ name: String(g[groupBy]), value: g._sum.amount ?? 0 }));
  }
  if (field === "vat") {
    const grouped = await prisma.issuedDocument.groupBy({
      by: [groupBy],
      _sum: { vat: true },
      where,
    });
    return grouped.map((g) => ({ name: String(g[groupBy]), value: g._sum.vat ?? 0 }));
  }
  const grouped = await prisma.issuedDocument.groupBy({
    by: [groupBy],
    _sum: { total: true },
    where,
  });
  return grouped.map((g) => ({ name: String(g[groupBy]), value: g._sum.total ?? 0 }));
}

export async function fetchIssuedDocumentsData(orgId: string, config: DataConfig): Promise<ChartDataPoint[]> {
  const where = { organizationId: orgId, deletedAt: null };
  const valueField = (config.valueField ?? "total") as IssuedDocSumField;

  if (config.aggregation === "raw") {
    const rows = await prisma.issuedDocument.findMany({
      where,
      select: { clientName: true, total: true },
      take: 50,
      orderBy: { date: "desc" },
    });
    return rows.map((row) => ({ name: row.clientName, value: row.total }));
  }

  if (config.aggregation === "count" && config.groupBy === "type") {
    const grouped = await prisma.issuedDocument.groupBy({
      by: ["type"],
      _count: { id: true },
      where,
    });
    return grouped.map((g) => ({ name: g.type, value: g._count.id }));
  }

  if (config.aggregation === "count" && config.groupBy === "status") {
    const grouped = await prisma.issuedDocument.groupBy({
      by: ["status"],
      _count: { id: true },
      where,
    });
    return grouped.map((g) => ({ name: g.status, value: g._count.id }));
  }

  if (config.aggregation === "count") {
    const total = await prisma.issuedDocument.count({ where });
    return [{ name: "Total", value: total }];
  }

  if (config.aggregation === "sum") {
    if (config.groupBy === "type" || config.groupBy === "status") {
      return sumIssuedDocsByGroup(orgId, config.groupBy, valueField);
    }
    if (valueField === "amount") {
      const agg = await prisma.issuedDocument.aggregate({ where, _sum: { amount: true } });
      return [{ name: valueField, value: agg._sum.amount ?? 0 }];
    }
    if (valueField === "vat") {
      const agg = await prisma.issuedDocument.aggregate({ where, _sum: { vat: true } });
      return [{ name: valueField, value: agg._sum.vat ?? 0 }];
    }
    const agg = await prisma.issuedDocument.aggregate({ where, _sum: { total: true } });
    return [{ name: valueField, value: agg._sum.total ?? 0 }];
  }

  if (config.aggregation === "avg") {
    if (valueField === "amount") {
      const agg = await prisma.issuedDocument.aggregate({ where, _avg: { amount: true } });
      return [{ name: `Avg ${valueField}`, value: agg._avg.amount ?? 0 }];
    }
    if (valueField === "vat") {
      const agg = await prisma.issuedDocument.aggregate({ where, _avg: { vat: true } });
      return [{ name: `Avg ${valueField}`, value: agg._avg.vat ?? 0 }];
    }
    const agg = await prisma.issuedDocument.aggregate({ where, _avg: { total: true } });
    return [{ name: `Avg ${valueField}`, value: agg._avg.total ?? 0 }];
  }

  return [];
}

export async function fetchCustomAppData(orgId: string, config: DataConfig): Promise<ChartDataPoint[]> {
  const where: { organizationId: string; schemaId?: string } = { organizationId: orgId };
  if (config.schemaId) {
    where.schemaId = config.schemaId;
  }

  if (config.aggregation === "raw") {
    const rows = await prisma.customAppData.findMany({
      where,
      select: { id: true, createdAt: true },
      take: 20,
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row, i) => ({
      name: row.createdAt.toISOString().slice(0, 10) || `Row ${i + 1}`,
      value: 1,
    }));
  }

  const total = await prisma.customAppData.count({ where });
  return [{ name: "Records", value: total }];
}
