import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runTriEngineExtraction } from '@/lib/tri-engine-extract';
import { persistDocumentLineItemsFromAiData } from '@/lib/persist-document-lines';
import { getMessages } from '@/lib/i18n/load-messages';
import { normalizeLocale } from '@/lib/i18n/config';
import { cookies } from 'next/headers';
import { createOrganizationNotification } from '@/lib/notifications-service';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: 'User has no organization' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Prepare data for Tri-Engine
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mimeType = file.type || 'image/jpeg';
    
    const cookieJar = await cookies();
    const locale = normalizeLocale(cookieJar.get('bsd-locale')?.value);
    const messages = getMessages(locale);

    // 1. Run AI Multi-Engine Extraction
    const extraction = await runTriEngineExtraction({
      base64,
      mimeType,
      fileName: file.name,
      scanMode: 'INVOICE_FINANCIAL',
      locale,
      industry: session.user.organizationIndustry || 'CONSTRUCTION',
      orgTrade: session.user.organizationConstructionTrade || 'GENERAL_CONTRACTOR',
      messages
    });

    const { v5, aiData } = extraction;

    // 2. Persist Document Metadata
    const dbDoc = await prisma.document.create({
      data: {
        fileName: file.name,
        type: v5.docType || 'UNKNOWN',
        userId: session.user.id,
        organizationId: organizationId,
        aiData: aiData as any,
        status: 'PROCESSED'
      }
    });

    // 3. Persist Line Items & ERP Observations
    await persistDocumentLineItemsFromAiData(
      dbDoc.id,
      organizationId,
      v5.vendor || null,
      aiData,
      {
        notifyUserId: session.user.id,
        fileLabel: file.name
      }
    );

    // 4. Create Expense Record
    const expense = await prisma.expenseRecord.create({
      data: {
        organizationId,
        vendorName: v5.vendor || 'לא צוין',
        amountNet: v5.total / 1.17, // Rough estimate if net not provided
        vat: v5.total - (v5.total / 1.17),
        total: v5.total,
        expenseDate: v5.date ? new Date(v5.date) : new Date(),
        description: v5.summary,
        status: 'POSTED',
        sourceDocumentId: dbDoc.id,
        aiExtractedJson: aiData as any,
        allocation: 'PROJECT', // Default for construction OS
      }
    });

    // 5. Create In-App Notification
    await createOrganizationNotification(
      organizationId,
      "חשבונית חדשה נסרקה",
      `${v5.vendor} | ₪${v5.total.toLocaleString()} | מחכה לאישור שלך`
    );

    return NextResponse.json({ 
      success: true, 
      analysis: {
        amount: v5.total,
        vendor: v5.vendor,
        taxId: v5.taxId,
        projectSuggestion: v5.documentMetadata?.project || 'פרויקט כללי',
        confidence: 0.95, // Tri-engine is high confidence
        summary: v5.summary
      },
      notification: {
        id: `smart-expense-${dbDoc.id}`,
        title: "Smart Expense Detected",
        message: `${v5.vendor} | ₪${v5.total.toLocaleString()} | שיוך מוצע: ${v5.documentMetadata?.project || 'פרויקט כללי'}`,
        severity: "success",
        createdAt: new Date().toISOString(),
        actions: [
          {
            label: 'Confirm Expense',
            action: 'confirmExpense',
            payload: {
              documentId: dbDoc.id,
              expenseId: expense.id,
              vendor: v5.vendor,
              taxId: v5.taxId || '',
              amount: String(v5.total),
            },
          },
        ],
      }
    });

  } catch (err: any) {
    console.error("Analysis/Persist Error:", err);
    return NextResponse.json({ error: 'Processing failed', details: err.message }, { status: 500 });
  }
}
