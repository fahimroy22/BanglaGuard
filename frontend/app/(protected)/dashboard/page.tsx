"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Database,
  ExternalLink,
  FileText,
  FlaskConical,
  MessageSquareText,
  Plus,
  RefreshCw,
  Server,
} from "lucide-react";
import Link from "next/link";

import {
  getDatasetSummary,
  listDatasets,
} from "@/lib/dataset-management";

const quickAccess = [
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
];

export default function DashboardPage() {
  const summaryQuery = useQuery({
    queryKey: ["dashboard", "dataset-summary"],
    queryFn: getDatasetSummary,
  });

  const datasetsQuery = useQuery({
    queryKey: ["dashboard", "recent-datasets"],
    queryFn: () =>
      listDatasets({
        limit: 5,
        offset: 0,
      }),
  });

  const summary = summaryQuery.data;
  const recentDatasets =
    datasetsQuery.data?.items ?? [];

  function refreshDashboard() {
    void Promise.all([
      summaryQuery.refetch(),
      datasetsQuery.refetch(),
    ]);
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <header className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--gh-fg-default)]">
              Research dashboard
            </h1>

            <p className="mt-1 text-sm text-[var(--gh-fg-muted)]">
              Explore your datasets, run experiments, and review research results.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={refreshDashboard}
              disabled={
                summaryQuery.isFetching ||
                datasetsQuery.isFetching
              }
              className="gh-button"
            >
              <RefreshCw
                className={[
                  "size-4",
                  summaryQuery.isFetching ||
                  datasetsQuery.isFetching
                    ? "animate-spin"
                    : "",
                ].join(" ")}
              />

              Refresh
            </button>

            <Link
              href="/datasets/upload"
              className="gh-button"
            >
              <Plus className="size-4" />
              Add dataset
            </Link>

            <Link
              href="/prediction"
              className="gh-button gh-button-primary"
            >
              <BrainCircuit className="size-4" />
              Run prediction
            </Link>
          </div>
        </header>

        <section aria-label="Dataset overview" className="mt-7">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Dataset versions"
              note="All registered versions"
              value={formatNumber(
                summary?.total_datasets,
                summaryQuery.isLoading,
              )}
              icon={Database}
            />

            <Metric
              label="Samples"
              note="Across registered versions; may overlap"
              value={formatNumber(
                summary?.total_samples,
                summaryQuery.isLoading,
              )}
              icon={FileText}
            />

            <Metric
              label="Training rows"
              note="Across registered training splits"
              value={formatNumber(
                summary?.train_samples,
                summaryQuery.isLoading,
              )}
              icon={FlaskConical}
            />

            <Metric
              label="Data status"
              note="Based on dashboard data requests"
              value={
                summaryQuery.isError || datasetsQuery.isError
                  ? "Check connection"
                  : summaryQuery.isPending || datasetsQuery.isPending
                    ? "Loading…"
                    : summaryQuery.isFetching || datasetsQuery.isFetching
                      ? "Refreshing…"
                      : "Loaded"
              }
              icon={Server}
              success={summaryQuery.isSuccess && datasetsQuery.isSuccess}
            />
          </div>
        </section>

        {summaryQuery.isError && (
          <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-card p-4 text-sm">
            <p className="text-muted-foreground">Dataset totals could not be refreshed. Any previous values may be outdated.</p>
            <button type="button" className="gh-button" disabled={summaryQuery.isFetching} onClick={() => { void summaryQuery.refetch(); }}>Retry totals</button>
          </div>
        )}

        <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0 overflow-hidden rounded-[14px] border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Recent datasets
                </h2>

                <p className="text-xs text-[var(--gh-fg-muted)]">
                  Latest registered versions.
                </p>
              </div>

              <Link
                href="/datasets"
                className="gh-link inline-flex shrink-0 items-center gap-1 text-sm"
              >
                View all
                <ArrowRight className="size-4" />
              </Link>
            </div>

            {datasetsQuery.isLoading ? (
              <LoadingState />
            ) : datasetsQuery.isError ? (
              <ErrorState
                onRetry={() => {
                  void datasetsQuery.refetch();
                }}
              />
            ) : recentDatasets.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="divide-y divide-[var(--gh-border-muted)]">
                {recentDatasets.map((dataset) => (
                  <Link
                    key={dataset.id}
                    href={`/datasets/${dataset.id}`}
                    className="group flex min-h-20 items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/60"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                      <Database className="size-4 text-[var(--gh-fg-muted)]" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="break-words text-sm font-medium text-[var(--gh-fg-default)]">
                          {dataset.name}
                        </p>

                        <span className="gh-badge shrink-0">
                          {formatTask(dataset.task)}
                        </span>
                      </div>

                      <p className="mt-0.5 truncate text-xs text-[var(--gh-fg-muted)]">
                        {dataset.version}
                        {" · "}
                        {dataset.total_samples.toLocaleString()}
                        {" samples · "}
                        {formatDate(dataset.created_at)}
                      </p>
                    </div>

                    <ExternalLink className="size-4 shrink-0 text-[var(--gh-fg-subtle)] group-hover:text-[var(--gh-accent-fg)]" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="min-w-0 overflow-hidden rounded-[14px] border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">
                Quick access
              </h2>

              <p className="text-xs text-[var(--gh-fg-muted)]">
                Open a workspace.
              </p>
            </div>

            <nav aria-label="Research workspaces" className="space-y-1 p-2">
              {quickAccess.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex h-12 items-center gap-3 rounded-xl px-3 transition-colors hover:bg-muted"
                  >
                    <Icon className="size-4 shrink-0 text-[var(--gh-fg-muted)] group-hover:text-[var(--gh-accent-fg)]" />

                    <span className="flex-1 text-sm font-medium text-[var(--gh-fg-default)]">
                      {item.label}
                    </span>

                    <ArrowRight className="size-4 text-[var(--gh-fg-subtle)] group-hover:text-[var(--gh-accent-fg)]" />
                  </Link>
                );
              })}
            </nav>
          </section>
        </div>
      </div>
    </div>
  );
}

type MetricProps = {
  label: string;
  value: string;
  icon: typeof Database;
  success?: boolean;
  note: string;
};

function Metric({
  label,
  value,
  icon: Icon,
  success = false,
  note,
}: MetricProps) {
  return (
    <article className="min-w-0 rounded-[14px] border border-border bg-card px-5 py-[18px]">
      <div className="flex items-center gap-2 text-xs text-[var(--gh-fg-muted)]">
        <Icon className="size-4" />
        {label}
      </div>

      <p
        className={[
          "mt-2 text-2xl font-bold tracking-tight",
          success
            ? "text-[var(--gh-success-fg)]"
            : "text-[var(--gh-fg-default)]",
        ].join(" ")}
      >
        {value}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{note}</p>
    </article>
  );
}

function LoadingState() {
  return (
    <div role="status" className="flex min-h-48 items-center justify-center text-sm text-[var(--gh-fg-muted)]">
      <RefreshCw className="mr-2 size-4 animate-spin" />
      Loading datasets…
    </div>
  );
}

function ErrorState({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-5 text-center">
      <p className="text-sm text-[var(--gh-fg-muted)]">
        Datasets could not be loaded.
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

function EmptyState() {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-5 text-center">
      <Database className="size-6 text-[var(--gh-fg-subtle)]" />

      <p className="mt-3 text-sm font-medium text-[var(--gh-fg-default)]">
        No datasets yet
      </p>

      <Link
        href="/datasets/upload"
        className="gh-button mt-3"
      >
        <Plus className="size-4" />
        Add dataset
      </Link>
    </div>
  );
}

function formatNumber(
  value: number | undefined,
  loading: boolean,
) {
  if (loading) {
    return "…";
  }

  return typeof value === "number"
    ? value.toLocaleString()
    : "—";
}

function formatTask(task: string) {
  if (task === "hate_speech") {
    return "Hate speech";
  }

  if (task === "sentiment") {
    return "Sentiment";
  }

  return task.replaceAll("_", " ");
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
