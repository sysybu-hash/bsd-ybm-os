import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { semanticSearch } from "@/lib/semantic-search";
import { prisma } from "@/lib/prisma";

const searchQuerySchema = z.object({
  q: z.string().min(1, "Missing query"),
  preview: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export const GET = withWorkspacesAuth(
  async (req, { orgId }, data) => {
    const query = data.q;
    const isPreview = data.preview ?? false;

    try {
      if (isPreview) {
        const [projects, contacts] = await Promise.all([
          prisma.project.findMany({
            where: {
              organizationId: orgId,
              name: { contains: query, mode: "insensitive" },
            },
            take: 3,
          }),
          prisma.contact.findMany({
            where: {
              organizationId: orgId,
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { notes: { contains: query, mode: "insensitive" } },
              ],
            },
            take: 3,
          }),
        ]);

        const results = [
          ...projects.map((p) => ({ type: "project" as const, id: p.id, name: p.name, relevance: 0.9 })),
          ...contacts.map((c) => ({ type: "contact" as const, id: c.id, name: c.name, relevance: 0.9 })),
        ]
          .sort((a, b) => b.relevance - a.relevance)
          .slice(0, 5);

        return NextResponse.json({ results });
      }

      const results = await semanticSearch(query, orgId);
      return NextResponse.json({ results });
    } catch (err) {
      return apiErrorResponse(err, "Search API Error");
    }
  },
  {
    schema: searchQuerySchema,
    parseTarget: "query",
  },
);
