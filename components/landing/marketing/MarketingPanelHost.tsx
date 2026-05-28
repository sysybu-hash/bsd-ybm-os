"use client";

import BentoModulesGrid from "@/components/landing/marketing/BentoModulesGrid";
import WorkflowSection from "@/components/landing/marketing/WorkflowSection";
import IndustriesSection from "@/components/landing/marketing/IndustriesSection";
import WhyProofSection from "@/components/landing/marketing/WhyProofSection";
import PricingSection from "@/components/landing/marketing/PricingSection";
import PrinciplesSection from "@/components/landing/marketing/PrinciplesSection";
import MarketingFeedbackSection from "@/components/landing/marketing/MarketingFeedbackSection";
import LeadCtaSection from "@/components/landing/marketing/LeadCtaSection";
import ModularitySection from "@/components/landing/marketing/ModularitySection";
import MarketingContactStrip from "@/components/landing/marketing/MarketingContactStrip";
import MarketingDetailSheet from "@/components/landing/marketing/MarketingDetailSheet";
import { useMarketingPanel } from "@/components/landing/marketing/MarketingPanelContext";
import { MARKETING_EXPLORE_PANELS } from "@/lib/marketing/marketing-panels";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  onLogin: () => void;
  onRegister: () => void;
}>;

function PanelSection({ children }: { children: React.ReactNode }) {
  return <div className="mkt-panel-section">{children}</div>;
}

export default function MarketingPanelHost({ onLogin, onRegister }: Props) {
  const { panel, closePanel } = useMarketingPanel();
  const { t } = useI18n();

  const def = MARKETING_EXPLORE_PANELS.find((p) => p.id === panel);
  const title = def ? t(def.titleKey) : "";
  const subtitle = def ? t(def.descriptionKey) : "";
  const Icon = def?.icon;

  return (
    <MarketingDetailSheet
      panel={panel}
      onClose={closePanel}
      title={title}
      subtitle={subtitle}
      icon={Icon}
    >
      {panel === "modules" ? (
        <PanelSection>
          <BentoModulesGrid embedded inPanel />
        </PanelSection>
      ) : null}
      {panel === "workflow" ? (
        <PanelSection>
          <WorkflowSection embedded inPanel />
        </PanelSection>
      ) : null}
      {panel === "industries" ? (
        <PanelSection>
          <IndustriesSection embedded inPanel />
        </PanelSection>
      ) : null}
      {panel === "why" ? (
        <PanelSection>
          <WhyProofSection embedded inPanel />
        </PanelSection>
      ) : null}
      {panel === "pricing" ? (
        <PanelSection>
          <PricingSection embedded inPanel onRegister={onRegister} />
        </PanelSection>
      ) : null}
      {panel === "principles" ? (
        <PanelSection>
          <PrinciplesSection embedded inPanel />
        </PanelSection>
      ) : null}
      {panel === "feedback" ? (
        <PanelSection>
          <MarketingFeedbackSection embedded inPanel />
        </PanelSection>
      ) : null}
      {panel === "contact" ? (
        <PanelSection>
          <MarketingContactStrip embedded inPanel />
          <div className="mt-8">
            <LeadCtaSection embedded inPanel onRegister={onRegister} onLogin={onLogin} />
          </div>
        </PanelSection>
      ) : null}
      {panel === "modularity" ? (
        <PanelSection>
          <ModularitySection embedded inPanel />
        </PanelSection>
      ) : null}
    </MarketingDetailSheet>
  );
}
