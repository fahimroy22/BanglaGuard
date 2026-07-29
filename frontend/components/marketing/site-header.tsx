import Link from "next/link";

import { BrandLogo } from "@/components/branding/brand-logo";
import { marketingNavigation } from "@/components/marketing/navigation";
import { MobileNavigation } from "@/components/marketing/mobile-navigation";
import { ModeToggle } from "@/components/theme/mode-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  return (
    <header
      aria-label="Site header"
      className="
        sticky top-0 z-50 w-full border-b
        border-border/70 bg-background/85
        backdrop-blur-xl supports-[backdrop-filter]:bg-background/70
      "
    >
      <div
        className="
          mx-auto flex h-[4.5rem] max-w-7xl items-center
          justify-between gap-6 px-5 sm:px-8
        "
      >
        <BrandLogo />

        <nav
          className="hidden items-center gap-1 lg:flex"
          aria-label="Main navigation"
        >
          {marketingNavigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="
                rounded-lg px-4 py-2 text-sm font-medium
                text-muted-foreground transition-colors
                hover:bg-muted hover:text-foreground
              "
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ModeToggle />

          <Link
            href="/auth/login"
            className={cn(
              buttonVariants({
                variant: "ghost",
              }),
              "hidden sm:inline-flex",
            )}
          >
            Sign in
          </Link>

          <Link
            href="/auth/register"
            className={cn(
              buttonVariants(),
              "hidden sm:inline-flex",
            )}
          >
            Get started
          </Link>

          <MobileNavigation />
        </div>
      </div>
    </header>
  );
}
