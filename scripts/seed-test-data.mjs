#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const seedMarkerPath = path.resolve(process.cwd(), ".e2e-demo-seeded.json");

const DEMO_DOMAIN = "demo.bsd-ybm.test";
const PASSWORD = "Demo!2026";

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(days) {
  return daysFromNow(-days);
}

function normalizeKey(value) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

async function resetDemoOrg(organizationId, userIds) {
  await prisma.activityLog.deleteMany({ where: { organizationId } });
  await prisma.inAppNotification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.productPriceObservation.deleteMany({ where: { organizationId } });
  await prisma.documentLineItem.deleteMany({ where: { organizationId } });
  await prisma.documentScanCache.deleteMany({ where: { organizationId } });
  await prisma.documentScanJob.deleteMany({ where: { organizationId } });
  await prisma.document.deleteMany({ where: { organizationId } });
  await prisma.financialInsight.deleteMany({ where: { organizationId } });
  await prisma.quote.deleteMany({ where: { organizationId } });
  await prisma.issuedDocument.deleteMany({ where: { organizationId } });
  await prisma.invoice.deleteMany({ where: { organizationId } });
  await prisma.contact.deleteMany({ where: { organizationId } });
  await prisma.project.deleteMany({ where: { organizationId } });
  await prisma.cloudIntegration.deleteMany({ where: { organizationId } });
  await prisma.meckanoZone.deleteMany({ where: { organizationId } });
  await prisma.organizationInvite.deleteMany({ where: { organizationId } });
}

async function upsertUser({ email, name, role, organizationId, passwordHash }) {
  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      role,
      accountStatus: "ACTIVE",
      organizationId,
      passwordHash,
      emailVerified: new Date(),
    },
    create: {
      email,
      name,
      role,
      accountStatus: "ACTIVE",
      organizationId,
      passwordHash,
      emailVerified: new Date(),
    },
  });
}

async function main() {
  fs.rmSync(seedMarkerPath, { force: true });

  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed test data in production mode.");
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const organization = await prisma.organization.upsert({
    where: { tenantPublicDomain: DEMO_DOMAIN },
    update: {
      name: "BSD Demo Build Ltd",
      type: "COMPANY",
      companyType: "LICENSED_DEALER",
      taxId: "515555555",
      address: "רחוב יפו 216, ירושלים",
      subscriptionTier: "CORPORATE",
      subscriptionStatus: "ACTIVE",
      cheapScansRemaining: 240,
      premiumScansRemaining: 48,
      maxCompanies: 25,
      isVip: true,
      isReportable: true,
      calendarGoogleEnabled: true,
      paypalMerchantEmail: "payments@bsd-demo.test",
      paypalMeSlug: "bsd-demo-build",
      liveDataTier: "premium",
      industry: "CONSTRUCTION",
      constructionTrade: "GENERAL_CONTRACTOR",
      tenantSiteBrandingJson: {
        landingTitle: "BSD Demo Build",
        tagline: "CRM + ERP + AI לענף הבנייה",
        primaryColor: "#0f766e",
      },
      billingWorkspaceJson: {
        insuranceDraft: true,
        referralCredits: 3,
        onboardingDone: true,
      },
      industryConfigJson: {
        trade: "GENERAL_CONTRACTOR",
        defaultVatRate: 17,
        boqMode: true,
      },
    },
    create: {
      name: "BSD Demo Build Ltd",
      type: "COMPANY",
      companyType: "LICENSED_DEALER",
      taxId: "515555555",
      address: "רחוב יפו 216, ירושלים",
      subscriptionTier: "CORPORATE",
      subscriptionStatus: "ACTIVE",
      cheapScansRemaining: 240,
      premiumScansRemaining: 48,
      maxCompanies: 25,
      isVip: true,
      isReportable: true,
      calendarGoogleEnabled: true,
      tenantPublicDomain: DEMO_DOMAIN,
      paypalMerchantEmail: "payments@bsd-demo.test",
      paypalMeSlug: "bsd-demo-build",
      liveDataTier: "premium",
      industry: "CONSTRUCTION",
      constructionTrade: "GENERAL_CONTRACTOR",
      tenantSiteBrandingJson: {
        landingTitle: "BSD Demo Build",
        tagline: "CRM + ERP + AI לענף הבנייה",
        primaryColor: "#0f766e",
      },
      billingWorkspaceJson: {
        insuranceDraft: true,
        referralCredits: 3,
        onboardingDone: true,
      },
      industryConfigJson: {
        trade: "GENERAL_CONTRACTOR",
        defaultVatRate: 17,
        boqMode: true,
      },
    },
  });

  const users = await Promise.all([
    upsertUser({
      email: "owner@bsd-demo.test",
      name: "יואב בן דוד",
      role: "ORG_ADMIN",
      organizationId: organization.id,
      passwordHash,
    }),
    upsertUser({
      email: "pm@bsd-demo.test",
      name: "מיכל לוי",
      role: "PROJECT_MGR",
      organizationId: organization.id,
      passwordHash,
    }),
    upsertUser({
      email: "finance@bsd-demo.test",
      name: "דניאל כהן",
      role: "EMPLOYEE",
      organizationId: organization.id,
      passwordHash,
    }),
    upsertUser({
      email: "client@bsd-demo.test",
      name: "רונית אדרי",
      role: "CLIENT",
      organizationId: organization.id,
      passwordHash,
    }),
  ]);

  await resetDemoOrg(
    organization.id,
    users.map((u) => u.id),
  );

  await prisma.platformBillingConfig.upsert({
    where: { id: "default" },
    update: {
      tierMonthlyPricesJson: {
        FREE: 0,
        HOUSEHOLD: 59,
        DEALER: 149,
        COMPANY: 349,
        CORPORATE: 899,
      },
      paypalClientIdPublic: "demo-paypal-client-id",
    },
    create: {
      id: "default",
      tierMonthlyPricesJson: {
        FREE: 0,
        HOUSEHOLD: 59,
        DEALER: 149,
        COMPANY: 349,
        CORPORATE: 899,
      },
      paypalClientIdPublic: "demo-paypal-client-id",
    },
  });

  const bundles = [
    ["starter-50", "חבילת 50 סריקות", "Gemini בסיסי למסמכים שוטפים", 99, 50, 0, 1],
    ["premium-20", "חבילת 20 פרימיום", "OpenAI/Anthropic למסמכים מורכבים", 149, 0, 20, 2],
    ["contractor-250", "חבילת קבלן 250", "שילוב זול ופרימיום לאתר פעיל", 399, 220, 30, 3],
  ];
  for (const [slug, name, description, priceIls, cheapAdds, premiumAdds, sortOrder] of bundles) {
    await prisma.scanBundle.upsert({
      where: { slug },
      update: { name, description, priceIls, cheapAdds, premiumAdds, sortOrder, isActive: true },
      create: { slug, name, description, priceIls, cheapAdds, premiumAdds, sortOrder, isActive: true },
    });
  }

  const [tower, villa, school] = await Promise.all([
    prisma.project.create({
      data: {
        organizationId: organization.id,
        name: "מגדלי כנפי נשרים - שלב ב",
        activeFrom: daysAgo(120),
        activeTo: daysFromNow(210),
      },
    }),
    prisma.project.create({
      data: {
        organizationId: organization.id,
        name: "וילות מוצא - 12 יחידות",
        activeFrom: daysAgo(45),
        activeTo: daysFromNow(150),
      },
    }),
    prisma.project.create({
      data: {
        organizationId: organization.id,
        name: "שיפוץ בית ספר גבעת שאול",
        isActive: false,
        activeFrom: daysAgo(240),
        activeTo: daysAgo(15),
      },
    }),
  ]);

  const contacts = await Promise.all([
    prisma.contact.create({
      data: {
        organizationId: organization.id,
        projectId: tower.id,
        name: "אורבן ייזום והשקעות",
        email: "procurement@urban-demo.test",
        phone: "02-555-0101",
        value: 1840000,
        status: "NEGOTIATION",
        notes: "לקוח אסטרטגי. דורש דוחות התקדמות שבועיים והשוואת חריגות חומר.",
      },
    }),
    prisma.contact.create({
      data: {
        organizationId: organization.id,
        projectId: villa.id,
        name: "משפחת אדרי",
        email: "ronit@adri-demo.test",
        phone: "054-555-0133",
        value: 420000,
        status: "WON",
        notes: "לקוח פרטי. מעדיף חשבוניות מס קבלה מסודרות לפי אבני דרך.",
      },
    }),
    prisma.contact.create({
      data: {
        organizationId: organization.id,
        projectId: school.id,
        name: "עיריית ירושלים - אגף מבנים",
        email: "buildings@jerusalem-demo.test",
        phone: "02-555-0199",
        value: 980000,
        status: "ACTIVE",
        notes: "פרויקט ציבורי. נדרש מעקב מסמכים, ביטוחים ואישורי בטיחות.",
      },
    }),
    prisma.contact.create({
      data: {
        organizationId: organization.id,
        name: "ספק: חומרי בניין ירושלים",
        email: "sales@materials-demo.test",
        phone: "02-555-0177",
        value: 0,
        status: "SUPPLIER",
        notes: "ספק ראשי להשוואת מחירי ברזל, בטון, גבס ואיטום.",
      },
    }),
  ]);

  const quote = await prisma.quote.create({
    data: {
      token: "demo-quote-tower-2026",
      amount: 1840000,
      status: "PENDING",
      contactId: contacts[0].id,
      organizationId: organization.id,
    },
  });

  const issuedDocs = await Promise.all([
    prisma.issuedDocument.create({
      data: {
        organizationId: organization.id,
        contactId: contacts[0].id,
        type: "INVOICE",
        number: 1001,
        date: daysAgo(20),
        dueDate: daysFromNow(10),
        clientName: contacts[0].name,
        amount: 125000,
        vat: 21250,
        total: 146250,
        status: "PENDING",
        items: [
          { desc: "מקדמה שלב ב - שלד", qty: 1, price: 125000 },
        ],
      },
    }),
    prisma.issuedDocument.create({
      data: {
        organizationId: organization.id,
        contactId: contacts[1].id,
        type: "INVOICE_RECEIPT",
        number: 1002,
        date: daysAgo(7),
        clientName: contacts[1].name,
        amount: 48000,
        vat: 8160,
        total: 56160,
        status: "PAID",
        items: [
          { desc: "עבודות גמר קומת כניסה", qty: 1, price: 48000 },
        ],
      },
    }),
  ]);

  await Promise.all([
    prisma.invoice.create({
      data: {
        organizationId: organization.id,
        status: "PAID",
        amount: 899,
        currency: "ILS",
        description: "מנוי Corporate חודשי",
        invoiceNumber: "SUB-2026-0001",
        customerName: organization.name,
        customerEmail: "owner@bsd-demo.test",
        paidAt: daysAgo(3),
        payplusTransactionId: "demo-payplus-sub-0001",
        lastWebhookPayload: { provider: "demo", status: "paid" },
      },
    }),
    prisma.invoice.create({
      data: {
        organizationId: organization.id,
        status: "PENDING",
        amount: 399,
        currency: "ILS",
        description: "חבילת סריקות קבלן 250",
        invoiceNumber: "BND-2026-0002",
        customerName: organization.name,
        customerEmail: "finance@bsd-demo.test",
      },
    }),
  ]);

  const documentsData = [
    {
      fileName: "invoice-steel-april.pdf",
      type: "INVOICE",
      supplierName: "חומרי בניין ירושלים",
      createdAt: daysAgo(35),
      aiData: {
        docType: "חשבונית ספק",
        supplier: "חומרי בניין ירושלים",
        total: 38610,
        vat: 5610,
        confidence: 0.94,
        engines: ["gemini", "openai", "documentai"],
      },
      lines: [
        ["ברזל 12 מ״מ", "steel-12mm", 1000, 4.2, 4200, "STL-12", false],
        ["בטון C30", "concrete-c30", 18, 390, 7020, "CON-C30", false],
        ["בלוק איטונג 20", "ytong-block-20", 900, 7.8, 7020, "YTG-20", false],
      ],
    },
    {
      fileName: "invoice-steel-may.pdf",
      type: "INVOICE",
      supplierName: "חומרי בניין ירושלים",
      createdAt: daysAgo(12),
      aiData: {
        docType: "חשבונית ספק",
        supplier: "חומרי בניין ירושלים",
        total: 45210,
        vat: 6570,
        confidence: 0.91,
        priceAlerts: ["steel-12mm"],
        engines: ["gemini", "anthropic", "documentai"],
      },
      lines: [
        ["ברזל 12 מ״מ", "steel-12mm", 1000, 5.1, 5100, "STL-12", false],
        ["בטון C30", "concrete-c30", 20, 398, 7960, "CON-C30", false],
        ["יריעות איטום 5 מ״מ", "waterproof-sheet-5mm", 1, null, null, "WTR-5", true],
      ],
    },
    {
      fileName: "quote-aluminum-villa.pdf",
      type: "QUOTE",
      supplierName: "אלומיניום העיר",
      createdAt: daysAgo(4),
      aiData: {
        docType: "הצעת מחיר",
        supplier: "אלומיניום העיר",
        total: 28400,
        confidence: 0.87,
        engines: ["gemini", "openai"],
      },
      lines: [
        ["חלונות אלומיניום בלגי", "belgian-aluminum-window", 12, 1450, 17400, "AL-BG", false],
        ["רשתות נגד יתושים", "window-screen", 12, 180, 2160, "SCR-01", false],
      ],
    },
  ];

  const documents = [];
  for (const doc of documentsData) {
    const created = await prisma.document.create({
      data: {
        organizationId: organization.id,
        userId: users[2].id,
        fileName: doc.fileName,
        type: doc.type,
        status: "PROCESSED",
        aiData: doc.aiData,
        createdAt: doc.createdAt,
      },
    });
    documents.push(created);

    for (const [description, normalizedKey, quantity, unitPrice, lineTotal, sku, priceAlertPending] of doc.lines) {
      await prisma.documentLineItem.create({
        data: {
          documentId: created.id,
          organizationId: organization.id,
          supplierName: doc.supplierName,
          description,
          normalizedKey,
          quantity,
          unitPrice,
          lineTotal,
          sku,
          priceAlertPending,
          createdAt: doc.createdAt,
        },
      });
      if (typeof unitPrice === "number") {
        await prisma.productPriceObservation.create({
          data: {
            documentId: created.id,
            organizationId: organization.id,
            normalizedKey,
            description,
            supplierName: doc.supplierName,
            unitPrice,
            observedAt: doc.createdAt,
          },
        });
      }
    }
  }

  await Promise.all([
    prisma.documentScanJob.create({
      data: {
        organizationId: organization.id,
        userId: users[2].id,
        status: "COMPLETED",
        fileData: JSON.stringify({ name: "invoice-steel-may.pdf", mime: "application/pdf", size: 284000 }),
        result: {
          engines: {
            gemini: { confidence: 0.9 },
            anthropic: { confidence: 0.86 },
            documentai: { confidence: 0.92 },
          },
          selectedEngine: "documentai",
          exportedDocumentId: documents[1].id,
        },
      },
    }),
    prisma.documentScanJob.create({
      data: {
        organizationId: organization.id,
        userId: users[1].id,
        status: "PENDING",
        fileData: JSON.stringify({ name: "delivery-note-concrete.jpg", mime: "image/jpeg", size: 920000 }),
      },
    }),
    prisma.documentScanCache.create({
      data: {
        organizationId: organization.id,
        contentSha256: "demo-cache-steel-may-sha256",
        providerUsed: "tri-engine",
        locale: "he",
        schemaVersion: 5,
        resultJson: { reused: true, docType: "INVOICE", total: 45210 },
      },
    }),
  ]);

  await Promise.all([
    prisma.meckanoZone.create({
      data: {
        organizationId: organization.id,
        name: "אתר כנפי נשרים",
        address: "כנפי נשרים 24, ירושלים",
        description: "אתר שלד וגמרים, שער כניסה צפוני",
        lat: 31.7857,
        lng: 35.1919,
        radius: 180,
        managerName: "מיכל לוי",
        startDate: tower.activeFrom,
        endDate: tower.activeTo,
        budgetHours: 4200,
        hourlyRate: 145,
        assignedEmployeeIds: [1001, 1002, 1003],
        projectNotes: "בדיקת נוכחות יומית, סגירת חריגות בטיחות בכל יום חמישי.",
        syncedToCrm: true,
      },
    }),
    prisma.meckanoZone.create({
      data: {
        organizationId: organization.id,
        name: "וילות מוצא",
        address: "דרך מוצא 18, ירושלים",
        description: "עבודות גמר ופיתוח חוץ",
        lat: 31.793,
        lng: 35.156,
        radius: 130,
        managerName: "יואב בן דוד",
        startDate: villa.activeFrom,
        endDate: villa.activeTo,
        budgetHours: 1350,
        hourlyRate: 155,
        assignedEmployeeIds: [1004, 1005],
      },
    }),
  ]);

  await Promise.all([
    prisma.financialInsight.create({
      data: {
        organizationId: organization.id,
        content:
          "זוהתה עלייה של 21.4% במחיר ברזל 12 מ״מ מול רכישת החודש הקודם. מומלץ לבדוק ספק חלופי לפני הזמנת שלב ג.",
      },
    }),
    prisma.cloudIntegration.create({
      data: {
        organizationId: organization.id,
        provider: "GOOGLE_DRIVE",
        displayName: "Drive - BSD Demo",
        autoScan: true,
        backupExports: true,
        folderPath: "/BSD Demo/Invoices",
        lastSyncAt: daysAgo(1),
      },
    }),
    prisma.organizationInvite.upsert({
      where: { token: "demo-invite-site-manager-2026" },
      create: {
        organizationId: organization.id,
        token: "demo-invite-site-manager-2026",
        email: "site-manager@bsd-demo.test",
        role: "PROJECT_MGR",
        expiresAt: daysFromNow(14),
        createdByEmail: "owner@bsd-demo.test",
      },
      update: {
        organizationId: organization.id,
        email: "site-manager@bsd-demo.test",
        role: "PROJECT_MGR",
        expiresAt: daysFromNow(14),
        createdByEmail: "owner@bsd-demo.test",
      },
    }),
    prisma.subscriptionInvitation.upsert({
      where: { token: "demo-subscription-corporate-2026" },
      create: {
        token: "demo-subscription-corporate-2026",
        email: "new-corporate@bsd-demo.test",
        subscriptionTier: "CORPORATE",
        expiresAt: daysFromNow(30),
        createdByEmail: "owner@bsd-demo.test",
      },
      update: {
        email: "new-corporate@bsd-demo.test",
        subscriptionTier: "CORPORATE",
        expiresAt: daysFromNow(30),
        createdByEmail: "owner@bsd-demo.test",
      },
    }),
  ]);

  await Promise.all([
    prisma.inAppNotification.create({
      data: {
        userId: users[0].id,
        title: "התראת מחיר חריגה",
        body: "ברזל 12 מ״מ עלה ב-21.4% מול החודש הקודם.",
      },
    }),
    prisma.inAppNotification.create({
      data: {
        userId: users[1].id,
        title: "סריקה ממתינה",
        body: "תעודת משלוח בטון ממתינה לפענוח בתור.",
      },
    }),
    prisma.activityLog.create({
      data: {
        organizationId: organization.id,
        userId: users[0].id,
        action: "DEMO_SEED_CREATED",
        details: `Created demo data for ${DEMO_DOMAIN}`,
      },
    }),
    prisma.activityLog.create({
      data: {
        organizationId: organization.id,
        userId: users[2].id,
        action: "DOCUMENT_IMPORTED",
        details: "Imported invoice-steel-may.pdf with tri-engine scan.",
      },
    }),
  ]);

  console.log("Demo test data is ready.");
  console.log(`Organization: ${organization.name} (${DEMO_DOMAIN})`);
  console.log(`Password for all demo users: ${PASSWORD}`);
  for (const user of users) {
    console.log(`- ${user.email} / ${user.role}`);
  }
  console.log(`Quote token: ${quote.token}`);
  console.log(`Issued documents: ${issuedDocs.map((d) => `${d.type} #${d.number}`).join(", ")}`);
  fs.writeFileSync(
    seedMarkerPath,
    JSON.stringify(
      {
        seededAt: new Date().toISOString(),
        organizationId: organization.id,
        email: "owner@bsd-demo.test",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
