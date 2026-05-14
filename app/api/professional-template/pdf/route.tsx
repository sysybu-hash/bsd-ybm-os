import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { renderToBuffer } from "@react-pdf/renderer";
import ProfessionalTemplatePdfDocument from "@/lib/pdf/ProfessionalTemplatePdfDocument";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonNotFound, jsonUnauthorized } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { readRequestMessages } from "@/lib/i18n/server-messages";
import { getIndustryProfile } from "@/lib/professions/runtime";
import type { ProfessionalTemplateKind } from "@/lib/professions/runtime";

export const dynamic = "force-dynamic";

function kindLabel(kind: ProfessionalTemplateKind): string {
  switch (kind) {
    case "OFFICIAL":
      return "מסמך רשמי";
    case "REPORT":
      return "דוח";
    case "APPROVAL":
      return "אישור";
    case "FORM":
      return "טופס";
    default:
      return "תבנית";
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const organizationId = session?.user?.organizationId;
  if (!organizationId) {
    return jsonUnauthorized();
  }

  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get("templateId")?.trim();
  if (!templateId) {
    return jsonBadRequest("חסר templateId", "missing_template_id");
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      industry: true,
      constructionTrade: true,
      industryConfigJson: true,
    },
  });

  const messages = await readRequestMessages();
  const profile = getIndustryProfile(
    organization?.industry ?? "CONSTRUCTION",
    organization?.industryConfigJson,
    organization?.constructionTrade,
    messages,
  );

  const template = profile.templates.find((t) => t.id === templateId);
  if (!template) {
    return jsonNotFound("תבנית לא נמצאה");
  }

  const generatedAt = new Date().toLocaleString("he-IL");

  const buffer = await renderToBuffer(
    <ProfessionalTemplatePdfDocument
      industryLabel={profile.industryLabel}
      templateLabel={template.label}
      templateDescription={template.description}
      kindLabel={kindLabel(template.kind)}
      generatedAt={generatedAt}
    />,
  );

  const safeName = template.label.replace(/[^\w\u0590-\u05FF\s-]/g, "").trim().slice(0, 40) || "template";

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="bsd-ybm-${safeName}.pdf"`,
    },
  });
}
