import type { WidgetType } from "@/hooks/use-window-manager";
import {
  MECKANO_SUBSCRIBER_EMAIL,
  normalizeMeckanoEmail,
} from "@/lib/meckano-access";

/** אפליקציות שמותקנות למנוי בודד — לא מוצגות לשאר המשתמשים בארגון. */
export const SUBSCRIBER_ONLY_WIDGETS: Partial<Record<WidgetType, string>> = {
  meckanoReports: MECKANO_SUBSCRIBER_EMAIL,
};

export function isSubscriberWidgetVisible(
  type: WidgetType,
  userEmail: string | null | undefined,
): boolean {
  const required = SUBSCRIBER_ONLY_WIDGETS[type];
  if (!required) return true;
  return normalizeMeckanoEmail(userEmail) === normalizeMeckanoEmail(required);
}
