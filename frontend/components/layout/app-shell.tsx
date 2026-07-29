"use client";

import {
  BarChart3,
  BrainCircuit,
  ChevronDown,
  FlaskConical,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type ReactNode,
  useState,
} from "react";

import { BrandLogo } from "@/components/branding/brand-logo";
import { LogoutButton } from "@/components/auth/logout-button";
import { ModeToggle } from "@/components/theme/mode-toggle";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

type AppShellProps = {
  children: ReactNode;
};

const navigation = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Prediction",
    href: "/prediction",
    icon: BrainCircuit,
  },
  {
    label: "Models",
    href: "/models",
    icon: FlaskConical,
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    label: "Feedback",
    href: "/feedback",
    icon: MessageSquareText,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

function getInitials(name?: string) {
  if (!name) {
    return "BG";
  }

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function AppShell({
  children,
}: AppShellProps) {
  const pathname = usePathname();

  const [mobileOpen, setMobileOpen] =
    useState(false);

  const user = useAuthStore(
    (state) => state.user,
  );

  const isAdmin =
    user?.role?.toLowerCase() === "admin" ||
    user?.role?.toLowerCase() === "super_admin";

  function isActive(href: string) {
    return (
      pathname === href ||
      pathname.startsWith(`${href}/`)
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-40 bg-black/45 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r bg-background transition-transform duration-200 lg:translate-x-0",
          mobileOpen
            ? "translate-x-0"
            : "-translate-x-full",
        )}
      >
        <div className="flex h-20 items-center justify-between border-b px-6">
          <BrandLogo />

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="flex size-9 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="border-b p-4">
          <div className="rounded-2xl border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white">
                {getInitials(user?.full_name)}
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {user?.full_name}
                </p>

                <p className="truncate text-xs text-muted-foreground">
                  {user?.email}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 text-emerald-600" />
                <span className="capitalize">
                  {user?.role ?? "User"}
                </span>
              </div>

              <ChevronDown className="size-3.5 text-muted-foreground" />
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Research workspace
          </p>

          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4.5" />
                {item.label}
              </Link>
            );
          })}

          {isAdmin ? (
            <>
              <div className="my-4 border-t" />

              <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Administration
              </p>

              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  isActive("/admin")
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <SlidersHorizontal className="size-4.5" />
                Administration
              </Link>
            </>
          ) : null}
        </nav>

        <div className="border-t p-4">
          <LogoutButton
            variant="outline"
            className="w-full justify-start"
          />
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex size-9 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-muted hover:text-foreground lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </button>

            <div>
              <p className="text-sm font-semibold">
                BanglaGuard Research
              </p>

              <p className="hidden text-xs text-muted-foreground sm:block">
                Explainable Bangla NLP workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ModeToggle />

            <div className="hidden h-8 w-px bg-border sm:block" />

            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                <UserRound className="size-4 text-muted-foreground" />
              </div>

              <div className="max-w-40">
                <p className="truncate text-xs font-medium">
                  {user?.full_name}
                </p>

                <p className="truncate text-[11px] capitalize text-muted-foreground">
                  {user?.role ?? "User"}
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  );
}
