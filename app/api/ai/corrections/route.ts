import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { documentId, originalAiData, correctedData, correctionSource } = body;

    const correction = await prisma.aICorrection.create({
      data: {
        organizationId: session.user.organizationId,
        documentId,
        originalAiData: originalAiData || {},
        correctedData: correctedData || {},
        correctionSource: correctionSource || 'USER_MANUAL'
      }
    });

    return NextResponse.json({ success: true, id: correction.id });
  } catch (err: any) {
    console.error("AI Correction API Error:", err);
    return NextResponse.json({ error: 'Failed to save correction', details: err.message }, { status: 500 });
  }
}
