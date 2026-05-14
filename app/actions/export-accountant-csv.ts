"use server";

import { getServerSession } from "next-auth";
import { DocStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function monthStart(d: Date) {
  const t = new Date(d);
  t.setDate(1);
  t.setHours(0, 0, 0, 0);
  return t;
}

function csvEscape(s: string) {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function exportAccountantMonthCsvAction(): Promise<
  { ok: true; filename: string; csv: string } | { ok: false; error: string }
> {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.organizationId;
  if (!session?.user?.id || !orgId) {
    return { ok: false, error: "אין ארגון משויך" };
  }

  const start = monthStart(new Date());
  const label = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;

  const [issued, expenseDocs] = await Promise.all([
    prisma.issuedDocument.findMany({
      where: { organizationId: orgId, date: { gte: start } },
      orderBy: { date: "asc" },
    }),
    prisma.document.findMany({
      where: { organizationId: orgId, createdAt: { gte: start } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const lines: string[] = [];
  lines.push(["סוג", "תאריך", "תיאור", "סכום", "מטבע", "הערות"].map(csvEscape).join(","));

  for (const d of issued) {
    if (d.status === DocStatus.CANCELLED) continue;
    lines.push(
      [
        "הכנסה_מסמך_מונפק",
        d.date.toISOString().slice(0, 10),
        `מס׳ ${d.number} ${d.clientName}`,
        String(d.total),
        "ILS",
        d.type,
      ]
        .map((x) => csvEscape(String(x)))
        .join(","),
    );
  }

  for (const d of expenseDocs) {
    const ai = d.aiData as { total?: number; supplier?: string } | null;
    const total = ai?.total ?? 0;
    const desc = ai?.supplier || d.fileName || d.type;
    lines.push(
      [
        "הוצאה_מסמך_סריקה",
        d.createdAt.toISOString().slice(0, 10),
        desc,
        String(total),
        "ILS",
        d.type,
      ]
        .map((x) => csvEscape(String(x)))
        .join(","),
    );
  }

  const csv = "\uFEFF" + lines.join("\r\n");
  return {
    ok: true,
    filename: `bsd-ybm-accountant-${label}.csv`,
    csv,
  };
}
