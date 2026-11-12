import {
  Activity,
  CheckCircle2,
} from "lucide-react";

const services = [
  {
    label: "Backend API",
    status: "Online",
  },
  {
    label: "Database",
    status: "Connected",
  },
  {
    label: "Redis",
    status: "Connected",
  },
];

export function ActivityPanel() {
  return (
    <section aria-labelledby="activity-heading">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 dark:text-blue-400">
            Activity
          </p>

          <h2
            id="activity-heading"
            className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white"
          >
            Recent workspace events
          </h2>
        </div>

        <Activity className="size-5 text-slate-400" />
      </div>

      <div className="mt-7 flex min-h-44 items-center justify-center border-y border-dashed border-slate-200 dark:border-slate-800">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            No recent activity
          </p>

          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Dataset changes, training runs, registrations and predictions
            will appear here after live integration.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          System status
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {services.map((service) => (
            <div
              key={service.label}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-blue-600" />

                <span className="text-sm text-slate-600 dark:text-slate-300">
                  {service.label}
                </span>
              </div>

              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                {service.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
