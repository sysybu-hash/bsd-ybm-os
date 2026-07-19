import { prisma } from "@/lib/prisma";
import { askAI } from "@/lib/ai-orchestrator";
import { createLogger } from "@/lib/logger";
import {
  searchContactsByEmbedding,
  syncContactEmbeddingsForOrg,
} from "@/lib/crm/contact-embedding-index";
import { isEmbeddingConfigured } from "@/lib/embeddings/gemini-embed";

const log = createLogger("semantic-search");

const NAME_MATCH_TAKE = 50;
const RECENT_FALLBACK_TAKE = 80;
const AI_CONTEXT_MAX = 80;

export interface SemanticSearchResult {
  type: "project" | "contact" | "unknown";
  id: string;
  name: string;
  relevance: number;
}

type NamedRow = { id: string; name: string };

function localNameMatch(query: string, projects: NamedRow[], contacts: NamedRow[]): SemanticSearchResult[] {
  const lowerQuery = query.toLowerCase();
  const results: SemanticSearchResult[] = [];
  for (const p of projects) {
    if (p.name.toLowerCase().includes(lowerQuery)) {
      results.push({ type: "project", id: p.id, name: p.name, relevance: 0.5 });
    }
  }
  for (const c of contacts) {
    if (c.name.toLowerCase().includes(lowerQuery)) {
      results.push({ type: "contact", id: c.id, name: c.name, relevance: 0.5 });
    }
  }
  return results.sort((a, b) => b.relevance - a.relevance).slice(0, 3);
}

export async function semanticSearch(query: string, organizationId: string): Promise<SemanticSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  // Prefer vector Top-K for contacts when embeddings are configured.
  if (isEmbeddingConfigured()) {
    try {
      await syncContactEmbeddingsForOrg(organizationId);
      const contactIds = await searchContactsByEmbedding(organizationId, q, 3);
      if (contactIds.length > 0) {
        const contacts = await prisma.contact.findMany({
          where: { organizationId, id: { in: contactIds } },
          select: { id: true, name: true },
        });
        const byId = new Map(contacts.map((c) => [c.id, c.name]));
        const vectorHits: SemanticSearchResult[] = [];
        contactIds.forEach((id, i) => {
          const name = byId.get(id);
          if (!name) return;
          vectorHits.push({
            type: "contact",
            id,
            name,
            relevance: Math.max(0.4, 1 - i * 0.1),
          });
        });

        const projects = await prisma.project.findMany({
          where: { organizationId, name: { contains: q, mode: "insensitive" } },
          select: { id: true, name: true },
          take: 3,
          orderBy: { updatedAt: "desc" },
        });
        const projectHits: SemanticSearchResult[] = projects.map((p) => ({
          type: "project",
          id: p.id,
          name: p.name,
          relevance: 0.55,
        }));

        const merged = [...projectHits, ...vectorHits]
          .sort((a, b) => b.relevance - a.relevance)
          .slice(0, 3);
        if (merged.length > 0) return merged;
      }
    } catch (err) {
      log.warn("vector_search_failed_fallback", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const [matchedProjects, matchedContacts] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId, name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true },
      take: NAME_MATCH_TAKE,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.contact.findMany({
      where: { organizationId, name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true },
      take: NAME_MATCH_TAKE,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  let projects = matchedProjects;
  let contacts = matchedContacts;

  if (projects.length === 0 && contacts.length === 0) {
    const [recentProjects, recentContacts] = await Promise.all([
      prisma.project.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        take: RECENT_FALLBACK_TAKE,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.contact.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        take: RECENT_FALLBACK_TAKE,
        orderBy: { createdAt: "desc" },
      }),
    ]);
    projects = recentProjects;
    contacts = recentContacts;
  }

  if (projects.length === 0 && contacts.length === 0) return [];

  const contextProjects = projects.slice(0, AI_CONTEXT_MAX);
  const contextContacts = contacts.slice(0, AI_CONTEXT_MAX);

  const prompt = `
    Given the user query: "${q}"
    And the following business entities:
    ${JSON.stringify(
      {
        projects: contextProjects.map((p) => ({ id: p.id, name: p.name })),
        contacts: contextContacts.map((c) => ({ id: c.id, name: c.name })),
      },
      null,
      2,
    )}
    
    Identify the most relevant project or contact.
    Return ONLY a JSON array of results, each with:
    { "type": "project" | "contact", "id": string, "name": string, "relevance": number (0-1) }
    Limit to top 3. If nothing is relevant, return an empty array [].
    No markdown.
  `;

  try {
    const aiResponse = await askAI("gemini", prompt);
    const cleanedResponse = aiResponse.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleanedResponse) as SemanticSearchResult[];
  } catch (err) {
    log.error("Semantic search AI error:", err);
    return localNameMatch(q, projects, contacts);
  }
}
