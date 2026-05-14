import type { ProfessionalDocumentTemplate } from "@/lib/professions/runtime";

/** מסמכים רשמיים — מסלול מסך ההפקה; אחרת — טיוטה שנשמרת כרשומת מסמך מונפק */
export function templateDraftMode(template: ProfessionalDocumentTemplate): "issue" | "placeholder" {
  if (template.kind === "OFFICIAL" && template.issuedDocumentType) {
    return "issue";
  }
  return "placeholder";
}
