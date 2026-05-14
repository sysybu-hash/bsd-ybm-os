import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { runErpProjectNotebookChat, type NotebookChatMessage } from "@/lib/erp-project-notebook";

export const POST = withWorkspacesAuth(async (req, { orgId }) => {
  try {
    const body = await req.json();
    const { messages, sources, billOfQuantitiesContext } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages format" }, { status: 400 });
    }

    const result = await runErpProjectNotebookChat({
      messages,
      sources,
      billOfQuantitiesContext
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Notebook Chat Error:", error);
    return NextResponse.json({ error: error.message || "Failed to process chat" }, { status: 500 });
  }
});
