import { SkipLink } from "@/components/layout/skip-link";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

type MarketingLayoutProps = {
  children: React.ReactNode;
};

export default function MarketingLayout({
  children,
}: MarketingLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <SkipLink />
      <SiteHeader />

      <div id="main-content">
        {children}
      </div>

      <SiteFooter />
    </div>
  );
}
