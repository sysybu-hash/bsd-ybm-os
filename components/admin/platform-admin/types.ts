import { Activity, Bell, Bot, Settings2, Shield, UserCheck, Users } from "lucide-react";

export type TabId = "subscriptions" | "pending" | "users" | "broadcast" | "health" | "settings" | "assistant";

export type PlatformAdminConsoleProps = {
  variant?: "page" | "widget";
};

export const TABS: { id: TabId; label: string; icon: typeof Shield }[] = [
  { id: "subscriptions", label: "מנויים", icon: Users },
  { id: "pending", label: "הרשמות", icon: UserCheck },
  { id: "users", label: "משתמשים", icon: Users },
  { id: "broadcast", label: "שידורים", icon: Bell },
  { id: "health", label: "בריאות", icon: Activity },
  { id: "assistant", label: "עוזר ניהול", icon: Bot },
  { id: "settings", label: "הגדרות", icon: Settings2 },
];
