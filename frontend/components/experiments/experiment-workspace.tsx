"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Beaker,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  FlaskConical,
  RefreshCw,
  Search,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import {
  useMemo,
  useState,
} from "react";

import { listDatasets } from "@/lib/dataset-management";
import { listExperiments } from "@/lib/experiment-management";

import type {
  ExperimentRead,
  ExperimentStatus,
} from "@/types/experiment-management";

type StatusFilter =
  | "all"
  | ExperimentStatus;

type SortOption =
  | "newest"
  | "oldest"
  | "name"
  | "status";

const PAGE_SIZE = 10;

const STATUS_ORDER: Record<
  ExperimentStatus,
  number
> = {
  running: 0,
  planned: 1,
  failed: 2,
  completed: 3,
};

export function ExperimentWorkspace() {
  const [searchQuery, setSearchQuery] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");

  const [datasetFilter, setDatasetFilter] =
    useState("all");

  const [sortOption, setSortOption] =
    useState<SortOption>("newest");

  const [page, setPage] = useState(1);

  const experimentsQuery = useQuery({
    queryKey: ["experiments", "registry"],
    queryFn: () => listExperiments(),
  });

  const datasetsQuery = useQuery({
    queryKey: [
      "datasets",
      "experiment-registry",
    ],
    queryFn: () =>
      listDatasets({
        limit: 100,
        offset: 0,
      }),
  });

  const experiments = useMemo(
    () => experimentsQuery.data ?? [],
    [experimentsQuery.data],
  );

  const datasets = useMemo(
    () => datasetsQuery.data?.items ?? [],
    [datasetsQuery.data],
  );

  const datasetMap = useMemo(
    () =>
      new Map(
        datasets.map((dataset) => [
          dataset.id,
          dataset,
        ]),
      ),
    [datasets],
  );

  const filteredExperiments = useMemo(() => {
    const normalizedSearch =
      searchQuery.trim().toLowerCase();

    const matching = experiments.filter(
      (experiment) => {
        const dataset = datasetMap.get(
          experiment.dataset_version_id,
        );

        const matchesSearch =
          !normalizedSearch ||
          experiment.name
            .toLowerCase()
            .includes(normalizedSearch) ||
          experiment.description
            ?.toLowerCase()
            .includes(normalizedSearch) ||
          dataset?.name
            .toLowerCase()
            .includes(normalizedSearch);

        const matchesStatus =
          statusFilter === "all" ||
          experiment.status === statusFilter;

        const matchesDataset =
          datasetFilter === "all" ||
          experiment.dataset_version_id ===
            datasetFilter;

        return (
          matchesSearch &&
          matchesStatus &&
          matchesDataset
        );
      },
    );

    return [...matching].sort((a, b) => {
      if (sortOption === "name") {
        return a.name.localeCompare(b.name);
      }

      if (sortOption === "status") {
        return (
          STATUS_ORDER[a.status] -
          STATUS_ORDER[b.status]
        );
      }

      const firstDate = new Date(
        a.created_at,
      ).getTime();

      const secondDate = new Date(
        b.created_at,
      ).getTime();

      if (sortOption === "oldest") {
        return firstDate - secondDate;
      }

      return secondDate - firstDate;
    });
  }, [
    datasetFilter,
    datasetMap,
    experiments,
    searchQuery,
    sortOption,
    statusFilter,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredExperiments.length /
        PAGE_SIZE,
    ),
  );

  const safePage = Math.min(
    page,
    totalPages,
  );

  const visibleExperiments =
    filteredExperiments.slice(
      (safePage - 1) * PAGE_SIZE,
      safePage * PAGE_SIZE,
    );

  const summary = useMemo(
    () => ({
      total: experiments.length,
      planned: experiments.filter(
        (item) =>
          item.status === "planned",
      ).length,
      running: experiments.filter(
        (item) =>
          item.status === "running",
      ).length,
      completed: experiments.filter(
        (item) =>
          item.status === "completed",
      ).length,
      failed: experiments.filter(
        (item) =>
          item.status === "failed",
      ).length,
    }),
    [experiments],
  );

  const isRefreshing =
    experimentsQuery.isFetching ||
    datasetsQuery.isFetching;

  function resetPage() {
    setPage(1);
  }

  function refreshRegistry() {
    void Promise.all([
      experimentsQuery.refetch(),
      datasetsQuery.refetch(),
    ]);
  }

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-6">
        <header className="flex flex-col gap-4 border-b border-[var(--gh-border-default)] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--gh-fg-default)]">
              Experiment manager
            </h1>

            <p className="mt-1 text-sm text-[var(--gh-fg-muted)]">
              Prepare, run and review training experiments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshRegistry}
              disabled={isRefreshing}
              className="gh-button"
            >
              <RefreshCw
                className={[
                  "size-4",
                  isRefreshing
                    ? "animate-spin"
                    : "",
                ].join(" ")}
              />

              Refresh
            </button>

            <Link
              href="/experiments/new"
              className="gh-button gh-button-primary"
            >
              <FlaskConical className="size-4" />
              New experiment
            </Link>
          </div>
        </header>

        <ExperimentSummary
          loading={experimentsQuery.isLoading || experimentsQuery.isError}
          summary={summary}
        />

        {datasetsQuery.isError ? <p role="status" className="mt-3 text-sm text-muted-foreground">Dataset names are unavailable. Experiments remain accessible by their records.</p> : null}
        <section className="mt-4 overflow-hidden rounded-xl border border-[var(--gh-border-default)] bg-card">
          <div className="grid gap-2 border-b border-[var(--gh-border-default)] p-3 xl:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)] xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--gh-fg-subtle)]" />

              <input
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(
                    event.target.value,
                  );
                  resetPage();
                }}
                placeholder="Search experiments"
                style={{ paddingLeft: "2.5rem" }} aria-label="Search experiments" className="gh-input h-9 w-full pl-10 pr-3"
              />
            </div>

            <div className="grid min-w-0 gap-2 sm:grid-cols-3">
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(
                    event.target
                      .value as StatusFilter,
                  );
                  resetPage();
                }}
                className="gh-input h-9 min-w-0 px-3"
                aria-label="Filter by status"
              >
                <option value="all">
                  All statuses
                </option>
                <option value="planned">
                  Planned
                </option>
                <option value="running">
                  Running
                </option>
                <option value="completed">
                  Completed
                </option>
                <option value="failed">
                  Failed
                </option>
              </select>

              <select
                value={datasetFilter}
                onChange={(event) => {
                  setDatasetFilter(
                    event.target.value,
                  );
                  resetPage();
                }}
                className="gh-input h-9 min-w-0 px-3"
                aria-label="Filter by dataset"
              >
                <option value="all">
                  All datasets
                </option>

                {Array.from(new Set(experiments.map((item) => item.dataset_version_id))).filter((id) => !datasetMap.has(id)).map((id) => <option key={id} value={id}>Dataset {id}</option>)}
                {datasets.map((dataset) => (
                  <option
                    key={dataset.id}
                    value={dataset.id}
                  >
                    {dataset.name} · v
                    {dataset.version}
                  </option>
                ))}
              </select>

              <select
                value={sortOption}
                onChange={(event) => {
                  setSortOption(
                    event.target
                      .value as SortOption,
                  );
                  resetPage();
                }}
                className="gh-input h-9 min-w-0 px-3"
                aria-label="Sort experiments"
              >
                <option value="newest">
                  Newest
                </option>
                <option value="oldest">
                  Oldest
                </option>
                <option value="name">
                  Name
                </option>
                <option value="status">
                  Status
                </option>
              </select>
            </div>
          </div>

          {experimentsQuery.data && !experimentsQuery.isError ? (
            <ExperimentCharts experiments={filteredExperiments} onStatus={(status) => { setStatusFilter(status); resetPage(); }} />
          ) : null}

          <div className="flex min-h-11 items-center justify-between border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-3">
            <div className="flex items-center gap-2">
              <Beaker className="size-4 text-[var(--gh-fg-muted)]" />

              <span className="text-sm font-medium text-[var(--gh-fg-default)]">
                Experiments
              </span>

              <span className="gh-badge">
                {filteredExperiments.length}
              </span>
            </div>

            <span className="hidden text-xs text-[var(--gh-fg-muted)] sm:block">
              Training and evaluation history
            </span>
          </div>

          {experimentsQuery.isLoading ? (
            <RegistryLoading />
          ) : experimentsQuery.isError ? (
            <RegistryError
              onRetry={() => {
                void experimentsQuery.refetch();
              }}
            />
          ) : visibleExperiments.length ===
            0 ? (
            <RegistryEmpty
              hasFilters={
                Boolean(searchQuery) ||
                statusFilter !== "all" ||
                datasetFilter !== "all"
              }
              onClear={() => {
                setSearchQuery("");
                setStatusFilter("all");
                setDatasetFilter("all");
                setSortOption("newest");
                setPage(1);
              }}
            />
          ) : (
            <div className="divide-y divide-[var(--gh-border-muted)]">
              {visibleExperiments.map(
                (experiment) => (
                  <ExperimentRow
                    key={experiment.id}
                    experiment={experiment}
                    datasetName={
                      datasetMap.get(
                        experiment.dataset_version_id,
                      )?.name ??
                      `Dataset ${experiment.dataset_version_id}`
                    }
                    datasetVersion={
                      datasetMap.get(
                        experiment.dataset_version_id,
                      )?.version
                    }
                  />
                ),
              )}
            </div>
          )}

          {!experimentsQuery.isLoading &&
          !experimentsQuery.isError &&
          filteredExperiments.length > 0 ? (
            <RegistryPagination
              page={safePage}
              totalPages={totalPages}
              totalItems={
                filteredExperiments.length
              }
              onPrevious={() =>
                setPage((current) =>
                  Math.max(
                    1,
                    current - 1,
                  ),
                )
              }
              onNext={() =>
                setPage((current) =>
                  Math.min(
                    totalPages,
                    current + 1,
                  ),
                )
              }
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ExperimentSummary({
  loading,
  summary,
}: {
  loading: boolean;
  summary: {
    total: number;
    planned: number;
    running: number;
    completed: number;
    failed: number;
  };
}) {
  const items = [
    {
      label: "Experiments",
      value: summary.total,
      icon: FlaskConical,
    },
    {
      label: "Planned",
      value: summary.planned,
      icon: CircleDot,
    },
    {
      label: "Running",
      value: summary.running,
      icon: Clock3,
    },
    {
      label: "Completed",
      value: summary.completed,
      icon: CheckCircle2,
    },
    {
      label: "Failed",
      value: summary.failed,
      icon: XCircle,
    },
  ];

  return (
    <section className="mt-4 grid gap-2 grid-cols-2 lg:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <Icon className="size-4 shrink-0 text-[var(--gh-fg-muted)]" />

            <div>
              <p className="text-xs text-[var(--gh-fg-muted)]">
                {item.label}
              </p>

              <p className="mt-0.5 text-base font-semibold text-[var(--gh-fg-default)]">
                {loading
                  ? "…"
                  : item.value.toLocaleString()}
              </p>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function ExperimentRow({
  experiment,
  datasetName,
  datasetVersion,
}: {
  experiment: ExperimentRead;
  datasetName: string;
  datasetVersion?: string;
}) {
  return (
    <article className="flex items-center gap-3 px-3 py-3 hover:bg-[var(--gh-canvas-subtle)]">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)]">
        <FlaskConical className="size-4 text-[var(--gh-fg-muted)]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={`/experiments/${experiment.id}`}
            className="truncate text-sm font-medium text-[var(--gh-accent-fg)] hover:underline"
          >
            {experiment.name}
          </Link>

          <StatusBadge
            status={experiment.status}
          />
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--gh-fg-muted)]">
          <span className="inline-flex items-center gap-1">
            <Database className="size-3.5" />
            {datasetName}
            {datasetVersion
              ? ` · v${datasetVersion}`
              : ""}
          </span>

          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {formatDate(
              experiment.created_at,
            )}
          </span>

          <span>
            Seed{" "}
            {experiment.random_seed ??
              "—"}
          </span>

          {experiment.code_version ? (
            <span>
              Code {experiment.code_version}
            </span>
          ) : null}
        </div>

        {experiment.description ? (
          <p className="mt-1 truncate text-xs text-[var(--gh-fg-muted)]">
            {experiment.description}
          </p>
        ) : null}
      </div>

      <div className="hidden min-w-24 text-right text-xs text-[var(--gh-fg-muted)] lg:block">
        {formatDuration(experiment)}
      </div>

      <Link
        href={`/experiments/${experiment.id}`}
        className="gh-button size-8 shrink-0 p-0"
        aria-label={`Open ${experiment.name}`}
      >
        <ArrowRight className="size-4" />
      </Link>
    </article>
  );
}

function StatusBadge({
  status,
}: {
  status: ExperimentStatus;
}) {
  const styles: Record<
    ExperimentStatus,
    string
  > = {
    planned:
      "text-[var(--gh-fg-muted)]",
    running:
      "text-[var(--gh-accent-fg)]",
    completed:
      "text-[var(--gh-success-fg)]",
    failed:
      "text-[var(--gh-danger-fg)]",
  };

  return (
    <span
      className={[
        "gh-badge capitalize",
        styles[status],
      ].join(" ")}
    >
      {status}
    </span>
  );
}

function RegistryLoading() {
  return (
    <div className="flex min-h-36 items-center justify-center text-sm text-[var(--gh-fg-muted)]">
      <RefreshCw className="mr-2 size-4 animate-spin" />
      Loading experiments…
    </div>
  );
}

function RegistryError({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center px-5 text-center">
      <TriangleAlert className="size-6 text-[var(--gh-danger-fg)]" />

      <p className="mt-3 text-sm font-medium text-[var(--gh-fg-default)]">
        Experiment registry unavailable
      </p>

      <button
        type="button"
        onClick={onRetry}
        className="gh-button mt-3"
      >
        <RefreshCw className="size-4" />
        Try again
      </button>
    </div>
  );
}

function RegistryEmpty({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center px-5 text-center">
      <FlaskConical className="size-7 text-[var(--gh-fg-subtle)]" />

      <p className="mt-3 text-sm font-medium text-[var(--gh-fg-default)]">
        {hasFilters
          ? "No matching experiments"
          : "No experiments created"}
      </p>

      <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--gh-fg-muted)]">
        {hasFilters
          ? "Change or clear the current filters."
          : "Create an experiment from a training-ready dataset."}
      </p>

      {hasFilters ? (
        <button
          type="button"
          onClick={onClear}
          className="gh-button mt-3"
        >
          Clear filters
        </button>
      ) : (
        <Link
          href="/experiments/new"
          className="gh-button gh-button-primary mt-3"
        >
          <FlaskConical className="size-4" />
          New experiment
        </Link>
      )}
    </div>
  );
}

function RegistryPagination({
  page,
  totalPages,
  totalItems,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <footer className="flex min-h-12 items-center justify-between border-t border-[var(--gh-border-default)] px-3">
      <p className="text-xs text-[var(--gh-fg-muted)]">
        {totalItems}{" "}
        {totalItems === 1
          ? "experiment"
          : "experiments"}
      </p>

      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--gh-fg-muted)]">
          Page {page} of {totalPages}
        </span>

        <button
          type="button"
          onClick={onPrevious}
          disabled={page <= 1}
          className="gh-button size-8 p-0"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          className="gh-button size-8 p-0"
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </footer>
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDuration(
  experiment: ExperimentRead,
) {
  if (
    !experiment.started_at ||
    !experiment.completed_at
  ) {
    if (experiment.status === "running") {
      return "In progress";
    }

    return "Not run";
  }

  const started = new Date(
    experiment.started_at,
  ).getTime();

  const completed = new Date(
    experiment.completed_at,
  ).getTime();

  if (
    Number.isNaN(started) ||
    Number.isNaN(completed) ||
    completed < started
  ) {
    return "Unknown";
  }

  const seconds = Math.round(
    (completed - started) / 1000,
  );

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(
    seconds / 60,
  );

  const remainingSeconds =
    seconds % 60;

  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(
    minutes / 60,
  );

  return `${hours}h ${minutes % 60}m`;
}


const STATUS_COLORS: Record<ExperimentStatus, string> = {
  planned: "var(--chart-4)", running: "var(--chart-1)",
  completed: "var(--chart-3)", failed: "var(--chart-5)",
};

function ExperimentCharts({ experiments, onStatus }: {
  experiments: ExperimentRead[];
  onStatus: (status: StatusFilter) => void;
}) {
  const [dataset, setDataset] = useState("");
  const [split, setSplit] = useState("test_metrics");
  const [metric, setMetric] = useState("macro_f1");
  const datasetIds = Array.from(new Set(experiments.map((item) => item.dataset_version_id)));
  const selectedDataset = datasetIds.includes(dataset) ? dataset : datasetIds[0] ?? "";
  const candidates = experiments.filter((item) => item.dataset_version_id === selectedDataset);
  const points = candidates.flatMap((item) => {
    const metrics = item.results?.[split];
    if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return [];
    const value = metrics[metric];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
      ? [{ item, value }] : [];
  });
  const statuses = (Object.keys(STATUS_COLORS) as ExperimentStatus[]).map((status) => ({
    status, count: experiments.filter((item) => item.status === status).length,
  }));
  const maxCount = Math.max(1, ...statuses.map((item) => item.count));
  const width = Math.max(440, points.length * 90 + 60);
  return (
    <div className="grid items-start gap-3 border-b border-border bg-background/40 p-3 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Run status</h2>
          <button className="text-xs text-primary hover:underline" onClick={() => onStatus("all")}>All statuses</button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{experiments.length} matching experiments · select a status to filter.</p>
        <svg viewBox="0 0 340 170" className="mt-2 h-40 w-full" role="img" aria-label="Experiment counts by status">
          {[0, 0.5, 1].map((fraction) => <g key={fraction}>
            <line x1="28" x2="332" y1={132 - fraction * 105} y2={132 - fraction * 105} stroke="var(--border)" strokeDasharray="3 4" />
            <text x="23" y={136 - fraction * 105} textAnchor="end" fill="var(--muted-foreground)" fontSize="10">{(maxCount * fraction).toLocaleString(undefined, { maximumFractionDigits: 1 })}</text>
          </g>)}
          {statuses.map(({status, count}, i) => <g key={status}>
            <rect x={44 + i * 75} y={132 - count / maxCount * 105} width="40" height={count / maxCount * 105} rx="4" fill={STATUS_COLORS[status]}><title>{status}: {count}</title></rect>
            <text x={64 + i * 75} y={125 - count / maxCount * 105} textAnchor="middle" fill="var(--foreground)" fontSize="11">{count}</text>
            <text x={64 + i * 75} y="151" textAnchor="middle" fill="var(--muted-foreground)" fontSize="10">{status}</text>
          </g>)}
        </svg>
        <div className="flex flex-wrap gap-1.5">{statuses.map(({status, count}) => <button key={status} onClick={() => onStatus(status)} className="rounded-md border border-border px-2 py-1 text-xs capitalize hover:bg-muted"><span style={{color: STATUS_COLORS[status]}}>●</span> {status} {count}</button>)}</div>
      </section>
      <section className="min-w-0 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Evaluation comparison</h2>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-64">
            <select aria-label="Evaluation split" className="gh-input px-2 py-1 text-xs" value={split} onChange={(e) => setSplit(e.target.value)}><option value="test_metrics">Test</option><option value="validation_metrics">Validation</option></select>
            <select aria-label="Evaluation metric" className="gh-input px-2 py-1 text-xs" value={metric} onChange={(e) => setMetric(e.target.value)}><option value="macro_f1">Macro F1</option><option value="accuracy">Accuracy</option><option value="weighted_f1">Weighted F1</option></select>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Same dataset version and split · recorded scores on a 0–1 scale.</p>
        {datasetIds.length > 1 ? <select aria-label="Dataset version for evaluation comparison" className="gh-input mt-2 w-full px-2 py-1 text-xs" value={selectedDataset} onChange={(e) => setDataset(e.target.value)}>{datasetIds.map((id, i) => <option key={id} value={id}>Dataset {i + 1} · {id}</option>)}</select> : null}
        {points.length ? <>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${width} 185`} style={{minWidth: width}} className="mt-2 h-44 w-full" role="img" aria-label={`${metric} comparison; exact scores and experiment links follow`}>
              {[0, 0.25, 0.5, 0.75, 1].map((tick) => <g key={tick}><line x1="36" x2={width - 10} y1={150 - tick * 125} y2={150 - tick * 125} stroke="var(--border)" strokeDasharray="3 4" /><text x="30" y={154 - tick * 125} textAnchor="end" fill="var(--muted-foreground)" fontSize="10">{tick}</text></g>)}
              {points.map(({item, value}, i) => {
                const step = (width - 50) / points.length;
                const x = 40 + step * i + step / 2;
                return <g key={item.id}><rect x={x - Math.min(44, step / 2) / 2} y={150 - value * 125} width={Math.min(44, step / 2)} height={value * 125} rx="4" fill="var(--chart-1)"><title>{item.name}: {value.toFixed(4)}</title></rect><text x={x} y={143 - value * 125} textAnchor="middle" fontSize="11" fill="var(--foreground)">{value.toFixed(4)}</text><text x={x} y="171" textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">Run {i + 1}</text></g>;
              })}
            </svg>
          </div>
          <details className="mt-1 text-xs"><summary className="cursor-pointer text-primary">View {points.length} experiment names and exact scores</summary><ul className="mt-2 max-h-36 space-y-2 overflow-auto">{points.map(({item, value}, i) => <li key={item.id} className="flex justify-between gap-3"><Link className="text-primary hover:underline" href={`/experiments/${item.id}`}>Run {i + 1} · {item.name}</Link><span>{value.toFixed(4)}</span></li>)}</ul></details>
        </> : <p className="py-8 text-sm text-muted-foreground">No recorded {metric.replaceAll("_", " ")} values for this selection.</p>}
        {candidates.length > points.length ? <p className="mt-2 text-xs text-muted-foreground">{candidates.length - points.length} runs have no valid score for this selection.</p> : null}
      </section>
    </div>
  );
}
