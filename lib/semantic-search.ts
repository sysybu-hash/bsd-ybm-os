import { prisma } from "@/lib/prisma";
import { askAI } from "@/lib/ai-orchestrator";

export interface SemanticSearchResult {
  type: 'project' | 'contact' | 'unknown';
  id: string;
  name: string;
  relevance: number;
}

export async function semanticSearch(query: string, organizationId: string): Promise<SemanticSearchResult[]> {
  // 1. Get context from DB
  const [projects, contacts] = await Promise.all([
    prisma.project.findMany({ where: { organizationId } }),
    prisma.contact.findMany({ where: { organizationId } })
  ]);

  if (projects.length === 0 && contacts.length === 0) return [];

  // 2. Prepare context for AI
  const context = {
    projects: projects.map(p => ({ id: p.id, name: p.name })),
    contacts: contacts.map(c => ({ id: c.id, name: c.name }))
  };

  const prompt = `
    Given the user query: "${query}"
    And the following business entities:
    ${JSON.stringify(context, null, 2)}
    
    Identify the most relevant project or contact.
    Return ONLY a JSON array of results, each with:
    { "type": "project" | "contact", "id": string, "name": string, "relevance": number (0-1) }
    Limit to top 3. If nothing is relevant, return an empty array [].
    No markdown.
  `;

  try {
    const aiResponse = await askAI('gemini', prompt);
    const cleanedResponse = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleanedResponse);
  } catch (err) {
    console.error("Semantic search AI error:", err);
    // Fallback to simple text search
    const results: SemanticSearchResult[] = [];
    const lowerQuery = query.toLowerCase();
    
    projects.forEach(p => {
      if (p.name.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'project', id: p.id, name: p.name, relevance: 0.5 });
      }
    });
    
    contacts.forEach(c => {
      if (c.name.toLowerCase().includes(lowerQuery)) {
        results.push({ type: 'contact', id: c.id, name: c.name, relevance: 0.5 });
      }
    });
    
    return results.sort((a, b) => b.relevance - a.relevance).slice(0, 3);
  }
}
