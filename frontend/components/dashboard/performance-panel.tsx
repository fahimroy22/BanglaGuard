import {
  Activity,
  Gauge,
  Timer,
  TrendingUp,
} from "lucide-react";

const metrics = [
  {
    label: "Macro F1",
    value: "—",
    icon: TrendingUp,
  },
  {
    label: "Accuracy",
    value: "—",
    icon: Gauge,
  },
  {
    label: "Latency",
    value: "—",
    icon: Timer,
  },
];

export function PerformancePanel() {
  return (
    <section aria-labelledby="performance-heading">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-400">
            Model performance
          </p>

          <h2
            id="performance-heading"
            className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white"
          >
            Latest active model
          </h2>
        </div>

        <Activity className="size-5 text-slate-400" />
      </div>

      <div className="mt-7 flex min-h-48 items-center justify-center border-y border-dashed border-slate-200 dark:border-slate-800">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            No live model selected
          </p>

          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Activate a registered model to display evaluation metrics
            and inference performance.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;

          return (
            <div
              key={metric.label}
              className={[
                "py-5",
                index > 0
                  ? "border-l border-slate-200 pl-5 dark:border-slate-800"
                  : "",
              ].join(" ")}
            >
              <div className="flex items-center gap-2 text-slate-400">
                <Icon className="size-4" />
                <span className="text-xs">
                  {metric.label}
                </span>
              </div>

              <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                {metric.value}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
