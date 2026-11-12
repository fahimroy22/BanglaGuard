"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowDownUp,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Filter,
  MessageSquareText,
  Search,
  ShieldCheck,
  RefreshCw,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { ActiveLearningQueue } from "@/components/feedback/active-learning-queue";

import { DatasetBuilder } from "@/components/feedback/dataset-builder";
import { FeedbackReviewQueue } from "@/components/feedback/feedback-review-queue";
import { FeedbackSubmissionForm } from "@/components/feedback/feedback-submission-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/api";
import { listMyFeedback } from "@/lib/feedback";
import { listModelVersions, listPredictions } from "@/lib/predictions";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

import type { FeedbackRead, FeedbackStatus } from "@/types/feedback";
import type {
  AnalysisTask,
  ModelVersionRead,
  PredictionRead,
} from "@/types/prediction";

type FeedbackWorkspaceTab =
  "my-feedback" | "research-review" | "active-learning" | "dataset-builder";

type TaskFilter = "all" | AnalysisTask;

type ReviewFilter = "all" | "unreviewed" | FeedbackStatus;

type ModelFilter = "all" | string;

type SortOption =
  "newest" | "oldest" | "highest_confidence" | "lowest_confidence";

type FeedbackWorkspaceItem = {
  prediction: PredictionRead;
  model: ModelVersionRead | null;
  feedback: FeedbackRead | null;
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

function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  const normalized = value <= 1 ? value * 100 : value;

  return `${normalized.toFixed(1)}%`;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function getTextPreview(prediction: PredictionRead): string {
  return (
    prediction.input_text ??
    prediction.normalized_text ??
    "Prediction text was not stored."
  );
}

function getStatusLabel(feedback: FeedbackRead | null): string {
  if (!feedback) {
    return "Unreviewed";
  }

  return formatWords(feedback.status);
}

function getStatusBadgeClass(feedback: FeedbackRead | null): string {
  if (!feedback) {
    return (
      "border-slate-300 bg-slate-50 " +
      "text-slate-700 dark:bg-slate-950/40 " +
      "dark:text-slate-300"
    );
  }

  if (feedback.status === "pending") {
    return (
      "border-amber-300 bg-amber-50 " +
      "text-amber-700 dark:bg-amber-950/40 " +
      "dark:text-amber-300"
    );
  }

  if (feedback.status === "reviewed") {
    return (
      "border-emerald-300 bg-emerald-50 " +
      "text-emerald-700 dark:bg-emerald-950/40 " +
      "dark:text-emerald-300"
    );
  }

  return (
    "border-red-300 bg-red-50 " +
    "text-red-700 dark:bg-red-950/40 " +
    "dark:text-red-300"
  );
}

export function FeedbackWorkspace() {
  const currentUser = useAuthStore((state) => state.user);

  const canReviewFeedback =
    currentUser?.role === "researcher" || currentUser?.role === "admin";

  const [activeTab, setActiveTab] =
    useState<FeedbackWorkspaceTab>("my-feedback");

  const [searchValue, setSearchValue] = useState("");

  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");

  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");

  const [modelFilter, setModelFilter] = useState<ModelFilter>("all");

  const [sortOption, setSortOption] = useState<SortOption>("newest");

  const [selectedPredictionId, setSelectedPredictionId] = useState<
    string | null
  >(null);

  const predictionsQuery = useQuery({
    queryKey: ["feedback-predictions"],
    queryFn: () => listPredictions(100, 0),
  });

  const modelsQuery = useQuery({
    queryKey: ["feedback-model-versions"],
    queryFn: listModelVersions,
  });

  const feedbackQuery = useQuery({
    queryKey: ["my-feedback"],
    queryFn: () => listMyFeedback(100, 0),
  });

  const isLoading =
    predictionsQuery.isLoading ||
    modelsQuery.isLoading ||
    feedbackQuery.isLoading;

  const error =
    predictionsQuery.error ?? modelsQuery.error ?? feedbackQuery.error;

  const workspaceItems = useMemo<FeedbackWorkspaceItem[]>(() => {
    const predictions = predictionsQuery.data ?? [];

    const models = modelsQuery.data ?? [];

    const feedback = feedbackQuery.data ?? [];

    const modelMap = new Map(models.map((model) => [model.id, model]));

    const feedbackMap = new Map(
      feedback.map((item) => [item.prediction_id, item]),
    );

    return predictions.map((prediction) => ({
      prediction,
      model: modelMap.get(prediction.model_version_id) ?? null,
      feedback: feedbackMap.get(prediction.id) ?? null,
    }));
  }, [predictionsQuery.data, modelsQuery.data, feedbackQuery.data]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    const result = workspaceItems.filter((item) => {
      const text = getTextPreview(item.prediction).toLowerCase();

      const modelName = item.model?.name.toLowerCase() ?? "";

      const matchesSearch =
        !normalizedSearch ||
        text.includes(normalizedSearch) ||
        item.prediction.id.toLowerCase().includes(normalizedSearch) ||
        modelName.includes(normalizedSearch);

      const matchesTask =
        taskFilter === "all" || item.prediction.task === taskFilter;

      const matchesModel =
        modelFilter === "all" ||
        item.prediction.model_version_id === modelFilter;

      let matchesReview = true;

      if (reviewFilter === "unreviewed") {
        matchesReview = item.feedback === null;
      } else if (reviewFilter !== "all") {
        matchesReview = item.feedback?.status === reviewFilter;
      }

      return matchesSearch && matchesTask && matchesModel && matchesReview;
    });

    return [...result].sort((left, right) => {
      if (sortOption === "highest_confidence") {
        return right.prediction.confidence - left.prediction.confidence;
      }

      if (sortOption === "lowest_confidence") {
        return left.prediction.confidence - right.prediction.confidence;
      }

      const leftDate = new Date(left.prediction.created_at).getTime();

      const rightDate = new Date(right.prediction.created_at).getTime();

      return sortOption === "oldest"
        ? leftDate - rightDate
        : rightDate - leftDate;
    });
  }, [
    workspaceItems,
    searchValue,
    taskFilter,
    reviewFilter,
    modelFilter,
    sortOption,
  ]);

  const selectedItem =
    workspaceItems.find(
      (item) => item.prediction.id === selectedPredictionId,
    ) ?? null;

  const submittedCount = workspaceItems.filter((item) => item.feedback).length;

  const pendingCount = workspaceItems.filter(
    (item) => item.feedback?.status === "pending",
  ).length;

  const reviewedCount = workspaceItems.filter(
    (item) => item.feedback?.status === "reviewed",
  ).length;

  const correctCount = workspaceItems.filter(
    (item) => item.feedback?.verdict === "correct",
  ).length;

  const decidedCount = workspaceItems.filter(
    (item) =>
      item.feedback?.verdict === "correct" ||
      item.feedback?.verdict === "incorrect",
  ).length;

  const agreementRate =
    decidedCount > 0 ? (correctCount / decidedCount) * 100 : null;

  if (isLoading) {
    return <FeedbackLoading />;
  }

  if (error) {
    return (
      <main className="p-4 sm:p-6 lg:p-8">
        <section className="mx-auto max-w-4xl gh-panel p-6 sm:p-10">
          <div className="flex size-12 items-center justify-center rounded-lg bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="size-6" />
          </div>

          <h1 className="mt-6 text-2xl font-semibold">Feedback could not load</h1>

          <p className="mt-3 text-muted-foreground">
            {getApiErrorMessage(
              error,
              "Unable to load the feedback workspace.",
            )}
          </p>

          <Button
            className="mt-6"
            onClick={() => {
              void Promise.all([
                predictionsQuery.refetch(),
                modelsQuery.refetch(),
                feedbackQuery.refetch(),
              ]);
            }}
          >
            Try again
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 lg:px-6">
      <FeedbackHeader role={currentUser?.role ?? "user"} isRefreshing={predictionsQuery.isFetching || modelsQuery.isFetching || feedbackQuery.isFetching} onRefresh={() => { void predictionsQuery.refetch(); void modelsQuery.refetch(); void feedbackQuery.refetch(); }} />

      {canReviewFeedback && <Link href="/research-projects" className="flex items-center justify-between rounded-xl border bg-card p-4 text-sm"><span><strong>Close the research loop</strong><br/>Assign reviewers, resolve disagreements and trace corrections into dataset versions.</span><span>Research projects →</span></Link>}

      <FeedbackWorkspaceTabs
        activeTab={activeTab}
        canReviewFeedback={canReviewFeedback}
        onTabChange={setActiveTab}
      />

      {activeTab === "research-review" && canReviewFeedback ? (
        <FeedbackReviewQueue />
      ) : activeTab === "active-learning" && canReviewFeedback ? (
        <ActiveLearningQueue />
      ) : activeTab === "dataset-builder" && canReviewFeedback ? (
        <DatasetBuilder />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FeedbackStatCard
              label="Reviewable predictions"
              value={workspaceItems.length}
              description="Up to 100 recent predictions loaded"
              icon={MessageSquareText}
            />

            <FeedbackStatCard
              label="Unreviewed"
              value={workspaceItems.length - submittedCount}
              description="Predictions awaiting your feedback"
              icon={Clock3}
            />

            <FeedbackStatCard
              label="Submitted feedback"
              value={submittedCount}
              description={`${pendingCount} pending · ${reviewedCount} reviewed`}
              icon={ClipboardCheck}
            />

            <FeedbackStatCard
              label="Agreement rate"
              value={
                agreementRate === null ? "—" : formatPercentage(agreementRate)
              }
              description="Correct verdicts among decided feedback"
              icon={ShieldCheck}
            />
          </section>

          <FeedbackFilters
            searchValue={searchValue}
            taskFilter={taskFilter}
            reviewFilter={reviewFilter}
            modelFilter={modelFilter}
            sortOption={sortOption}
            models={modelsQuery.data ?? []}
            onSearchChange={setSearchValue}
            onTaskChange={setTaskFilter}
            onReviewChange={setReviewFilter}
            onModelChange={setModelFilter}
            onSortChange={setSortOption}
          />

          <FeedbackQueue
            items={filteredItems}
            totalItems={workspaceItems.length}
            onReview={(predictionId) => setSelectedPredictionId(predictionId)}
          />

          <FeedbackReviewDrawer
            item={selectedItem}
            onFeedbackSubmitted={async () => {
              await feedbackQuery.refetch();
            }}
            onClose={() => setSelectedPredictionId(null)}
          />
        </>
      )}
    </main>
  );
}

function FeedbackWorkspaceTabs({ activeTab, canReviewFeedback, onTabChange }: { activeTab: FeedbackWorkspaceTab; canReviewFeedback: boolean; onTabChange: (tab: FeedbackWorkspaceTab) => void }) {
  const tabs: { key: FeedbackWorkspaceTab; label: string }[] = [{ key: "my-feedback", label: "My feedback" }, ...(canReviewFeedback ? [{ key: "research-review" as const, label: "Research review" }, { key: "active-learning" as const, label: "Active learning" }, { key: "dataset-builder" as const, label: "Dataset builder" }] : [])];
  return <nav aria-label="Feedback sections" className="flex gap-2 overflow-x-auto border-b pb-3">{tabs.map(tab => <button key={tab.key} type="button" aria-pressed={activeTab === tab.key} className={`gh-button whitespace-nowrap ${activeTab === tab.key ? "gh-button-primary" : ""}`} onClick={() => onTabChange(tab.key)}>{tab.label}</button>)}</nav>;
}

function FeedbackHeader({ role, isRefreshing, onRefresh }: { role: string; isRefreshing: boolean; onRefresh: () => void }) {
  return <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
    <div><h1 className="text-2xl font-semibold tracking-tight">Feedback</h1><p className="mt-1 text-sm text-muted-foreground">Review predictions, record corrections and prepare feedback for future training.</p></div>
    <div className="flex items-center gap-3"><Badge variant="outline">{formatWords(role)} access</Badge><button type="button" className="gh-button" disabled={isRefreshing} onClick={onRefresh}><RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />Refresh history</button></div>
  </header>;
}

function FeedbackStatCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  description: string;
  icon: typeof Clock3;
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

      <p className="mt-4 text-xs text-muted-foreground">{description}</p>
    </article>
  );
}

function FeedbackFilters({
  searchValue,
  taskFilter,
  reviewFilter,
  modelFilter,
  sortOption,
  models,
  onSearchChange,
  onTaskChange,
  onReviewChange,
  onModelChange,
  onSortChange,
}: {
  searchValue: string;
  taskFilter: TaskFilter;
  reviewFilter: ReviewFilter;
  modelFilter: ModelFilter;
  sortOption: SortOption;
  models: ModelVersionRead[];
  onSearchChange: (value: string) => void;
  onTaskChange: (value: TaskFilter) => void;
  onReviewChange: (value: ReviewFilter) => void;
  onModelChange: (value: ModelFilter) => void;
  onSortChange: (value: SortOption) => void;
}) {
  return (
    <section className="gh-panel p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
          <Filter className="size-5" />
        </div>

        <div>
          <h2 className="font-semibold">Search and filters</h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Narrow the review queue by text, task, model, and status.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <input
            aria-label="Search predictions"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search Bangla text, prediction ID, or model..."
            className="gh-input w-full !pl-10"
          />
        </div>

        <select
          aria-label="Analysis task"
          value={taskFilter}
          onChange={(event) => onTaskChange(event.target.value as TaskFilter)}
          className="gh-input min-w-0"
        >
          <option value="all">All tasks</option>

          <option value="hate_speech">Hate speech</option>

          <option value="sentiment">Sentiment</option>
        </select>

        <select
          aria-label="Review status"
          value={reviewFilter}
          onChange={(event) =>
            onReviewChange(event.target.value as ReviewFilter)
          }
          className="gh-input min-w-0"
        >
          <option value="all">All review states</option>

          <option value="unreviewed">Unreviewed</option>

          <option value="pending">Pending</option>

          <option value="reviewed">Reviewed</option>

          <option value="rejected">Rejected</option>
        </select>

        <select
          aria-label="Sort predictions"
          value={sortOption}
          onChange={(event) => onSortChange(event.target.value as SortOption)}
          className="gh-input min-w-0"
        >
          <option value="newest">Newest first</option>

          <option value="oldest">Oldest first</option>

          <option value="highest_confidence">Highest confidence</option>

          <option value="lowest_confidence">Lowest confidence</option>
        </select>
      </div>

      <div className="mt-4">
        <label
          htmlFor="feedback-model-filter"
          className="text-xs font-medium text-muted-foreground"
        >
          Model
        </label>

        <select
          id="feedback-model-filter"
          value={modelFilter}
          onChange={(event) => onModelChange(event.target.value)}
          className="mt-2 gh-input w-full lg:max-w-md"
        >
          <option value="all">All models</option>

          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} v{model.version}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

function FeedbackQueue({
  items,
  totalItems,
  onReview,
}: {
  items: FeedbackWorkspaceItem[];
  totalItems: number;
  onReview: (predictionId: string) => void;
}) {
  return (
    <section className="overflow-hidden gh-panel">
      <div className="flex flex-col gap-3 bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Prediction review queue</h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Showing {items.length} of {totalItems} predictions.
          </p>
        </div>

        <Badge variant="outline">
          <ArrowDownUp className="mr-1 size-3" />
          Live API data
        </Badge>
      </div>

      {items.length > 0 ? (
        <div className="overflow-x-auto border-t">
          <table className="gh-table w-full min-w-[1050px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Prediction text</th>

                <th className="px-4 py-3 font-medium">Model</th>

                <th className="px-4 py-3 font-medium">Output</th>

                <th className="px-4 py-3 font-medium">Confidence</th>

                <th className="px-4 py-3 font-medium">Date</th>

                <th className="px-4 py-3 font-medium">Review status</th>

                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => (
                <tr key={item.prediction.id} className="border-t align-top">
                  <td className="max-w-sm px-4 py-3">
                    <p className="line-clamp-2 font-medium">
                      {getTextPreview(item.prediction)}
                    </p>

                    <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                      {item.prediction.id}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {item.model?.name ?? "Unknown model"}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.model
                        ? `v${item.model.version}`
                        : "Model metadata unavailable"}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <Badge variant="secondary">
                      {formatWords(item.prediction.predicted_label)}
                    </Badge>

                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatWords(item.prediction.task)}
                    </p>
                  </td>

                  <td className="px-4 py-3 font-semibold">
                    {formatPercentage(item.prediction.confidence)}
                  </td>

                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDateTime(item.prediction.created_at)}
                  </td>

                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={cn(getStatusBadgeClass(item.feedback))}
                    >
                      {getStatusLabel(item.feedback)}
                    </Badge>
                  </td>

                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant={item.feedback ? "outline" : "default"}
                      onClick={() => onReview(item.prediction.id)}
                    >
                      {item.feedback ? "View" : "Review"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-t p-6">
          <div className="rounded-lg border border-dashed p-8 text-center">
            <MessageSquareText className="mx-auto size-8 text-muted-foreground" />

            <h3 className="mt-4 font-semibold">No matching predictions</h3>

            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Run predictions or change the current search and filters to
              populate the review queue.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function FeedbackReviewDrawer({
  item,
  onFeedbackSubmitted,
  onClose,
}: {
  item: FeedbackWorkspaceItem | null;
  onFeedbackSubmitted: () => Promise<void> | void;
  onClose: () => void;
}) {
  if (!item) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close review panel"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40"
      />

      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur">
          <div>
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Prediction review
            </p>

            <h2 className="mt-1 text-xl font-semibold">Feedback evidence</h2>
          </div>

          <Button aria-label="Close feedback evidence" size="icon" variant="outline" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-6 p-4">
          <section className="rounded-lg border p-5">
            <p className="text-xs font-medium text-muted-foreground">
              Original Bangla text
            </p>

            <p className="mt-3 text-lg leading-8">
              {getTextPreview(item.prediction)}
            </p>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <ReviewDetail
              label="Predicted label"
              value={formatWords(item.prediction.predicted_label)}
            />

            <ReviewDetail
              label="Confidence"
              value={formatPercentage(item.prediction.confidence)}
            />

            <ReviewDetail
              label="Task"
              value={formatWords(item.prediction.task)}
            />

            <ReviewDetail
              label="Model"
              value={item.model?.name ?? "Unknown model"}
            />
          </section>

          {item.feedback ? (
            <section className="rounded-lg border p-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-600" />

                <h3 className="font-semibold">Submitted feedback</h3>
              </div>

              <dl className="mt-5 space-y-4">
                <ReviewDetailRow
                  label="Verdict"
                  value={formatWords(item.feedback.verdict)}
                />

                <ReviewDetailRow
                  label="Status"
                  value={formatWords(item.feedback.status)}
                />

                <ReviewDetailRow
                  label="Corrected label"
                  value={item.feedback.corrected_label ?? "—"}
                />

                <ReviewDetailRow
                  label="Comment"
                  value={item.feedback.comment ?? "—"}
                />

                <ReviewDetailRow
                  label="Reviewer note"
                  value={item.feedback.reviewer_note ?? "—"}
                />
              </dl>
            </section>
          ) : (
            <FeedbackSubmissionForm
              key={item.prediction.id}
              prediction={item.prediction}
              onSubmitted={async () => {
                await onFeedbackSubmitted();
              }}
            />
          )}
        </div>
      </aside>
    </>
  );
}

function ReviewDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>

      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}

function ReviewDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>

      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function FeedbackLoading() {
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 lg:px-6">
      <div className="h-24 animate-pulse rounded-xl border bg-muted/40" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({
          length: 4,
        }).map((_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-xl border bg-muted/40"
          />
        ))}
      </div>

      <div className="h-48 animate-pulse rounded-xl border bg-muted/40" />

      <div className="h-96 animate-pulse rounded-xl border bg-muted/40" />
    </main>
  );
}
