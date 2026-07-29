"use client";

import {
  ArrowRight,
  Menu,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BrandLogo } from "@/components/branding/brand-logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { buttonVariants } from "@/components/ui/button";
import { marketingNavigation } from "@/components/marketing/navigation";
import { cn } from "@/lib/utils";

export function MobileNavigation() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
    >
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation menu"
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-[88%] max-w-sm px-6"
      >
        <SheetHeader className="border-b px-0 pb-6 pt-6 text-left">
          <SheetTitle>
            <BrandLogo />
          </SheetTitle>

          <SheetDescription>
            Research-oriented Bangla text analysis and explainable NLP.
          </SheetDescription>
        </SheetHeader>

        <nav
          className="flex flex-col gap-1 py-6"
          aria-label="Mobile navigation"
        >
          {marketingNavigation.map((item) => (
            <SheetClose
              nativeButton={false}
              key={item.href}
              render={
                <Link
                  href={item.href}
                  className="
                    flex items-center justify-between rounded-xl
                    px-4 py-3 text-base font-medium
                    text-muted-foreground transition-colors
                    hover:bg-muted hover:text-foreground
                  "
                />
              }
            >
              {item.label}
              <ArrowRight className="size-4" />
            </SheetClose>
          ))}
        </nav>

        <div className="mt-auto grid gap-3 border-t py-6">
          <Link
            href="/auth/login"
            className={cn(
              buttonVariants({
                variant: "outline",
                size: "lg",
              }),
              "w-full",
            )}
            onClick={() => setOpen(false)}
          >
            Sign in
          </Link>

          <Link
            href="/auth/register"
            className={cn(
              buttonVariants({
                size: "lg",
              }),
              "w-full",
            )}
            onClick={() => setOpen(false)}
          >
            Create account
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
