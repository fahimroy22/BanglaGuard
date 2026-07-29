import type { Metadata } from "next";

import { CtaSection } from "@/components/marketing/sections/cta-section";
import { HeroSection } from "@/components/marketing/sections/hero-section";
import { ModelsSection } from "@/components/marketing/sections/models-section";
import { PlatformSection } from "@/components/marketing/sections/platform-section";
import { PrinciplesSection } from "@/components/marketing/sections/principles-section";
import { StatisticsSection } from "@/components/marketing/sections/statistics-section";
import { WorkflowSection } from "@/components/marketing/sections/workflow-section";

export const metadata: Metadata = {
  title: "Explainable Bangla NLP Research Platform",
  description:
    "Research, compare, and explain Bangla hate-speech and sentiment-analysis models with BanglaGuard.",
};

export default function MarketingPage() {
  return (
    <main>
      <HeroSection />
      <StatisticsSection />
      <PlatformSection />
      <WorkflowSection />
      <ModelsSection />
      <PrinciplesSection />
      <CtaSection />
    </main>
  );
}
