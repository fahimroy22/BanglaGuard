"use client";

import {
  AlertCircle,
  CheckCircle2,
  Database,
  Filter,
  XCircle,
  Layers3,
  Eye,
  Gauge,
  RefreshCw,
  Search,
  Tags,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { DatasetExportDialog } from "@/components/feedback/dataset-export-dialog";
import { DatasetExportHistory } from "@/components/feedback/dataset-export-history";
import { listDatasetBuilderItems } from "@/lib/feedback";
import { cn } from "@/lib/utils";

import type { DatasetBuilderItem } from "@/types/feedback";

type TaskFilter = "all" | "hate_speech" | "sentiment";

type StatusFilter = "all" | "pending" | "reviewed" | "rejected";

type ReadinessFilter = "all" | "ready" | "not-ready";

type VerdictFilter = "all" | "correct" | "incorrect" | "unsure";

type SortOption =
  | "reviewed-newest"
  | "reviewed-oldest"
  | "confidence-highest"
  | "confidence-lowest"
  | "label-ascending"
  | "label-descending";

type SelectOption = {
  id: string;
  label: string;
};

function formatWords(value?: string | null): string {
  if (!value) {
    return "—";
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatPercentage(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  const normalized = value <= 1 ? value * 100 : value;

  return `${normalized.toFixed(1)}%`;
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function getItemText(item: DatasetBuilderItem): string {
  return item.text ?? item.normalized_text ?? "Prediction text unavailable";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to load Dataset Builder " + "records from the backend.";
}

function getReadinessClass(ready: boolean): string {
  return ready
    ? "border-emerald-300 bg-emerald-50 " +
        "text-emerald-700 dark:bg-emerald-950/30 " +
        "dark:text-emerald-300"
    : "border-amber-300 bg-amber-50 " +
        "text-amber-700 dark:bg-amber-950/30 " +
        "dark:text-amber-300";
}

export function DatasetBuilder() {
  const [selectedFeedbackIds, setSelectedFeedbackIds] = useState<Set<string>>(
    new Set(),
  );

  const [searchValue, setSearchValue] = useState("");

  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [readinessFilter, setReadinessFilter] =
    useState<ReadinessFilter>("all");

  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("all");

  const [modelFilter, setModelFilter] = useState("all");

  const [reviewerFilter, setReviewerFilter] = useState("all");

  const [labelFilter, setLabelFilter] = useState("all");

  const [reviewedFrom, setReviewedFrom] = useState("");

  const [reviewedTo, setReviewedTo] = useState("");

  const [sortOption, setSortOption] = useState<SortOption>("reviewed-newest");

  const [previewFeedbackId, setPreviewFeedbackId] = useState<string | null>(
    null,
  );

  const [previewScope, setPreviewScope] = useState<"filtered" | "selection">(
    "filtered",
  );

  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const datasetQuery = useQuery({
    queryKey: ["feedback", "dataset-builder"],
    queryFn: () =>
      listDatasetBuilderItems({
        limit: 500,
        offset: 0,
      }),
  });

  if (datasetQuery.isLoading) {
    return <DatasetBuilderLoading />;
  }

  if (datasetQuery.isError) {
    return (
      <DatasetBuilderError
        message={getErrorMessage(datasetQuery.error)}
        onRetry={() => {
          void datasetQuery.refetch();
        }}
      />
    );
  }

  const response = datasetQuery.data;

  const items = response?.items ?? [];

  const summary = response?.summary;

  const modelOptions: SelectOption[] = Array.from(
    new Map(
      items.map((item) => [
        item.model_version_id,
        {
          id: item.model_version_id,
          label: `${item.model_name} v${item.model_version}`,
        },
      ]),
    ).values(),
  ).sort((left, right) => left.label.localeCompare(right.label));

  const reviewerOptions: SelectOption[] = Array.from(
    new Map(
      items
        .filter((item) => item.reviewed_by_id)
        .map((item) => [
          item.reviewed_by_id as string,
          {
            id: item.reviewed_by_id as string,
            label:
              item.reviewer_name ?? item.reviewer_email ?? "Unknown reviewer",
          },
        ]),
    ).values(),
  ).sort((left, right) => left.label.localeCompare(right.label));

  const labelOptions = Array.from(
    new Set(
      items
        .map((item) => item.final_label)
        .filter((label): label is string => Boolean(label)),
    ),
  ).sort();

  const normalizedSearch = searchValue.trim().toLowerCase();

  const filteredItems = items
    .filter((item) => {
      const matchesTask = taskFilter === "all" || item.task === taskFilter;

      const matchesStatus =
        statusFilter === "all" || item.feedback_status === statusFilter;

      const matchesReadiness =
        readinessFilter === "all" ||
        (readinessFilter === "ready"
          ? item.is_dataset_ready
          : !item.is_dataset_ready);

      const matchesVerdict =
        verdictFilter === "all" || item.verdict === verdictFilter;

      const matchesModel =
        modelFilter === "all" || item.model_version_id === modelFilter;

      const matchesReviewer =
        reviewerFilter === "all" || item.reviewed_by_id === reviewerFilter;

      const matchesLabel =
        labelFilter === "all" || item.final_label === labelFilter;

      const reviewedDate = item.reviewed_at ? new Date(item.reviewed_at) : null;

      const matchesFrom =
        !reviewedFrom ||
        (reviewedDate !== null &&
          reviewedDate >= new Date(`${reviewedFrom}T00:00:00`));

      const matchesTo =
        !reviewedTo ||
        (reviewedDate !== null &&
          reviewedDate <= new Date(`${reviewedTo}T23:59:59`));

      const searchableText = [
        getItemText(item),
        item.prediction_id,
        item.feedback_id,
        item.task,
        item.predicted_label,
        item.final_label ?? "",
        item.corrected_label ?? "",
        item.model_name,
        item.model_version,
        item.reviewer_name ?? "",
        item.reviewer_email ?? "",
        item.verdict,
        item.feedback_status,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !normalizedSearch || searchableText.includes(normalizedSearch);

      return (
        matchesTask &&
        matchesStatus &&
        matchesReadiness &&
        matchesVerdict &&
        matchesModel &&
        matchesReviewer &&
        matchesLabel &&
        matchesFrom &&
        matchesTo &&
        matchesSearch
      );
    })
    .sort((left, right) => {
      if (sortOption === "confidence-highest") {
        return right.confidence - left.confidence;
      }

      if (sortOption === "confidence-lowest") {
        return left.confidence - right.confidence;
      }

      if (sortOption === "label-ascending") {
        return (left.final_label ?? "").localeCompare(right.final_label ?? "");
      }

      if (sortOption === "label-descending") {
        return (right.final_label ?? "").localeCompare(left.final_label ?? "");
      }

      const leftDate = left.reviewed_at
        ? new Date(left.reviewed_at).getTime()
        : 0;

      const rightDate = right.reviewed_at
        ? new Date(right.reviewed_at).getTime()
        : 0;

      return sortOption === "reviewed-oldest"
        ? leftDate - rightDate
        : rightDate - leftDate;
    });

  const selectedItems = items.filter((item) =>
    selectedFeedbackIds.has(item.feedback_id),
  );

  const selectedReadyCount = selectedItems.filter(
    (item) => item.is_dataset_ready,
  ).length;

  const selectedLabels = Array.from(
    new Set(
      selectedItems
        .map((item) => item.final_label)
        .filter((label): label is string => Boolean(label)),
    ),
  ).sort();

  const selectedTasks = Array.from(
    new Set(selectedItems.map((item) => item.task)),
  ).sort();

  const selectedAverageConfidence =
    selectedItems.length > 0
      ? selectedItems.reduce((total, item) => total + item.confidence, 0) /
        selectedItems.length
      : null;

  const visibleSelectedCount = filteredItems.filter((item) =>
    selectedFeedbackIds.has(item.feedback_id),
  ).length;

  const allVisibleSelected =
    filteredItems.length > 0 && visibleSelectedCount === filteredItems.length;

  const previewItems =
    previewScope === "selection" ? selectedItems : filteredItems;

  const previewItem =
    items.find((item) => item.feedback_id === previewFeedbackId) ?? null;

  const previewIndex = previewFeedbackId
    ? previewItems.findIndex((item) => item.feedback_id === previewFeedbackId)
    : -1;

  const previousPreviewItem =
    previewIndex > 0 ? previewItems[previewIndex - 1] : null;

  const nextPreviewItem =
    previewIndex >= 0 && previewIndex < previewItems.length - 1
      ? previewItems[previewIndex + 1]
      : null;

  const filtersActive =
    searchValue.trim() !== "" ||
    taskFilter !== "all" ||
    statusFilter !== "all" ||
    readinessFilter !== "all" ||
    verdictFilter !== "all" ||
    modelFilter !== "all" ||
    reviewerFilter !== "all" ||
    labelFilter !== "all" ||
    reviewedFrom !== "" ||
    reviewedTo !== "" ||
    sortOption !== "reviewed-newest";

  function toggleItem(feedbackId: string) {
    setSelectedFeedbackIds((current) => {
      const next = new Set(current);

      if (next.has(feedbackId)) {
        next.delete(feedbackId);
      } else {
        next.add(feedbackId);
      }

      return next;
    });
  }

  function toggleVisibleItems() {
    setSelectedFeedbackIds((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        filteredItems.forEach((item) => {
          next.delete(item.feedback_id);
        });
      } else {
        filteredItems.forEach((item) => {
          next.add(item.feedback_id);
        });
      }

      return next;
    });
  }

  function clearSelection() {
    setSelectedFeedbackIds(new Set());

    if (previewScope === "selection") {
      setPreviewFeedbackId(null);
    }
  }

  function resetFilters() {
    setSearchValue("");
    setTaskFilter("all");
    setStatusFilter("all");
    setReadinessFilter("all");
    setVerdictFilter("all");
    setModelFilter("all");
    setReviewerFilter("all");
    setLabelFilter("all");
    setReviewedFrom("");
    setReviewedTo("");
    setSortOption("reviewed-newest");
  }

  return (
    <section className="space-y-5">
      <header className="gh-panel p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
              <Database className="size-6" />
            </div>

            <div>
              <h2 className="text-2xl font-bold">Dataset Builder</h2>

              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Filter, inspect, and select reviewed feedback for dataset
                preparation.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={datasetQuery.isFetching}
            onClick={() => {
              void datasetQuery.refetch();
            }}
          >
            <RefreshCw
              className={cn(
                "mr-2 size-4",
                datasetQuery.isFetching && "animate-spin",
              )}
            />
            Refresh
          </Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Selected samples"
          value={selectedItems.length}
          description={`${summary?.total_records ?? items.length} total records available`}
          icon={Database}
        />

        <SummaryCard
          label="Dataset ready"
          value={selectedReadyCount}
          description={`${summary?.dataset_ready ?? 0} dataset-ready records available`}
          icon={CheckCircle2}
        />

        <SummaryCard
          label="Selected classes"
          value={selectedLabels.length}
          description={
            selectedLabels.length > 0
              ? selectedLabels.map(formatWords).join(", ")
              : "Select samples to inspect their classes"
          }
          icon={Tags}
        />

        <SummaryCard
          label="Average confidence"
          value={formatPercentage(selectedAverageConfidence)}
          description={
            selectedItems.length > 0
              ? "Mean confidence of selected samples"
              : `All-record average: ${formatPercentage(
                  summary?.average_confidence,
                )}`
          }
          icon={Gauge}
        />
      </section>

      <DatasetBuilderFilters
        searchValue={searchValue}
        taskFilter={taskFilter}
        statusFilter={statusFilter}
        readinessFilter={readinessFilter}
        verdictFilter={verdictFilter}
        modelFilter={modelFilter}
        reviewerFilter={reviewerFilter}
        labelFilter={labelFilter}
        reviewedFrom={reviewedFrom}
        reviewedTo={reviewedTo}
        sortOption={sortOption}
        modelOptions={modelOptions}
        reviewerOptions={reviewerOptions}
        labelOptions={labelOptions}
        filtersActive={filtersActive}
        onSearchChange={setSearchValue}
        onTaskChange={setTaskFilter}
        onStatusChange={setStatusFilter}
        onReadinessChange={setReadinessFilter}
        onVerdictChange={setVerdictFilter}
        onModelChange={setModelFilter}
        onReviewerChange={setReviewerFilter}
        onLabelChange={setLabelFilter}
        onReviewedFromChange={setReviewedFrom}
        onReviewedToChange={setReviewedTo}
        onSortChange={setSortOption}
        onReset={resetFilters}
      />

      <DatasetSelectionSummary
        selectedCount={selectedItems.length}
        readyCount={selectedReadyCount}
        tasks={selectedTasks}
        labels={selectedLabels}
        averageConfidence={selectedAverageConfidence}
      />

      <DatasetSelectionToolbar
        selectedCount={selectedItems.length}
        readyCount={selectedReadyCount}
        onPreviewSelection={() => {
          const firstSelected = selectedItems[0];

          if (!firstSelected) {
            return;
          }

          setPreviewScope("selection");

          setPreviewFeedbackId(firstSelected.feedback_id);
        }}
        onExportSelection={() => {
          setExportDialogOpen(true);
        }}
        onClearSelection={clearSelection}
      />

      {items.length === 0 ? (
        <DatasetBuilderEmpty />
      ) : (
        <DatasetBuilderTable
          items={filteredItems}
          totalItems={items.length}
          selectedIds={selectedFeedbackIds}
          visibleSelectedCount={visibleSelectedCount}
          allVisibleSelected={allVisibleSelected}
          onToggleItem={toggleItem}
          onToggleVisible={toggleVisibleItems}
          onClearSelection={clearSelection}
          onPreview={(feedbackId) => {
            setPreviewScope("filtered");
            setPreviewFeedbackId(feedbackId);
          }}
        />
      )}

      <DatasetPreviewDrawer
        item={previewItem}
        currentPosition={previewIndex >= 0 ? previewIndex + 1 : 0}
        totalCount={previewItems.length}
        hasPrevious={previousPreviewItem !== null}
        hasNext={nextPreviewItem !== null}
        onPrevious={() => {
          if (previousPreviewItem) {
            setPreviewFeedbackId(previousPreviewItem.feedback_id);
          }
        }}
        onNext={() => {
          if (nextPreviewItem) {
            setPreviewFeedbackId(nextPreviewItem.feedback_id);
          }
        }}
        onClose={() => setPreviewFeedbackId(null)}
      />

      <DatasetExportHistory />

      <DatasetExportDialog
        key={
          exportDialogOpen
            ? "dataset-export-dialog-open"
            : "dataset-export-dialog-closed"
        }
        open={exportDialogOpen}
        selectedItems={selectedItems}
        onOpenChange={setExportDialogOpen}
      />
    </section>
  );
}

function DatasetBuilderFilters({
  searchValue,
  taskFilter,
  statusFilter,
  readinessFilter,
  verdictFilter,
  modelFilter,
  reviewerFilter,
  labelFilter,
  reviewedFrom,
  reviewedTo,
  sortOption,
  modelOptions,
  reviewerOptions,
  labelOptions,
  filtersActive,
  onSearchChange,
  onTaskChange,
  onStatusChange,
  onReadinessChange,
  onVerdictChange,
  onModelChange,
  onReviewerChange,
  onLabelChange,
  onReviewedFromChange,
  onReviewedToChange,
  onSortChange,
  onReset,
}: {
  searchValue: string;
  taskFilter: TaskFilter;
  statusFilter: StatusFilter;
  readinessFilter: ReadinessFilter;
  verdictFilter: VerdictFilter;
  modelFilter: string;
  reviewerFilter: string;
  labelFilter: string;
  reviewedFrom: string;
  reviewedTo: string;
  sortOption: SortOption;
  modelOptions: SelectOption[];
  reviewerOptions: SelectOption[];
  labelOptions: string[];
  filtersActive: boolean;
  onSearchChange: (value: string) => void;
  onTaskChange: (value: TaskFilter) => void;
  onStatusChange: (value: StatusFilter) => void;
  onReadinessChange: (value: ReadinessFilter) => void;
  onVerdictChange: (value: VerdictFilter) => void;
  onModelChange: (value: string) => void;
  onReviewerChange: (value: string) => void;
  onLabelChange: (value: string) => void;
  onReviewedFromChange: (value: string) => void;
  onReviewedToChange: (value: string) => void;
  onSortChange: (value: SortOption) => void;
  onReset: () => void;
}) {
  return (
    <section className="gh-panel p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
            <Filter className="size-5" />
          </div>

          <div>
            <h3 className="font-semibold">Dataset filters</h3>

            <p className="mt-1 text-sm text-muted-foreground">
              Narrow candidates by review evidence, model, label, and date.
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!filtersActive}
          onClick={onReset}
        >
          <X className="mr-2 size-4" />
          Reset filters
        </Button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search text, ID, model, reviewer, or label..."
            className="gh-input w-full !pl-10 outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <select
          value={taskFilter}
          onChange={(event) => onTaskChange(event.target.value as TaskFilter)}
          className="gh-input min-w-0"
        >
          <option value="all">All tasks</option>
          <option value="hate_speech">Hate speech</option>
          <option value="sentiment">Sentiment</option>
        </select>

        <select
          value={readinessFilter}
          onChange={(event) =>
            onReadinessChange(event.target.value as ReadinessFilter)
          }
          className="gh-input min-w-0"
        >
          <option value="all">All readiness states</option>
          <option value="ready">Dataset ready</option>
          <option value="not-ready">Needs review</option>
        </select>

        <select
          value={statusFilter}
          onChange={(event) =>
            onStatusChange(event.target.value as StatusFilter)
          }
          className="gh-input min-w-0"
        >
          <option value="all">All statuses</option>
          <option value="reviewed">Reviewed</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          value={verdictFilter}
          onChange={(event) =>
            onVerdictChange(event.target.value as VerdictFilter)
          }
          className="gh-input min-w-0"
        >
          <option value="all">All verdicts</option>
          <option value="correct">Correct</option>
          <option value="incorrect">Incorrect</option>
          <option value="unsure">Unsure</option>
        </select>

        <select
          value={modelFilter}
          onChange={(event) => onModelChange(event.target.value)}
          className="gh-input min-w-0"
        >
          <option value="all">All models</option>

          {modelOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={reviewerFilter}
          onChange={(event) => onReviewerChange(event.target.value)}
          className="gh-input min-w-0"
        >
          <option value="all">All reviewers</option>

          {reviewerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={labelFilter}
          onChange={(event) => onLabelChange(event.target.value)}
          className="gh-input min-w-0"
        >
          <option value="all">All final labels</option>

          {labelOptions.map((label) => (
            <option key={label} value={label}>
              {formatWords(label)}
            </option>
          ))}
        </select>

        <select
          value={sortOption}
          onChange={(event) => onSortChange(event.target.value as SortOption)}
          className="gh-input min-w-0"
        >
          <option value="reviewed-newest">Recently reviewed</option>
          <option value="reviewed-oldest">Oldest reviewed</option>
          <option value="confidence-highest">Highest confidence</option>
          <option value="confidence-lowest">Lowest confidence</option>
          <option value="label-ascending">Label A–Z</option>
          <option value="label-descending">Label Z–A</option>
        </select>

        <div>
          <label
            htmlFor="dataset-reviewed-from"
            className="text-xs text-muted-foreground"
          >
            Reviewed from
          </label>

          <input
            id="dataset-reviewed-from"
            type="date"
            value={reviewedFrom}
            onChange={(event) => onReviewedFromChange(event.target.value)}
            className="mt-2 gh-input w-full"
          />
        </div>

        <div>
          <label
            htmlFor="dataset-reviewed-to"
            className="text-xs text-muted-foreground"
          >
            Reviewed to
          </label>

          <input
            id="dataset-reviewed-to"
            type="date"
            value={reviewedTo}
            onChange={(event) => onReviewedToChange(event.target.value)}
            className="mt-2 gh-input w-full"
          />
        </div>
      </div>
    </section>
  );
}

function DatasetBuilderTable({
  items,
  totalItems,
  selectedIds,
  visibleSelectedCount,
  allVisibleSelected,
  onToggleItem,
  onToggleVisible,
  onClearSelection,
  onPreview,
}: {
  items: DatasetBuilderItem[];
  totalItems: number;
  selectedIds: Set<string>;
  visibleSelectedCount: number;
  allVisibleSelected: boolean;
  onToggleItem: (feedbackId: string) => void;
  onToggleVisible: () => void;
  onClearSelection: () => void;
  onPreview: (feedbackId: string) => void;
}) {
  return (
    <section className="overflow-hidden gh-panel">
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-semibold">Dataset candidates</h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Showing {items.length} of {totalItems} records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border px-3 py-1 text-xs font-medium">
            {selectedIds.size} selected
            {selectedIds.size > 0 && <> · {visibleSelectedCount} visible</>}
          </span>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={items.length === 0}
            onClick={onToggleVisible}
          >
            {allVisibleSelected ? "Deselect visible" : "Select visible"}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={selectedIds.size === 0}
            onClick={onClearSelection}
          >
            Clear selection
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="border-t p-10 text-center">
          <Search className="mx-auto size-9 text-muted-foreground" />

          <h4 className="mt-4 font-semibold">No matching candidates</h4>

          <p className="mt-2 text-sm text-muted-foreground">
            Change or reset the current filters to view more records.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border-t">
          <table className="gh-table w-full min-w-[1280px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="w-14 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    aria-label="Select visible dataset candidates"
                    onChange={onToggleVisible}
                    className="size-4 cursor-pointer"
                  />
                </th>

                <th className="px-4 py-3 font-medium">Prediction text</th>

                <th className="px-4 py-3 font-medium">Task</th>

                <th className="px-4 py-3 font-medium">Original label</th>

                <th className="px-4 py-3 font-medium">Final label</th>

                <th className="px-4 py-3 font-medium">Confidence</th>

                <th className="px-4 py-3 font-medium">Reviewer</th>

                <th className="px-4 py-3 font-medium">Model</th>

                <th className="px-4 py-3 font-medium">Reviewed</th>

                <th className="px-4 py-3 font-medium">Readiness</th>

                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => {
                const selected = selectedIds.has(item.feedback_id);

                return (
                  <tr
                    key={item.feedback_id}
                    className={cn(
                      "border-t align-top",
                      selected && "bg-blue-50/50 dark:bg-blue-950/10",
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        aria-label={`Select feedback ${item.feedback_id}`}
                        onChange={() => onToggleItem(item.feedback_id)}
                        className="size-4 cursor-pointer"
                      />
                    </td>

                    <td className="max-w-md px-4 py-3">
                      <p className="line-clamp-3 font-medium leading-6">
                        {getItemText(item)}
                      </p>

                      <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
                        {item.prediction_id}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <span className="rounded-full border px-2.5 py-1 text-xs">
                        {formatWords(item.task)}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {formatWords(item.predicted_label)}
                      </p>

                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatWords(item.verdict)}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {formatWords(item.final_label)}
                      </p>

                      {item.corrected_label && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Corrected: {formatWords(item.corrected_label)}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3 font-semibold">
                      {formatPercentage(item.confidence)}
                    </td>

                    <td className="max-w-xs px-4 py-3">
                      <p className="font-medium">
                        {item.reviewer_name ?? "Unknown reviewer"}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.reviewer_email ?? "No email"}
                      </p>
                    </td>

                    <td className="max-w-xs px-4 py-3">
                      <p className="font-medium">{item.model_name}</p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        v{item.model_version}
                      </p>
                    </td>

                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDateTime(item.reviewed_at)}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                          getReadinessClass(item.is_dataset_ready),
                        )}
                      >
                        {item.is_dataset_ready
                          ? "Dataset ready"
                          : "Needs review"}
                      </span>

                      {!item.is_dataset_ready &&
                        item.readiness_reasons.length > 0 && (
                          <p className="mt-2 max-w-xs text-xs text-muted-foreground">
                            {item.readiness_reasons.map(formatWords).join(", ")}
                          </p>
                        )}
                    </td>

                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={`Preview feedback ${item.feedback_id}`}
                        onClick={() => onPreview(item.feedback_id)}
                      >
                        <Eye className="mr-2 size-4" />
                        Preview
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DatasetPreviewDrawer({
  item,
  currentPosition,
  totalCount,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onClose,
}: {
  item: DatasetBuilderItem | null;
  currentPosition: number;
  totalCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  if (!item) {
    return null;
  }

  const probabilities = Object.entries(item.probabilities ?? {}).sort(
    (left, right) => right[1] - left[1],
  );

  return (
    <>
      <button
        type="button"
        aria-label="Close dataset sample preview"
        className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Dataset sample preview"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l bg-background shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-background/95 p-5 backdrop-blur sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              Dataset evidence
            </p>

            <h2 className="mt-1 text-xl font-semibold">Dataset Sample Preview</h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Inspect the complete prediction and human-review evidence before
              export.
            </p>
          </div>

          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Close preview drawer"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </header>

        <nav
          aria-label="Dataset sample preview navigation"
          className="sticky top-[121px] z-[9] flex items-center justify-between gap-3 border-b bg-background/95 px-5 py-3 backdrop-blur sm:px-6"
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!hasPrevious}
            aria-label="Previous dataset sample"
            onClick={onPrevious}
          >
            <ChevronLeft className="mr-1 size-4" />
            Previous
          </Button>

          <span className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            {currentPosition > 0
              ? `${currentPosition} of ${totalCount}`
              : `0 of ${totalCount}`}
          </span>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!hasNext}
            aria-label="Next dataset sample"
            onClick={onNext}
          >
            Next
            <ChevronRight className="ml-1 size-4" />
          </Button>
        </nav>

        <div className="space-y-5 p-4">
          <section className="rounded-lg border p-5">
            <p className="text-xs font-medium text-muted-foreground">
              Original prediction text
            </p>

            <p className="mt-3 whitespace-pre-wrap text-lg leading-8">
              {item.text ?? "Original text was not stored."}
            </p>
          </section>

          <section className="rounded-lg border p-5">
            <p className="text-xs font-medium text-muted-foreground">
              Normalized text
            </p>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
              {item.normalized_text ?? "Normalized text is unavailable."}
            </p>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <PreviewValue label="Task" value={formatWords(item.task)} />

            <PreviewValue
              label="Feedback status"
              value={formatWords(item.feedback_status)}
            />

            <PreviewValue
              label="Predicted label"
              value={formatWords(item.predicted_label)}
            />

            <PreviewValue
              label="Corrected label"
              value={formatWords(item.corrected_label)}
            />

            <PreviewValue
              label="Final label"
              value={formatWords(item.final_label)}
            />

            <PreviewValue label="Verdict" value={formatWords(item.verdict)} />

            <PreviewValue
              label="Confidence"
              value={formatPercentage(item.confidence)}
            />

            <PreviewValue
              label="Readiness"
              value={item.is_dataset_ready ? "Dataset Ready" : "Needs Review"}
            />
          </section>

          {!item.is_dataset_ready && item.readiness_reasons.length > 0 && (
            <section className="rounded-lg border border-amber-300 bg-amber-50 p-5 dark:bg-amber-950/20">
              <div className="flex items-center gap-2">
                <XCircle className="size-5 text-amber-700 dark:text-amber-300" />

                <h3 className="font-semibold">Readiness issues</h3>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {item.readiness_reasons.map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full border border-amber-300 bg-background/60 px-2.5 py-1 text-xs text-amber-800 dark:text-amber-300"
                  >
                    {formatWords(reason)}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-lg border p-5">
            <h3 className="font-semibold">Human review evidence</h3>

            <dl className="mt-4 grid gap-5 sm:grid-cols-2">
              <PreviewRow
                label="Reviewer"
                value={item.reviewer_name ?? "Unknown reviewer"}
              />

              <PreviewRow
                label="Reviewer email"
                value={item.reviewer_email ?? "—"}
              />

              <PreviewRow
                label="User comment"
                value={item.user_comment ?? "No user comment"}
              />

              <PreviewRow
                label="Reviewer note"
                value={item.reviewer_note ?? "No reviewer note"}
              />

              <PreviewRow
                label="Feedback created"
                value={formatDateTime(item.feedback_created_at)}
              />

              <PreviewRow
                label="Reviewed"
                value={formatDateTime(item.reviewed_at)}
              />
            </dl>
          </section>

          <section className="rounded-lg border p-5">
            <div className="flex items-center gap-2">
              <Layers3 className="size-5 text-blue-700 dark:text-blue-300" />

              <h3 className="font-semibold">Model probabilities</h3>
            </div>

            {probabilities.length > 0 ? (
              <div className="mt-4 space-y-3">
                {probabilities.map(([label, probability]) => {
                  const percentage =
                    probability <= 1 ? probability * 100 : probability;

                  return (
                    <div key={label} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm font-medium">
                          {formatWords(label)}
                        </span>

                        <span className="text-sm font-semibold">
                          {formatPercentage(probability)}
                        </span>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-blue-600"
                          style={{
                            width: `${Math.max(0, Math.min(100, percentage))}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Probability values are unavailable for this prediction.
              </p>
            )}
          </section>

          <section className="rounded-lg border bg-muted/20 p-5">
            <h3 className="font-semibold">Model and record metadata</h3>

            <dl className="mt-4 grid gap-5 sm:grid-cols-2">
              <PreviewRow label="Model" value={item.model_name} />

              <PreviewRow label="Model version" value={item.model_version} />

              <PreviewRow
                label="Prediction created"
                value={formatDateTime(item.prediction_created_at)}
              />

              <PreviewRow label="Feedback ID" value={item.feedback_id} mono />

              <PreviewRow
                label="Prediction ID"
                value={item.prediction_id}
                mono
              />

              <PreviewRow
                label="Model version ID"
                value={item.model_version_id}
                mono
              />
            </dl>
          </section>
        </div>
      </aside>
    </>
  );
}

function PreviewValue({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>

      <p className="mt-2 break-words font-semibold">{value}</p>
    </article>
  );
}

function PreviewRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>

      <dd
        className={cn(
          "mt-1 whitespace-pre-wrap break-words text-sm font-medium",
          mono && "break-all font-mono text-xs",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function DatasetSelectionToolbar({
  selectedCount,
  readyCount,
  onPreviewSelection,
  onExportSelection,
  onClearSelection,
}: {
  selectedCount: number;
  readyCount: number;
  onPreviewSelection: () => void;
  onExportSelection: () => void;
  onClearSelection: () => void;
}) {
  if (selectedCount === 0) {
    return null;
  }

  const needsReviewCount = selectedCount - readyCount;

  return (
    <section className="flex flex-col gap-4 gh-panel p-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-sm font-semibold">Selection actions</p>

        <p className="mt-1 text-sm text-muted-foreground">
          {selectedCount} selected
          {" · "}
          {readyCount} dataset ready
          {needsReviewCount > 0 ? ` · ${needsReviewCount} need review` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={onPreviewSelection}>
          <Eye className="mr-2 size-4" />
          Preview Selection
        </Button>

        <Button
          type="button"
          disabled={readyCount === 0}
          title={
            readyCount === 0
              ? "Select at least one dataset-ready record"
              : "Create and download a dataset export"
          }
          onClick={onExportSelection}
        >
          <Download className="mr-2 size-4" />
          Export Selected
        </Button>

        <Button type="button" variant="ghost" onClick={onClearSelection}>
          <X className="mr-2 size-4" />
          Clear Selection
        </Button>
      </div>
    </section>
  );
}

function DatasetSelectionSummary({
  selectedCount,
  readyCount,
  tasks,
  labels,
  averageConfidence,
}: {
  selectedCount: number;
  readyCount: number;
  tasks: string[];
  labels: string[];
  averageConfidence: number | null;
}) {
  if (selectedCount === 0) {
    return (
      <section className="rounded-xl border border-dashed bg-muted/10 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-lg bg-muted text-primary">
            <Database className="size-6" />
          </div>

          <h3 className="mt-4 text-lg font-semibold">
            No dataset samples selected
          </h3>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Select one or more reviewed records to inspect the dataset
            composition and prepare the samples for export.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-gradient-to-br from-blue-50 via-background to-emerald-50 p-5 dark:from-blue-950/20 dark:via-background dark:to-emerald-950/20 sm:p-6">
      <div>
        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
          Current dataset composition
        </p>

        <h3 className="mt-1 text-xl font-semibold">Dataset Selection Summary</h3>

        <p className="mt-2 text-sm text-muted-foreground">
          Statistics calculated from the currently selected samples.
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SelectionSummaryValue
          label="Selected samples"
          value={String(selectedCount)}
          description="Records included in the current selection"
          icon={Database}
        />

        <SelectionSummaryValue
          label="Dataset ready"
          value={String(readyCount)}
          description={
            readyCount === selectedCount
              ? "All selected samples are ready"
              : `${selectedCount - readyCount} selected samples need review`
          }
          icon={CheckCircle2}
        />

        <SelectionSummaryValue
          label="Tasks"
          value={String(tasks.length)}
          description={
            tasks.length > 0
              ? tasks.map(formatWords).join(", ")
              : "No tasks selected"
          }
          icon={Filter}
        />

        <SelectionSummaryValue
          label="Classes"
          value={String(labels.length)}
          description={
            labels.length > 0
              ? labels.map(formatWords).join(", ")
              : "No final labels selected"
          }
          icon={Tags}
        />

        <SelectionSummaryValue
          label="Average confidence"
          value={formatPercentage(averageConfidence)}
          description="Mean confidence across selected samples"
          icon={Gauge}
        />
      </div>
    </section>
  );
}

function SelectionSummaryValue({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: typeof Database;
}) {
  return (
    <article className="rounded-lg border bg-background/80 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>

          <p className="mt-2 text-2xl font-bold">{value}</p>
        </div>

        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
          <Icon className="size-4" />
        </div>
      </div>

      <p className="mt-3 break-words text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </article>
  );
}

function DatasetBuilderLoading() {
  return (
    <section className="space-y-5">
      <div className="h-36 animate-pulse rounded-xl border bg-muted/30" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({
          length: 4,
        }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-xl border bg-muted/30"
          />
        ))}
      </div>

      <div className="h-56 animate-pulse rounded-xl border bg-muted/30" />

      <div className="h-96 animate-pulse rounded-xl border bg-muted/30" />
    </section>
  );
}

function DatasetBuilderError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="gh-panel p-8">
      <div className="flex size-12 items-center justify-center rounded-lg bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300">
        <AlertCircle className="size-6" />
      </div>

      <h2 className="mt-5 text-xl font-semibold">Dataset Builder could not load</h2>

      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{message}</p>

      <Button type="button" className="mt-6" onClick={onRetry}>
        <RefreshCw className="mr-2 size-4" />
        Try again
      </Button>
    </section>
  );
}

function DatasetBuilderEmpty() {
  return (
    <section className="gh-panel p-10 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-lg bg-muted">
        <Database className="size-7 text-muted-foreground" />
      </div>

      <h3 className="mt-5 text-lg font-semibold">
        No dataset candidates found
      </h3>

      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        Dataset candidates will appear after feedback has been reviewed by a
        researcher or administrator.
      </p>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  description: string;
  icon: typeof Database;
}) {
  return (
    <article className="gh-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>

          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>

        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
          <Icon className="size-5" />
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </article>
  );
}
