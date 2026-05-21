import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { runErpProjectNotebookChat, type NotebookChatMessage } from "@/lib/erp-project-notebook";
import { getServerLocale } from "@/lib/i18n/server";

export const POST = withWorkspacesAuth(async (req, { orgId }) => {
  try {
    const body = await req.json();
    const { messages, sources, billOfQuantitiesContext } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages format" }, { status: 400 });
    }

    const locale = await getServerLocale();
    const result = await runErpProjectNotebookChat({
      messages,
      sources,
      billOfQuantitiesContext,
      locale,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to process chat";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
