import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  Database,
  MessageSquareText,
  PackageSearch,
} from "lucide-react";

const actions = [
  {
    title: "Prediction",
    description: "Analyse Bangla text with the active model.",
    href: "/prediction",
    icon: BrainCircuit,
  },
  {
    title: "Datasets",
    description: "Upload, inspect and manage versioned research data.",
    href: "/datasets",
    icon: Database,
  },
  {
    title: "Models",
    description: "Inspect registered versions and activation status.",
    href: "/models",
    icon: PackageSearch,
  },
  {
    title: "Analytics",
    description: "Review predictions, metrics and evaluation evidence.",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    title: "Feedback",
    description: "Correct model outputs and support future training.",
    href: "/feedback",
    icon: MessageSquareText,
  },
];

export function QuickLaunch() {
  return (
    <section aria-labelledby="quick-launch-heading">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-400">
          Quick launch
        </p>

        <h2
          id="quick-launch-heading"
          className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white"
        >
          Open a workspace
        </h2>
      </div>

      <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.href}
              href={action.href}
              className="group grid gap-4 py-5 transition sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:items-center hover:pl-2"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <Icon className="size-4" />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {action.title}
                </h3>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {action.description}
                </p>
              </div>

              <ArrowUpRight className="hidden size-4 text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-blue-600 sm:block" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
