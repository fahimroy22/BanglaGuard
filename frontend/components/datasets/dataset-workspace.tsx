"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  FileText,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import {
  getDatasetSummary,
  listDatasets,
} from "@/lib/dataset-management";

type DatasetRecord =
  Awaited<
    ReturnType<typeof listDatasets>
  >["items"][number];

type TaskFilter =
  | "all"
  | "hate_speech"
  | "sentiment";

type SortOption =
  | "newest"
  | "oldest"
  | "name"
  | "samples";

const PAGE_SIZE = 10;

export function DatasetWorkspace() {
  const [searchQuery, setSearchQuery] =
    useState("");

  const [taskFilter, setTaskFilter] =
    useState<TaskFilter>("all");

  const [sortOption, setSortOption] =
    useState<SortOption>("newest");

  const [page, setPage] = useState(1);

  const [selectedDataset, setSelectedDataset] =
    useState<DatasetRecord | null>(null);

  const [openMenuId, setOpenMenuId] =
    useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["datasets", "summary"],
    queryFn: getDatasetSummary,
  });

  const datasetsQuery = useQuery({
    queryKey: ["datasets", "registry"],
    queryFn: () =>
      listDatasets({
        limit: 100,
        offset: 0,
      }),
  });

  const datasets = useMemo(
    () => datasetsQuery.data?.items ?? [],
    [datasetsQuery.data],
  );

  const filteredDatasets = useMemo(() => {
    const normalizedSearch =
      searchQuery.trim().toLowerCase();

    const matching = datasets.filter(
      (dataset) => {
        const matchesSearch =
          !normalizedSearch ||
          dataset.name
            .toLowerCase()
            .includes(normalizedSearch) ||
          dataset.version
            .toLowerCase()
            .includes(normalizedSearch) ||
          dataset.description
            ?.toLowerCase()
            .includes(normalizedSearch);

        const matchesTask =
          taskFilter === "all" ||
          dataset.task === taskFilter;

        return matchesSearch && matchesTask;
      },
    );

    return [...matching].sort((a, b) => {
      if (sortOption === "name") {
        return a.name.localeCompare(b.name);
      }

      if (sortOption === "samples") {
        return (
          b.total_samples -
          a.total_samples
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
    datasets,
    searchQuery,
    taskFilter,
    sortOption,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredDatasets.length / PAGE_SIZE,
    ),
  );

  const safePage = Math.min(
    page,
    totalPages,
  );

  const visibleDatasets =
    filteredDatasets.slice(
      (safePage - 1) * PAGE_SIZE,
      safePage * PAGE_SIZE,
    );

  function updateSearch(value: string) {
    setSearchQuery(value);
    setPage(1);
  }

  function updateTask(value: TaskFilter) {
    setTaskFilter(value);
    setPage(1);
  }

  function updateSort(value: SortOption) {
    setSortOption(value);
    setPage(1);
  }

  function refreshRegistry() {
    void Promise.all([
      summaryQuery.refetch(),
      datasetsQuery.refetch(),
    ]);
  }

  async function copyDatasetId(
    dataset: DatasetRecord,
  ) {
    try {
      await navigator.clipboard.writeText(
        dataset.id,
      );

      toast.success("Dataset ID copied.");
      setOpenMenuId(null);
    } catch {
      toast.error(
        "Unable to copy the dataset ID.",
      );
    }
  }

  const isRefreshing =
    summaryQuery.isFetching ||
    datasetsQuery.isFetching;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--gh-fg-default)]">
              Dataset registry
            </h1>

            <p className="mt-1 text-sm text-[var(--gh-fg-muted)]">
              Explore dataset versions, compare sample counts, and inspect training splits.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              href="/datasets/upload"
              className="gh-button gh-button-primary"
            >
              <Database className="size-4" />
              Upload dataset
            </Link>
          </div>
        </header>

        <DatasetSummaryStrip
          loading={summaryQuery.isLoading}
          totalDatasets={
            summaryQuery.data?.total_datasets
          }
          totalSamples={
            summaryQuery.data?.total_samples
          }
          trainingSamples={
            summaryQuery.data?.train_samples
          }
          checksums={
            summaryQuery.data
              ?.datasets_with_checksum
          }
        />

        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Totals cover all registered versions and may count overlapping samples. A recorded checksum does not confirm a current integrity check.
        </p>
        {summaryQuery.isError && <p role="alert" className="mt-2 text-sm text-destructive">Summary could not be refreshed. Previous totals may be outdated; use Refresh to retry.</p>}
        {datasetsQuery.data && <p className="mt-4 text-xs text-muted-foreground">
          Loaded {datasets.length} of {datasetsQuery.data.total} registered versions. Search, filters, charts, and pagination apply to these loaded versions.
          {datasetsQuery.data.has_next && " Only the first 100 versions are loaded."}
        </p>}

        <section className="mt-6 overflow-visible rounded-xl border border-[var(--gh-border-default)] bg-[var(--gh-canvas)]">
          <div className="flex flex-col gap-3 border-b border-[var(--gh-border-default)] p-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-[var(--gh-fg-subtle)]" />

              <input
                type="search"
                value={searchQuery}
                onChange={(event) =>
                  updateSearch(event.target.value)
                }
                placeholder="Search name, version, or description"
                aria-label="Search datasets"
                className="gh-input h-9 !pl-11 !pr-3"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:flex">
              <select
                value={taskFilter}
                onChange={(event) =>
                  updateTask(
                    event.target.value as TaskFilter,
                  )
                }
                className="gh-input h-9 min-w-40 px-3"
                aria-label="Filter datasets by task"
              >
                <option value="all">All tasks</option>
                <option value="hate_speech">
                  Hate speech
                </option>
                <option value="sentiment">
                  Sentiment
                </option>
              </select>

              <select
                value={sortOption}
                onChange={(event) =>
                  updateSort(
                    event.target.value as SortOption,
                  )
                }
                className="gh-input h-9 min-w-40 px-3"
                aria-label="Sort datasets"
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
                <option value="samples">
                  Samples
                </option>
              </select>
            </div>
          </div>

          {!datasetsQuery.isLoading && !datasetsQuery.isError && (
            <DatasetVisualExplorer datasets={filteredDatasets} />
          )}

          <div className="flex min-h-11 items-center justify-between border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-3">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-[var(--gh-fg-muted)]" />

              <span className="text-sm font-medium text-[var(--gh-fg-default)]">
                Datasets
              </span>

              <span className="gh-badge">
                {filteredDatasets.length}
              </span>
            </div>

            <span className="hidden text-xs text-[var(--gh-fg-muted)] sm:block">
              Select a row to inspect
            </span>
          </div>

          {datasetsQuery.isLoading ? (
            <RegistryLoading />
          ) : datasetsQuery.isError ? (
            <RegistryError
              onRetry={() => {
                void datasetsQuery.refetch();
              }}
            />
          ) : visibleDatasets.length === 0 ? (
            <RegistryEmpty
              hasFilters={
                Boolean(searchQuery) ||
                taskFilter !== "all"
              }
              onClear={() => {
                setSearchQuery("");
                setTaskFilter("all");
                setPage(1);
              }}
            />
          ) : (
            <div className="divide-y divide-[var(--gh-border-muted)]">
              {visibleDatasets.map(
                (dataset) => (
                  <DatasetRow
                    key={dataset.id}
                    dataset={dataset}
                    menuOpen={
                      openMenuId ===
                      dataset.id
                    }
                    onInspect={() => {
                      setSelectedDataset(
                        dataset,
                      );
                      setOpenMenuId(null);
                    }}
                    onToggleMenu={() =>
                      setOpenMenuId(
                        openMenuId ===
                          dataset.id
                          ? null
                          : dataset.id,
                      )
                    }
                    onCopyId={() =>
                      void copyDatasetId(
                        dataset,
                      )
                    }
                  />
                ),
              )}
            </div>
          )}

          {!datasetsQuery.isLoading &&
          !datasetsQuery.isError &&
          filteredDatasets.length > 0 ? (
            <RegistryPagination
              page={safePage}
              totalPages={totalPages}
              totalItems={
                filteredDatasets.length
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

      <DatasetInspector
        dataset={selectedDataset}
        onClose={() =>
          setSelectedDataset(null)
        }
      />
    </div>
  );
}

type DatasetSummaryStripProps = {
  loading: boolean;
  totalDatasets?: number;
  totalSamples?: number;
  trainingSamples?: number;
  checksums?: number;
};

function DatasetSummaryStrip({
  loading,
  totalDatasets,
  totalSamples,
  trainingSamples,
  checksums,
}: DatasetSummaryStripProps) {
  const items = [
    {
      label: "Dataset versions",
      value: formatNumber(
        totalDatasets,
        loading,
      ),
      icon: Database,
    },
    {
      label: "Samples",
      value: formatNumber(
        totalSamples,
        loading,
      ),
      icon: FileText,
    },
    {
      label: "Training",
      value: formatNumber(
        trainingSamples,
        loading,
      ),
      icon: SlidersHorizontal,
    },
    {
      label: "Checksums recorded",
      value: loading
        ? "…"
        : checksums === undefined
          ? "—"
          : checksums.toLocaleString(),
      icon: ShieldCheck,
    },
  ];

  return (
    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <div
            key={item.label}
            className="flex min-h-28 items-start gap-3 rounded-[14px] border border-border bg-card px-5 py-5"
          >
            <Icon className="size-4 shrink-0 text-[var(--gh-fg-muted)]" />

            <div className="min-w-0">
              <p className="text-xs text-[var(--gh-fg-muted)]">
                {item.label}
              </p>

              <p className="mt-2 truncate text-2xl font-bold tabular-nums text-[var(--gh-fg-default)]">
                {item.value}
              </p>
            </div>
          </div>
        );
      })}
    </section>
  );
}

type DatasetRowProps = {
  dataset: DatasetRecord;
  menuOpen: boolean;
  onInspect: () => void;
  onToggleMenu: () => void;
  onCopyId: () => void;
};

function DatasetRow({
  dataset,
  menuOpen,
  onInspect,
  onToggleMenu,
  onCopyId,
}: DatasetRowProps) {
  return (
    <article className="group relative flex items-center gap-3 px-4 py-4 hover:bg-[var(--gh-canvas-subtle)]">
      <button
        type="button"
        onClick={onInspect}
        className="absolute inset-0 z-0 text-left"
        aria-label={`Inspect ${dataset.name}`}
      />

      <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-xl border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)]">
        <Database className="size-4 text-[var(--gh-fg-muted)]" />
      </div>

      <div className="relative z-10 min-w-0 flex-1 pointer-events-none">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/datasets/${dataset.id}`}
            className="pointer-events-auto truncate text-sm font-medium text-[var(--gh-accent-fg)] hover:underline"
          >
            {dataset.name}
          </Link>

          <span className="gh-badge hidden shrink-0 sm:inline-flex">
            {formatTask(dataset.task)}
          </span>
        </div>

        <p className="mt-0.5 truncate text-xs text-[var(--gh-fg-muted)]">
          {dataset.description ??
            "No description"}
        </p>
      </div>

      <div className="relative z-10 hidden min-w-24 text-sm text-[var(--gh-fg-muted)] md:block">
        {dataset.version}
      </div>

      <div className="relative z-10 hidden min-w-24 text-sm text-[var(--gh-fg-muted)] lg:block">
        {dataset.total_samples.toLocaleString()}
      </div>

      <div className="relative z-10 hidden min-w-24 text-sm text-[var(--gh-fg-muted)] xl:block">
        {formatDate(dataset.created_at)}
      </div>

      <div className="relative z-30">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleMenu();
          }}
          className="flex size-8 items-center justify-center rounded-xl text-[var(--gh-fg-muted)] hover:bg-[var(--gh-neutral-subtle)] hover:text-[var(--gh-fg-default)]"
          aria-label={`Actions for ${dataset.name}`}
          aria-expanded={menuOpen}
        >
          <MoreHorizontal className="size-4" />
        </button>

        {menuOpen ? (
          <div className="absolute right-0 top-9 z-50 w-48 overflow-hidden rounded-xl border border-[var(--gh-border-default)] bg-[var(--gh-canvas-overlay)] py-1 shadow-[var(--gh-shadow-large)]">
            <Link
              href={`/datasets/${dataset.id}`}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--gh-canvas-subtle)]"
            >
              <ArrowRight className="size-4" />
              Open details
            </Link>

            <button
              type="button"
              onClick={onCopyId}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--gh-canvas-subtle)]"
            >
              <Copy className="size-4" />
              Copy dataset ID
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

type DatasetInspectorProps = {
  dataset: DatasetRecord | null;
  onClose: () => void;
};

function DatasetInspector({
  dataset,
  onClose,
}: DatasetInspectorProps) {
  if (!dataset) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close dataset inspector"
        className="fixed inset-0 z-40 bg-black/35"
        onClick={onClose}
      />

      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-[var(--gh-border-default)] bg-[var(--gh-canvas-overlay)] shadow-[var(--gh-shadow-large)]"
        aria-label="Dataset inspector"
      >
        <header className="flex h-14 items-center justify-between border-b border-[var(--gh-border-default)] px-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--gh-fg-default)]">
              Dataset details
            </p>

            <p className="truncate text-xs text-[var(--gh-fg-muted)]">
              {dataset.name}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-xl hover:bg-[var(--gh-canvas-subtle)]"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)]">
              <Database className="size-5 text-[var(--gh-fg-muted)]" />
            </div>

            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-[var(--gh-fg-default)]">
                {dataset.name}
              </h2>

              <p className="mt-1 text-sm leading-6 text-[var(--gh-fg-muted)]">
                {dataset.description ??
                  "No dataset description was provided."}
              </p>
            </div>
          </div>

          <dl className="mt-6 divide-y divide-[var(--gh-border-muted)] rounded-xl border border-[var(--gh-border-default)]">
            <DetailRow
              label="Task"
              value={formatTask(
                dataset.task,
              )}
            />

            <DetailRow
              label="Version"
              value={dataset.version}
            />

            <DetailRow
              label="Samples"
              value={dataset.total_samples.toLocaleString()}
            />

            <DetailRow
              label="Created"
              value={formatDateTime(
                dataset.created_at,
              )}
            />

            <DetailRow
              label="Dataset ID"
              value={dataset.id}
              monospace
            />
          </dl>

          <div className="mt-5 rounded-xl border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] p-3">
            <div className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-[var(--gh-success-fg)]" />

              <div>
                <p className="text-sm font-medium text-[var(--gh-fg-default)]">
                  Registered version
                </p>

                <p className="mt-1 text-xs leading-5 text-[var(--gh-fg-muted)]">
                  This dataset is available in
                  the BanglaGuard dataset
                  registry.
                </p>
              </div>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--gh-border-default)] p-3">
          <button
            type="button"
            onClick={onClose}
            className="gh-button"
          >
            Close
          </button>

          <Link
            href={`/experiments/new?datasetId=${dataset.id}`}
            className="gh-button gh-button-primary"
          >
            Use in experiment
            <ArrowRight className="size-4" />
          </Link>
        </footer>
      </aside>
    </>
  );
}

function DetailRow({
  label,
  value,
  monospace = false,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 px-3 py-2.5">
      <dt className="text-xs text-[var(--gh-fg-muted)]">
        {label}
      </dt>

      <dd
        className={[
          "min-w-0 break-words text-sm text-[var(--gh-fg-default)]",
          monospace
            ? "font-mono text-xs"
            : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function RegistryLoading() {
  return (
    <div className="flex min-h-56 items-center justify-center text-sm text-[var(--gh-fg-muted)]">
      <RefreshCw className="mr-2 size-4 animate-spin" />
      Loading datasets…
    </div>
  );
}

function RegistryError({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center">
      <Database className="size-6 text-[var(--gh-fg-subtle)]" />

      <p className="mt-3 text-sm font-medium text-[var(--gh-fg-default)]">
        Dataset registry unavailable
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
    <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center">
      <Database className="size-6 text-[var(--gh-fg-subtle)]" />

      <p className="mt-3 text-sm font-medium text-[var(--gh-fg-default)]">
        {hasFilters
          ? "No matching datasets"
          : "No datasets registered"}
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
          href="/datasets/upload"
          className="gh-button gh-button-primary mt-3"
        >
          Upload dataset
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
          ? "dataset"
          : "datasets"}
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
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Visualizes registered metadata only; no inferred labels or model scores. */
function DatasetVisualExplorer({ datasets }: { datasets: DatasetRecord[] }) {
  const [selectedId, setSelectedId] = useState("");
  const [metric, setMetric] = useState<"total_samples" | "train_samples">("total_samples");
  const [percent, setPercent] = useState(false);
  const selected = datasets.find((dataset) => dataset.id === selectedId) ?? datasets[0];
  const maximum = Math.max(1, ...datasets.map((dataset) => dataset[metric]));

  if (!selected) {
    return <p className="border-b border-border p-5 text-sm text-muted-foreground">No matching versions to chart. Adjust the search or task filter above.</p>;
  }

  const splits = [
    { label: "Train", count: selected.train_samples, color: "var(--chart-1)" },
    { label: "Validation", count: selected.validation_samples, color: "var(--chart-2)" },
    { label: "Test", count: selected.test_samples, color: "var(--chart-4)" },
  ];
  const splitTotal = splits.reduce((sum, split) => sum + split.count, 0);
  const maxSplit = Math.max(1, ...splits.map((split) => split.count));

  return (
    <section aria-label="Interactive dataset charts" className="grid gap-4 border-b border-border bg-background/50 p-4 lg:grid-cols-2">
      <figure className="min-w-0 rounded-[14px] border border-border bg-card p-4 sm:p-5">
        <figcaption className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Compare dataset versions</h2>
            <p className="mt-1 text-xs text-muted-foreground">{datasets.length} matching versions · select a bar to explore its splits.</p>
          </div>
          <select aria-label="Chart sample metric" value={metric} onChange={(event) => setMetric(event.target.value as typeof metric)} className="gh-input !w-auto">
            <option value="total_samples">All samples</option>
            <option value="train_samples">Training rows</option>
          </select>
        </figcaption>
        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto p-1">
          {datasets.map((dataset) => (
            <button key={dataset.id} type="button" aria-pressed={dataset.id === selected.id}
              onClick={() => setSelectedId(dataset.id)}
              title={`${dataset.name} · ${dataset.version}: ${dataset[metric].toLocaleString()} ${metric === "total_samples" ? "samples" : "training rows"}`}
              className={`block w-full rounded-lg border p-2 text-left transition-colors hover:bg-muted ${dataset.id === selected.id ? "border-primary/50 bg-accent/40" : "border-transparent"}`}>
              <span className="flex items-start justify-between gap-3 text-xs">
                <span className="min-w-0 break-words">{dataset.name} <span className="text-muted-foreground">· {dataset.version}</span></span>
                <span className="shrink-0 font-semibold tabular-nums">{dataset[metric].toLocaleString()}</span>
              </span>
              <span aria-hidden="true" className="mt-2 block h-2 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${dataset[metric] / maximum * 100}%` }} />
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Linear scale from 0 to {maximum.toLocaleString()}. Versions may contain the same texts.</p>
      </figure>

      <figure className="min-w-0 rounded-[14px] border border-border bg-card p-4 sm:p-5">
        <figcaption>
          <h2 className="text-base font-semibold">Explore the split</h2>
          <p className="mt-1 text-xs text-muted-foreground">Registered counts for one dataset version.</p>
        </figcaption>
        <select aria-label="Dataset version for split chart" value={selected.id} onChange={(event) => setSelectedId(event.target.value)} className="gh-input mt-4">
          {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name} · {dataset.version}</option>)}
        </select>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={percent} onChange={(event) => setPercent(event.target.checked)} className="size-4 accent-[var(--primary)]" />
          Show percentage of registered split rows
        </label>
        <div aria-live="polite" className="mt-5 space-y-4">
          {splits.map((split) => {
            const share = splitTotal > 0 ? split.count / splitTotal * 100 : 0;
            return <div key={split.label}>
              <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                <span>{split.label}</span>
                <span className="font-semibold tabular-nums">{percent ? (splitTotal > 0 ? `${share.toFixed(1)}%` : "—") : split.count.toLocaleString()}</span>
              </div>
              <div aria-hidden="true" className="h-3 overflow-hidden rounded-full bg-muted" title={`${split.label}: ${split.count.toLocaleString()} rows`}>
                <div className="h-full rounded-full transition-[width] motion-reduce:transition-none" style={{ width: `${percent ? share : split.count / maxSplit * 100}%`, backgroundColor: split.color }} />
              </div>
            </div>;
          })}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {percent ? "Scale: 0–100% of registered split rows." : `Scale: 0–${maxSplit.toLocaleString()} rows.`}
          {" "}{splitTotal.toLocaleString()} split rows / {selected.total_samples.toLocaleString()} total samples.
          {splitTotal === 0 ? " No split rows registered yet." : splitTotal !== selected.total_samples ? " Split counts differ from the registered total; inspect the dataset before training." : ""}
        </p>
        <Link href={`/datasets/${selected.id}`} className="gh-link mt-4 inline-flex items-center gap-1 text-sm">Inspect selected version <ArrowRight className="size-4" /></Link>
      </figure>
    </section>
  );
}
