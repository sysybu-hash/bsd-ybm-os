import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readProjectBlob } from "@/lib/projects/pipeline/project-blob";
import { applyRateLimit } from "@/lib/rate-limit";
import { withVmbAuth } from "@/lib/vmb/api";
import { projectBooklet } from "@/lib/vmb/outcome";
import { projectsOfUser } from "@/lib/vmb/projects";

export const dynamic = "force-dynamic";

/** The project's booklet PDF, for its office only: opened in the browser, or `?download=1` saved as a file. */
export const GET = withVmbAuth<{ id: string }>(async (req, { user, params }) => {
  const limited = await applyRateLimit(req, "vmb:booklet", 30, 60_000);
  if (limited) return limited;
  const project = await prisma.vmbProject.findFirst({ where: { id: params.id, ...projectsOfUser(user.id) }, select: { name: true, manifest: true } });
  const url = project ? projectBooklet(project.manifest)?.url : undefined;
  const pdf = url ? await readProjectBlob(url) : null;
  if (!project || !pdf) return NextResponse.json({ code: "not_found" }, { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  const name = encodeURIComponent(`${project.name || "booklet"}.pdf`);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "cache-control": "private, no-cache",
      "x-content-type-options": "nosniff",
    },
  });
});
