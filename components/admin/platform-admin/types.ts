import { Activity, Bell, Bot, Lightbulb, Mail, Settings2, Shield, UserCheck, Users } from "lucide-react";

export type TabId =
  | "subscriptions"
  | "pending"
  | "users"
  | "broadcast"
  | "health"
  | "mail"
  | "settings"
  | "assistant"
  | "ideas";

export type PlatformAdminConsoleProps = {
  variant?: "page" | "widget";
};

export const TABS: { id: TabId; label: string; icon: typeof Shield }[] = [
  { id: "subscriptions", label: "מנויים", icon: Users },
  { id: "pending", label: "הרשמות", icon: UserCheck },
  { id: "users", label: "משתמשים", icon: Users },
  { id: "broadcast", label: "שידורים", icon: Bell },
  { id: "health", label: "בריאות", icon: Activity },
  { id: "mail", label: "מייל", icon: Mail },
  { id: "ideas", label: "רעיונות", icon: Lightbulb },
  { id: "assistant", label: "עוזר ניהול", icon: Bot },
  { id: "settings", label: "הגדרות", icon: Settings2 },
];
