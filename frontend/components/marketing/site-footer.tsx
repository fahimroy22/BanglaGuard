import { Code2 } from "lucide-react";
import Link from "next/link";

import { BrandLogo } from "@/components/branding/brand-logo";

const platformLinks = [
  {
    label: "Prediction",
    href: "/prediction",
  },
  {
    label: "Models",
    href: "/models",
  },
  {
    label: "Analytics",
    href: "/analytics",
  },
  {
    label: "Feedback",
    href: "/feedback",
  },
];

const accountLinks = [
  {
    label: "Sign in",
    href: "/auth/login",
  },
  {
    label: "Create account",
    href: "/auth/register",
  },
  {
    label: "Dashboard",
    href: "/dashboard",
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_0.6fr_0.6fr]">
          <div>
            <BrandLogo />

            <p className="mt-5 max-w-md leading-7 text-muted-foreground">
              A research-oriented platform for explainable Bangla
              hate-speech detection, sentiment analysis, model comparison,
              analytics, and human feedback.
            </p>

            <p
              lang="bn"
              className="mt-4 max-w-md leading-7 text-muted-foreground"
            >
              বাংলা প্রাকৃতিক ভাষা প্রক্রিয়াকরণ গবেষণা ও দায়িত্বশীল কৃত্রিম
              বুদ্ধিমত্তার জন্য নির্মিত।
            </p>

            <div className="mt-6 flex gap-3">
              <Link
                href="/models"
                aria-label="View BanglaGuard models"
                className="
                  flex size-10 items-center justify-center
                  rounded-xl border bg-background
                  transition-colors hover:bg-muted
                "
              >
                <Code2
                  className="size-4"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </div>

          <div>
            <h3 className="font-semibold">
              Platform
            </h3>

            <ul className="mt-5 space-y-3">
              {platformLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="
                      text-sm text-muted-foreground
                      transition-colors hover:text-foreground
                    "
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold">
              Account
            </h3>

            <ul className="mt-5 space-y-3">
              {accountLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="
                      text-sm text-muted-foreground
                      transition-colors hover:text-foreground
                    "
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div
          className="
            mt-12 flex flex-col gap-3 border-t pt-7
            text-sm text-muted-foreground
            sm:flex-row sm:items-center sm:justify-between
          "
        >
          <p>
            © {new Date().getFullYear()} BanglaGuard. Research project.
          </p>

          <p>
            Built for Project Based Learning-VI.
          </p>
        </div>
      </div>
    </footer>
  );
}
