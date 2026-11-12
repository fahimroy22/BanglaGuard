import {
  Activity,
  BrainCircuit,
  Database,
  FlaskConical,
  PackageCheck,
} from "lucide-react";

const metrics = [
  {
    label: "Predictions",
    value: "—",
    detail: "Stored records",
    icon: BrainCircuit,
  },
  {
    label: "Datasets",
    value: "—",
    detail: "Registered versions",
    icon: Database,
  },
  {
    label: "Experiments",
    value: "—",
    detail: "Training runs",
    icon: FlaskConical,
  },
  {
    label: "Models",
    value: "—",
    detail: "Registry entries",
    icon: PackageCheck,
  },
  {
    label: "API health",
    value: "Online",
    detail: "Services available",
    icon: Activity,
  },
];

export function OverviewStrip() {
  return (
    <section aria-labelledby="overview-heading">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-400">
            Today
          </p>

          <h2
            id="overview-heading"
            className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white"
          >
            Workspace overview
          </h2>
        </div>

        <p className="hidden text-sm text-slate-500 md:block dark:text-slate-400">
          Research totals will update from the API.
        </p>
      </div>

      <div className="mt-5 border-y border-slate-200 dark:border-slate-800">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5">
          {metrics.map((metric, index) => {
            const Icon = metric.icon;

            return (
              <article
                key={metric.label}
                className={[
                  "py-6 sm:px-6",
                  index !== 0
                    ? "border-t border-slate-200 sm:border-l sm:border-t-0 dark:border-slate-800"
                    : "",
                  index === 2
                    ? "sm:border-l-0 lg:border-l"
                    : "",
                  index === 4
                    ? "sm:border-l-0 lg:border-l"
                    : "",
                ].join(" ")}
              >
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Icon className="size-4" />

                  <span className="text-sm font-medium">
                    {metric.label}
                  </span>
                </div>

                <p
                  className={
                    metric.value === "Online"
                      ? "mt-4 text-2xl font-semibold tracking-tight text-blue-700 dark:text-blue-400"
                      : "mt-4 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white"
                  }
                >
                  {metric.value}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  {metric.detail}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
