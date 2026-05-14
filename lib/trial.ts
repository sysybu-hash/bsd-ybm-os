import type { Organization } from "@prisma/client";

/** חישוב תאריך סיום לניסיון חדש — 30 יום מהיום */
export const trialEndsAtFromNow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date;
};

/** בדיקה האם הניסיון פג (רק FREE עם תאריך מוגדר) */
export const isFreeTrialExpired = (
  org: Pick<Organization, "subscriptionTier" | "trialEndsAt">,
) => {
  if (org.subscriptionTier !== "FREE" || !org.trialEndsAt) return false;
  return new Date() > new Date(org.trialEndsAt);
};

/** חישוב ימים שנותרו לבאנר — null אם אין תאריך ניסיון */
export const freeTrialDaysRemaining = (trialEndsAt: Date | null) => {
  if (!trialEndsAt) return null;
  const diffTime = new Date(trialEndsAt).getTime() - new Date().getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
};
