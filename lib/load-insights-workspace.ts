import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrencyILS } from "@/lib/ui-formatters";

type AiPayload = {
  vendor?: unknown;
};

function readAi(value: Prisma.JsonValue | null): AiPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as AiPayload) : {};
}

export type InsightsWorkspaceLoaderResult = {
  insightText: string;
  updatedAt: string | null;
  metrics: {
    label: string;
    value: string;
    icon: "revenue" | "review" | "contacts" | "pipeline";
  }[];
  signals: { title: string; body: string; tone: "accent" | "success" | "neutral" }[];
  health: { label: string; value: string; status: "good" | "attention" }[];
  recommendations: {
    id: string;
    source: string;
    title: string;
    body: string;
    href: string;
    cta: string;
    severity: "high" | "medium" | "low";
  }[];
  pendingClients: { name: string; total: number }[];
};

export async function loadInsightsWorkspaceProps(organizationId: string): Promise<InsightsWorkspaceLoaderResult> {
  const [financialInsight, documentsRaw, issuedDocumentsRaw, contactsRaw] = await Promise.all([
    prisma.financialInsight.findUnique({
      where: { organizationId },
      select: {
        content: true,
        updatedAt: true,
      },
    }),
    prisma.document.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        fileName: true,
        status: true,
        aiData: true,
        _count: {
          select: {
            lineItems: true,
          },
        },
      },
    }),
    prisma.issuedDocument.findMany({
      where: { organizationId },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 40,
      select: {
        id: true,
        clientName: true,
        total: true,
        status: true,
        dueDate: true,
      },
    }),
    prisma.contact.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        value: true,
      },
    }),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const reviewDocuments = documentsRaw.filter((document) => {
    const ai = readAi(document.aiData);
    const vendor = typeof ai.vendor === "string" ? ai.vendor.trim() : "";
    return document.status !== "PROCESSED" || document._count.lineItems === 0 || vendor.length === 0;
  });

  const pendingDocuments = issuedDocumentsRaw.filter((document) => document.status === "PENDING");
  const overdueDocuments = pendingDocuments.filter((document) => {
    if (!document.dueDate) return false;
    const dueDate = new Date(document.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  });

  const dueSoonDocuments = pendingDocuments.filter((document) => {
    if (!document.dueDate) return false;
    const dueDate = new Date(document.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    const diff = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
    return diff >= 0 && diff <= 7;
  });

  const pendingTotal = pendingDocuments.reduce((sum, document) => sum + document.total, 0);
  const paidTotal = issuedDocumentsRaw
    .filter((document) => document.status === "PAID")
    .reduce((sum, document) => sum + document.total, 0);

  const missingContacts = contactsRaw.filter((contact) => !contact.email || !contact.phone);
  const activePipeline = contactsRaw.filter((contact) =>
    ["LEAD", "ACTIVE", "PROPOSAL"].includes(contact.status),
  ).length;

  const pendingClients = Array.from(
    pendingDocuments.reduce((map, document) => {
      const nextValue = (map.get(document.clientName) ?? 0) + document.total;
      map.set(document.clientName, nextValue);
      return map;
    }, new Map<string, number>()),
  )
    .map(([name, total]) => ({ name, total }))
    .sort((left, right) => right.total - left.total)
    .slice(0, 4);

  const financeHref = "/app/erp";

  const recommendations = [
    ...(overdueDocuments.length > 0
      ? [
          {
            id: "overdue-collections",
            source: "גבייה",
            title: `${overdueDocuments.length} מסמכי גבייה נמצאים באיחור`,
            body: `יש כרגע ${overdueDocuments.length} מסמכים פתוחים באיחור בסך ${formatCurrencyILS(
              overdueDocuments.reduce((sum, document) => sum + document.total, 0),
            )}. זה המקום הראשון שכדאי לטפל בו עכשיו.`,
            href: financeHref,
            cta: "למרכז הכספים",
            severity: "high" as const,
          },
        ]
      : []),
    ...(reviewDocuments.length > 0
      ? [
          {
            id: "documents-review",
            source: "מסמכים",
            title: `${reviewDocuments.length} מסמכים דורשים בדיקה`,
            body: "יש מסמכים שלא עובדו עד הסוף, חסרות בהם שורות פריט, או שחסר להם הקשר ספק ברור.",
            href: "/app/erp",
            cta: "לחלון המסמכים",
            severity: "medium" as const,
          },
        ]
      : []),
    ...(missingContacts.length > 0
      ? [
          {
            id: "contacts-quality",
            source: "לקוחות",
            title: `${missingContacts.length} לקוחות עם פרטים חסרים`,
            body: "כדאי להשלים אימייל או טלפון כדי לאפשר המשך חיוב, תיאום והקצאת עבודה בלי עצירות מיותרות.",
            href: "/app/crm",
            cta: "לחלון הלקוחות",
            severity: "low" as const,
          },
        ]
      : []),
    ...(dueSoonDocuments.length > 0
      ? [
          {
            id: "due-soon",
            source: "תזרים",
            title: `${dueSoonDocuments.length} מסמכים מתקרבים ליעד תשלום`,
            body: "יש מסמכים שיגיעו ליעד תשלום בימים הקרובים, ולכן כדאי להכין מעקב לפני שהם הופכים לחריגים.",
            href: financeHref,
            cta: "למרכז הכספים",
            severity: "medium" as const,
          },
        ]
      : []),
  ];

  const insightText =
    financialInsight?.content ||
    [
      `כרגע יש ${pendingDocuments.length} מסמכי גבייה פתוחים בסך ${formatCurrencyILS(pendingTotal)}.`,
      reviewDocuments.length > 0
        ? `${reviewDocuments.length} מסמכים עדיין דורשים בדיקה לפני שהם הופכים לזרימת עבודה סגורה.`
        : "זרימת המסמכים נראית תקינה כרגע בלי עומס בדיקות חריג.",
      missingContacts.length > 0
        ? `${missingContacts.length} לקוחות חסרים פרטי קשר מלאים, וזה עלול לייצר עצירות בהמשך התהליך.`
        : "רשומות הלקוחות שלמות יחסית ואין כרגע חוסרים מהותיים בפרטי קשר.",
    ].join("\n\n");

  const health = [
    {
      label: "גבייה",
      value: `${pendingDocuments.length} מסמכים פתוחים · ${overdueDocuments.length} באיחור`,
      status: overdueDocuments.length > 0 ? ("attention" as const) : ("good" as const),
    },
    {
      label: "מסמכים",
      value: `${reviewDocuments.length} לבדיקה מתוך ${documentsRaw.length} מסמכים אחרונים`,
      status: reviewDocuments.length > 0 ? ("attention" as const) : ("good" as const),
    },
    {
      label: "לקוחות",
      value: `${missingContacts.length} רשומות עם חוסרים מתוך ${contactsRaw.length} לקוחות`,
      status: missingContacts.length > 0 ? ("attention" as const) : ("good" as const),
    },
    {
      label: "תובנה יומית",
      value: financialInsight?.updatedAt
        ? `עודכן ב-${financialInsight.updatedAt.toLocaleString("he-IL")}`
        : "עדיין אין תובנה שמורה במסד",
      status: financialInsight ? ("good" as const) : ("attention" as const),
    },
  ];

  const signals = [
    {
      title: "חשיפה פיננסית פתוחה",
      body:
        pendingDocuments.length > 0
          ? `יש ${pendingDocuments.length} מסמכים פתוחים בהיקף של ${formatCurrencyILS(pendingTotal)}.`
          : "אין כרגע מסמכי גבייה פתוחים, והתמונה הפיננסית רגועה.",
      tone: overdueDocuments.length > 0 ? ("accent" as const) : ("success" as const),
    },
    {
      title: "איכות עיבוד המסמכים",
      body:
        reviewDocuments.length > 0
          ? `${reviewDocuments.length} מסמכים דורשים בדיקה לפני שאפשר לסמוך עליהם לאורך הזרימה.`
          : "כל המסמכים האחרונים עברו עיבוד תקין ונראים מוכנים להמשך.",
      tone: reviewDocuments.length > 0 ? ("neutral" as const) : ("success" as const),
    },
    {
      title: "בריאות הלקוחות והצנרת",
      body:
        missingContacts.length > 0
          ? `יש ${missingContacts.length} לקוחות עם חוסרים, לצד ${activePipeline} רשומות פעילות בצנרת.`
          : `פרטי הלקוחות נראים מלאים, עם ${activePipeline} רשומות פעילות בצנרת.`,
      tone: missingContacts.length > 0 ? ("neutral" as const) : ("accent" as const),
    },
  ];

  const metrics = [
    {
      label: "מחזור משולם",
      value: formatCurrencyILS(paidTotal),
      icon: "revenue" as const,
    },
    {
      label: "מסמכים לבדיקה",
      value: reviewDocuments.length.toString(),
      icon: "review" as const,
    },
    {
      label: "לקוחות עם חוסרים",
      value: missingContacts.length.toString(),
      icon: "contacts" as const,
    },
    {
      label: "צנרת פעילה",
      value: activePipeline.toString(),
      icon: "pipeline" as const,
    },
  ];

  return {
    insightText,
    updatedAt: financialInsight?.updatedAt?.toISOString() ?? null,
    metrics,
    signals,
    health,
    recommendations,
    pendingClients,
  };
}
