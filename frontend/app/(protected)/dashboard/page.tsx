"use client";

import {
  Activity,
  BarChart3,
  BrainCircuit,
  FlaskConical,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { useAuthStore } from "@/store/auth-store";

const quickActions = [
  {
    title: "Run prediction",
    description:
      "Analyse Bangla text for hate speech and sentiment.",
    href: "/prediction",
    icon: BrainCircuit,
  },
  {
    title: "Compare models",
    description:
      "Inspect registered baseline and transformer models.",
    href: "/models",
    icon: FlaskConical,
  },
  {
    title: "Research analytics",
    description:
      "Review prediction distributions and model evidence.",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    title: "Submit feedback",
    description:
      "Review predictions and contribute corrected labels.",
    href: "/feedback",
    icon: MessageSquareText,
  },
];

export default function DashboardPage() {
  const user = useAuthStore(
    (state) => state.user,
  );

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-3xl border bg-background">
          <div className="grid gap-8 p-7 sm:p-9 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                <ShieldCheck className="size-4" />
                Authenticated research workspace
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Welcome back, {user?.full_name}.
              </h1>

              <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                Continue analysing Bangla text, comparing
                models, reviewing explanations, and
                collecting research feedback.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border bg-muted/30 px-5 py-4">
              <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950">
                <Activity className="size-5 text-emerald-700 dark:text-emerald-300" />
              </div>

              <div>
                <p className="text-sm font-semibold">
                  System operational
                </p>

                <p className="text-xs text-muted-foreground">
                  API, database, and Redis connected
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-600">
              Quick actions
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Continue your research workflow
            </h2>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group rounded-2xl border bg-background p-5 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-800"
                >
                  <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/50">
                    <Icon className="size-5 text-emerald-600" />
                  </div>

                  <h3 className="mt-5 font-semibold">
                    {action.title}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {action.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-background p-5">
            <p className="text-sm text-muted-foreground">
              Account
            </p>

            <p className="mt-2 font-semibold">
              {user?.email}
            </p>
          </div>

          <div className="rounded-2xl border bg-background p-5">
            <p className="text-sm text-muted-foreground">
              Role
            </p>

            <p className="mt-2 font-semibold capitalize">
              {user?.role}
            </p>
          </div>

          <div className="rounded-2xl border bg-background p-5">
            <p className="text-sm text-muted-foreground">
              Workspace status
            </p>

            <p className="mt-2 font-semibold text-emerald-600">
              Active
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
