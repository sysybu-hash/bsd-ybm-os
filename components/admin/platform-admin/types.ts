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

export const TABS: { id: TabId; labelKey: string; icon: typeof Shield }[] = [
  { id: "subscriptions", labelKey: "platformAdmin.tabs.subscriptions", icon: Users },
  { id: "pending", labelKey: "platformAdmin.tabs.pending", icon: UserCheck },
  { id: "users", labelKey: "platformAdmin.tabs.users", icon: Users },
  { id: "broadcast", labelKey: "platformAdmin.tabs.broadcast", icon: Bell },
  { id: "health", labelKey: "platformAdmin.tabs.health", icon: Activity },
  { id: "mail", labelKey: "platformAdmin.mail.tab", icon: Mail },
  { id: "ideas", labelKey: "platformAdmin.tabs.ideas", icon: Lightbulb },
  { id: "assistant", labelKey: "platformAdmin.tabs.assistant", icon: Bot },
  { id: "settings", labelKey: "platformAdmin.tabs.settings", icon: Settings2 },
];
