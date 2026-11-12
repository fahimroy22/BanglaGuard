import {
  Check,
  Circle,
  Database,
  FlaskConical,
  PackageCheck,
  ScanSearch,
  Sparkles,
} from "lucide-react";

const workflow = [
  {
    title: "Dataset",
    description: "Upload and prepare training data",
    icon: Database,
    state: "complete",
  },
  {
    title: "Experiment",
    description: "Configure a reproducible run",
    icon: FlaskConical,
    state: "current",
  },
  {
    title: "Training",
    description: "Execute the selected model pipeline",
    icon: Sparkles,
    state: "pending",
  },
  {
    title: "Evaluation",
    description: "Review metrics and error evidence",
    icon: ScanSearch,
    state: "pending",
  },
  {
    title: "Registration",
    description: "Store and activate the trained model",
    icon: PackageCheck,
    state: "pending",
  },
];

export function ResearchWorkflow() {
  return (
    <section aria-labelledby="workflow-heading">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-400">
          Research pipeline
        </p>

        <h2
          id="workflow-heading"
          className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white"
        >
          From dataset to deployment
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Follow the same controlled workflow for every model version.
        </p>
      </div>

      <ol className="mt-8">
        {workflow.map((step, index) => {
          const Icon = step.icon;
          const isComplete = step.state === "complete";
          const isCurrent = step.state === "current";

          return (
            <li
              key={step.title}
              className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-4 pb-8 last:pb-0"
            >
              {index < workflow.length - 1 && (
                <span className="absolute left-[15px] top-8 h-full w-px bg-slate-200 dark:bg-slate-800" />
              )}

              <div
                className={[
                  "relative z-10 flex size-8 items-center justify-center rounded-full border bg-white dark:bg-slate-950",
                  isComplete
                    ? "border-blue-600 text-blue-700"
                    : isCurrent
                      ? "border-slate-950 text-slate-950 dark:border-white dark:text-white"
                      : "border-slate-300 text-slate-400 dark:border-slate-700",
                ].join(" ")}
              >
                {isComplete ? (
                  <Check className="size-4" />
                ) : isCurrent ? (
                  <Icon className="size-4" />
                ) : (
                  <Circle className="size-3" />
                )}
              </div>

              <div className="min-w-0 pt-0.5">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {step.title}
                  </h3>

                  {isCurrent && (
                    <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white dark:bg-white dark:text-slate-950">
                      Next
                    </span>
                  )}

                  {isComplete && (
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                      Completed
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {step.description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
