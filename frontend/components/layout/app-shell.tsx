"use client";

import {
  BarChart3,
  BrainCircuit,
  ChevronRight,
  ClipboardList,
  Database,
  FlaskConical,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";

import { ResearchLoopNotifications } from "@/components/research/research-projects";
import { TrainingNotifications } from "@/components/experiments/training-progress";
import { LogoutButton } from "@/components/auth/logout-button";
import { BrandLogo } from "@/components/branding/brand-logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ModeToggle } from "@/components/theme/mode-toggle";
import { useProfileAvatar } from "@/hooks/use-profile-avatar";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

type AppShellProps = {
  children: ReactNode;
};

type NavigationItem = {
  label: string;
  href: string;
  icon: ComponentType<{
    className?: string;
  }>;
  adminOnly?: boolean;
  researchOnly?: boolean;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const SIDEBAR_STORAGE_KEY = "banglaguard-sidebar-collapsed";

const navigationGroups: NavigationGroup[] = [
  {
    label: "Research",
    items: [
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
        label: "Analytics",
        href: "/analytics",
        icon: BarChart3,
      },
    ],
  },
  {
    label: "AI Development",
    items: [
      {
        label: "Research projects",
        href: "/research-projects",
        icon: FlaskConical,
        researchOnly: true,
      },
      {
        label: "Datasets",
        href: "/datasets",
        icon: Database,
      },
      {
        label: "Experiments",
        href: "/experiments",
        icon: FlaskConical,
      },
      {
        label: "Models",
        href: "/models",
        icon: BrainCircuit,
      },
    ],
  },
  {
    label: "Quality",
    items: [
      {
        label: "Feedback",
        href: "/feedback",
        icon: MessageSquareText,
      },
      {
        label: "Audit Logs",
        href: "/audit-logs",
        icon: ClipboardList,
        adminOnly: true,
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
      },
      {
        label: "Administration",
        href: "/admin",
        icon: SlidersHorizontal,
        adminOnly: true,
      },
    ],
  },
];

function getInitials(name?: string | null) {
  if (!name?.trim()) {
    return "BG";
  }

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function formatRole(role?: string | null) {
  if (!role) {
    return "User";
  }

  return role
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  const [mobileOpen, setMobileOpen] = useState(false);

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  });

  const user = useAuthStore((state) => state.user);

  const { avatarUrl } = useProfileAvatar();

  const normalizedRole = user?.role?.toLowerCase();

  const isAdmin =
    normalizedRole === "admin" || normalizedRole === "super_admin";

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function toggleDesktopSidebar() {
    setCollapsed((current) => !current);
  }

  const desktopSidebarWidth = collapsed ? "lg:w-16" : "lg:w-64";

  const desktopContentOffset = collapsed ? "lg:pl-16" : "lg:pl-64";

  return (
    <div className="min-h-screen bg-background">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        id="research-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl shadow-black/5 transition-[width,transform] duration-300 ease-in-out lg:translate-x-0 lg:shadow-none",
          desktopSidebarWidth,
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarHeader
          collapsed={collapsed}
          onDesktopToggle={toggleDesktopSidebar}
          onMobileClose={() => setMobileOpen(false)}
        />

        <SidebarAccount
          collapsed={collapsed}
          fullName={user?.full_name}
          email={user?.email}
          role={user?.role}
          avatarUrl={avatarUrl}
        />

        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-4">
            {navigationGroups.map((group) => {
              const visibleItems = group.items.filter(
                (item) => (!item.adminOnly || isAdmin) && (!item.researchOnly || isAdmin || normalizedRole === "researcher"),
              );

              if (visibleItems.length === 0) {
                return null;
              }

              return (
                <NavigationSection
                  key={group.label}
                  label={group.label}
                  collapsed={collapsed}
                >
                  {visibleItems.map((item) => (
                    <SidebarLink
                      key={item.href}
                      item={item}
                      active={isActive(item.href)}
                      collapsed={collapsed}
                      onNavigate={() => setMobileOpen(false)}
                    />
                  ))}
                </NavigationSection>
              );
            })}
          </div>
        </nav>

        <SidebarFooter collapsed={collapsed} />
      </aside>

      <div
        className={cn(
          "min-h-screen transition-[padding] duration-300 ease-in-out",
          desktopContentOffset,
        )}
      >
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-sidebar/95 px-3 backdrop-blur-xl sm:px-4 lg:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground lg:hidden"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              aria-controls="research-sidebar"
            >
              <Menu className="size-4" />
            </button>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                BanglaGuard Research
              </p>

              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                Explainable Bangla NLP workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <TrainingNotifications />
            <ResearchLoopNotifications />
            <ModeToggle />

            <div className="hidden h-8 w-px bg-border sm:block" />

            <Link
              href="/profile"
              className="hidden items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-muted sm:flex"
              aria-label="Open profile"
            >
              <Avatar className="size-8">
                {avatarUrl ? (
                  <AvatarImage
                    src={avatarUrl}
                    alt={`${user?.full_name ?? "Researcher"} profile`}
                  />
                ) : null}

                <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                  {getInitials(user?.full_name)}
                </AvatarFallback>
              </Avatar>

              <div className="max-w-44">
                <p className="truncate text-xs font-medium text-foreground">
                  {user?.full_name ?? "Researcher"}
                </p>

                <p className="truncate text-[11px] text-muted-foreground">
                  {formatRole(user?.role)}
                </p>
              </div>
            </Link>
          </div>
        </header>

        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
      </div>
    </div>
  );
}

type SidebarHeaderProps = {
  collapsed: boolean;
  onDesktopToggle: () => void;
  onMobileClose: () => void;
};

function SidebarHeader({
  collapsed,
  onDesktopToggle,
  onMobileClose,
}: SidebarHeaderProps) {
  return (
    <div
      className={cn(
        "flex h-14 shrink-0 items-center border-b border-border px-4",
        collapsed ? "lg:justify-center" : "justify-between",
      )}
    >
      <div
        className={cn(
          "min-w-0 overflow-hidden transition-all duration-300",
          collapsed ? "lg:w-0 lg:opacity-0" : "w-auto opacity-100",
        )}
      >
        <BrandLogo />
      </div>

      <div
        className={cn(
          "hidden shrink-0 lg:flex",
          collapsed ? "absolute left-1/2 -translate-x-1/2" : "",
        )}
      >
        <button
          type="button"
          onClick={onDesktopToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          aria-controls="research-sidebar"
          className="flex size-8 items-center justify-center rounded-xl border border-border bg-sidebar text-muted-foreground transition hover:border-primary/30 hover:bg-muted hover:text-foreground"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={onMobileClose}
        className="ml-auto flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground lg:hidden"
        aria-label="Close navigation"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

type SidebarAccountProps = {
  collapsed: boolean;
  fullName?: string | null;
  email?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
};

function SidebarAccount({
  collapsed,
  fullName,
  email,
  role,
  avatarUrl,
}: SidebarAccountProps) {
  if (collapsed) {
    return (
      <div className="hidden border-b border-border px-3 py-4 lg:block">
        <div className="flex justify-center">
          <Link
            href="/profile"
            title={`${fullName ?? "Researcher"} — ${formatRole(role)}`}
            aria-label="Open profile"
            className="rounded-full transition hover:opacity-90"
          >
            <Avatar className="size-9">
              {avatarUrl ? (
                <AvatarImage
                  src={avatarUrl}
                  alt={`${fullName ?? "Researcher"} profile`}
                />
              ) : null}

              <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
                {getInitials(fullName)}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border p-3">
      <Link
        href="/profile"
        className="block rounded-xl border border-border bg-muted/60 p-3 transition hover:border-primary/30 hover:bg-muted"
        aria-label="Open profile"
      >
        <div className="flex items-center gap-3">
          <Avatar className="size-9 shrink-0">
            {avatarUrl ? (
              <AvatarImage
                src={avatarUrl}
                alt={`${fullName ?? "Researcher"} profile`}
              />
            ) : null}

            <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
              {getInitials(fullName)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {fullName ?? "Researcher"}
            </p>

            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {email ?? "No email"}
            </p>
          </div>

          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-primary" />

          <span className="truncate">{formatRole(role)}</span>
        </div>
      </Link>
    </div>
  );
}

type NavigationSectionProps = {
  label: string;
  collapsed: boolean;
  children: ReactNode;
};

function NavigationSection({
  label,
  collapsed,
  children,
}: NavigationSectionProps) {
  return (
    <section>
      {collapsed ? (
        <div className="mx-auto mb-3 hidden h-px w-8 bg-border lg:block" />
      ) : (
        <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
      )}

      <div className="space-y-1">{children}</div>
    </section>
  );
}

type SidebarLinkProps = {
  item: NavigationItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
};

function SidebarLink({
  item,
  active,
  collapsed,
  onNavigate,
}: SidebarLinkProps) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-10 items-center rounded-xl text-sm font-medium transition-all duration-200",
        collapsed ? "lg:justify-center lg:px-0" : "gap-2.5 px-2.5",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {active ? (
        <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary" />
      ) : null}

      <Icon
        className={cn(
          "size-4 shrink-0 transition",
          active
            ? "text-primary"
            : "text-muted-foreground group-hover:text-foreground",
        )}
      />

      <span
        className={cn(
          "truncate transition-all duration-300",
          collapsed ? "lg:w-0 lg:opacity-0" : "w-auto opacity-100",
        )}
      >
        {item.label}
      </span>

      {collapsed ? (
        <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[70] hidden -translate-y-1/2 whitespace-nowrap rounded-xl bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-lg transition group-hover:opacity-100 lg:block">
          {item.label}
        </span>
      ) : null}
    </Link>
  );
}

type SidebarFooterProps = {
  collapsed: boolean;
};

function SidebarFooter({ collapsed }: SidebarFooterProps) {
  return (
    <div className="shrink-0 border-t border-border p-2">
      <div
        title={collapsed ? "Sign out" : undefined}
        className={cn(
          "overflow-hidden",
          collapsed ? "[&_button]:justify-center [&_button]:px-0" : "",
        )}
      >
        <LogoutButton
          variant="outline"
          className={cn(
            "h-9 w-full border-border text-muted-foreground transition hover:bg-muted hover:text-foreground",
            collapsed ? "lg:w-9" : "justify-start",
          )}
        />
      </div>
    </div>
  );
}
