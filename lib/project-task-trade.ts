import type { ProjectSubDomainId } from "@/lib/project-sub-domains";
import { guessSubDomainFromText } from "@/lib/project-sub-domains";
import {
  buildTaskDescription,
  getTaskTradeId,
  getTaskTradeNotes,
} from "@/lib/project-task-metadata";

export { getTaskTradeId, getTaskTradeNotes };

export function buildTaskTradeDescription(
  tradeId: ProjectSubDomainId | null | undefined,
  notes?: string | null,
  linkedBoqLineId?: string | null,
): string | null {
  return buildTaskDescription({ tradeId, notes, linkedBoqLineId });
}

export function resolveTaskTradeId(
  description: string | null | undefined,
  title: string,
  industryRaw?: string | null,
): ProjectSubDomainId | null {
  return getTaskTradeId(description) ?? guessSubDomainFromText(title, industryRaw);
}
