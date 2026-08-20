import { env } from "@/lib/env";

/** האם להשתמש במסלול הסריקה המאוחד (Tri-Engine + unified-save). ברירת מחדל: מופעל. */
export function isScanUnifiedV2Enabled(): boolean {
  return env.SCAN_UNIFIED_V2 ?? true;
}
