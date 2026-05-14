import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { semanticSearch } from '@/lib/semantic-search';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const isPreview = searchParams.get('preview') === 'true';

  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session || !session.user || !session.user.organizationId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const organizationId = session.user.organizationId;

  try {
    if (isPreview) {
      // Quick Prisma search for preview
      const [projects, contacts] = await Promise.all([
        prisma.project.findMany({
          where: {
            organizationId,
            name: { contains: query, mode: 'insensitive' }
          },
          take: 3
        }),
        prisma.contact.findMany({
          where: {
            organizationId,
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { notes: { contains: query, mode: 'insensitive' } }
            ]
          },
          take: 3
        })
      ]);

      const results = [
        ...projects.map(p => ({ type: 'project', id: p.id, name: p.name, relevance: 0.9 })),
        ...contacts.map(c => ({ type: 'contact', id: c.id, name: c.name, relevance: 0.9 }))
      ].sort((a, b) => b.relevance - a.relevance).slice(0, 5);

      return NextResponse.json({ results });
    }

    const results = await semanticSearch(query, organizationId);
    return NextResponse.json({ results });
  } catch (err: any) {
    console.error("Search API Error:", err);
    return NextResponse.json({ error: 'Search failed', details: err.message }, { status: 500 });
  }
}
