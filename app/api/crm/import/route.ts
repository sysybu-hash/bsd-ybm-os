import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const organizationId = session?.user?.organizationId;

    let orgId: string;
    if (!organizationId) {
      const firstOrg = await prisma.organization.findFirst();
      if (!firstOrg) return NextResponse.json({ error: 'No organization found' }, { status: 500 });
      orgId = firstOrg.id;
    } else {
      orgId = organizationId;
    }

    const { contacts } = await request.json();

    if (!Array.isArray(contacts)) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
    }

    let importedCount = 0;
    let skippedCount = 0;

    for (const contactData of contacts) {
      const { name, email, phone, company, notes, taxId } = contactData;

      if (!name) {
        skippedCount++;
        continue;
      }

      // Enhanced duplicate check: email, phone, or taxId (if stored in notes)
      const existing = await prisma.contact.findFirst({
        where: {
          organizationId: orgId,
          OR: [
            email ? { email } : null,
            phone ? { phone } : null,
            taxId ? { notes: { contains: taxId } } : null
          ].filter(Boolean) as any
        }
      });

      if (existing) {
        skippedCount++;
        continue;
      }

      await prisma.contact.create({
        data: {
          name,
          email: email || null,
          phone: phone || null,
          notes: `${company ? `חברה: ${company}. ` : ''}${taxId ? `ח"פ: ${taxId}. ` : ''}${notes || ''}` || null,
          organizationId: orgId,
          status: 'LEAD'
        }
      });
      importedCount++;
    }

    return NextResponse.json({ 
      success: true, 
      importedCount, 
      skippedCount,
      message: `${importedCount} לקוחות יובאו בהצלחה, ${skippedCount} נדחו עקב כפילות או חוסר בנתונים`
    });
  } catch (error: any) {
    console.error("CRM Import Error:", error);
    return NextResponse.json({ error: 'Import failed', details: error.message }, { status: 500 });
  }
}
