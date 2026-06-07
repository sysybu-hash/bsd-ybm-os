"use client";

import type { LucideIcon } from "lucide-react";
import { Accessibility, Home, LayoutGrid, Menu, MessageSquare, Mic, Play } from "lucide-react";
import MobileChromeFabButton from "@/components/os/layout/MobileChromeFabButton";
import { openAccessibilityPanel, openFeedbackFab } from "@/lib/mobile-chrome-events";
import { useI18n } from "@/components/os/system/I18nProvider";

type NavAction =
  | { kind: "scroll"; sectionId: string }
  | { kind: "menu" };

type NavItemDef = {
  icon: LucideIcon;
  key: string;
  action: NavAction;
};

const NAV_ITEMS: NavItemDef[] = [
  { icon: Home, key: "marketingHome.cinematic.bottomNav.home", action: { kind: "scroll", sectionId: "hero" } },
  { icon: Play, key: "marketingHome.cinematic.bottomNav.demo", action: { kind: "scroll", sectionId: "live-demo" } },
  { icon: LayoutGrid, key: "marketingHome.cinematic.bottomNav.explore", action: { kind: "scroll", sectionId: "explore" } },
  { icon: Menu, key: "marketingHome.cinematic.bottomNav.menu", action: { kind: "menu" } },
];

type Props = Readonly<{
  onOpenOmnibar: () => void;
  onOpenMenu: () => void;
  onDismissOverlays?: () => void;
  menuOpen?: boolean;
}>;

function scrollToSection(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

type NavButtonProps = Readonly<{
  item: NavItemDef;
  active?: boolean;
  onPress: () => void;
}>;

function NavButton({ item, active, onPress }: NavButtonProps) {
  const { t } = useI18n();
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onPress}
      aria-current={active ? "page" : undefined}
      className={`mkt-mobile-nav-item flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-end gap-0.5 rounded-xl px-0.5 pb-1 pt-2 text-[10px] font-bold transition active:scale-95 ${
        active ? "text-blue-400" : "text-slate-400 hover:text-slate-200"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 2} aria-hidden />
      <span className="max-w-full truncate px-0.5 leading-tight">{t(item.key)}</span>
    </button>
  );
}

export default function MobileBottomNav({
  onOpenOmnibar,
  onOpenMenu,
  onDismissOverlays,
  menuOpen,
}: Props) {
  const { t, dir } = useI18n();
  const leftItems = NAV_ITEMS.slice(0, 2);
  const rightItems = NAV_ITEMS.slice(2);

  const handleItemPress = (item: NavItemDef) => {
    if (item.action.kind === "menu") {
      onOpenMenu();
      return;
    }
    onDismissOverlays?.();
    scrollToSection(item.action.sectionId);
  };

  const handleMicPress = () => {
    onDismissOverlays?.();
    onOpenOmnibar();
    scrollToSection("hero");
  };

  return (
    <div
      className="mkt-mobile-nav-host fixed inset-x-0 bottom-0 z-[1285] md:hidden"
      data-testid="marketing-mobile-bottom-nav"
      dir={dir}
    >
      <div
        className="mkt-mobile-nav-fabs flex items-center justify-between px-2 pb-1"
        aria-label={t("marketingHome.cinematic.bottomNav.chromeActionsAria")}
      >
        <MobileChromeFabButton
          icon={MessageSquare}
          label={t("siteFeedback.fabLabel")}
          onClick={openFeedbackFab}
          testId="mobile-feedback-fab"
          variant="accent"
        />
        <MobileChromeFabButton
          icon={Accessibility}
          label={t("accessibility.toolbar")}
          onClick={openAccessibilityPanel}
          testId="mobile-accessibility-fab"
        />
      </div>
    <nav
      className="mkt-mobile-nav border-t border-white/10 mkt-glass-strong pb-[max(0.35rem,env(safe-area-inset-bottom))]"
      aria-label={t("marketingHome.cinematic.bottomNav.aria")}
    >
      <div className="mx-auto flex max-w-lg items-end justify-between gap-0 px-2">
        {leftItems.map((item) => (
          <NavButton key={item.key} item={item} onPress={() => handleItemPress(item)} />
        ))}

        <div className="mkt-mobile-nav-mic-wrap flex shrink-0 items-end justify-center">
          <button
            type="button"
            onClick={handleMicPress}
            className="mkt-mobile-nav-mic flex items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-500 active:scale-95"
            aria-label={t("marketingHome.cinematic.bottomNav.omnibarAria")}
          >
            <Mic className="h-7 w-7" strokeWidth={2} aria-hidden />
          </button>
        </div>

        {rightItems.map((item) => (
          <NavButton
            key={item.key}
            item={item}
            active={item.action.kind === "menu" ? menuOpen : false}
            onPress={() => handleItemPress(item)}
          />
        ))}
      </div>
    </nav>
    </div>
  );
}
