"use client";

import {
  Activity,
  AlertCircle,
  BarChart3,
  BrainCircuit,
  Clock3,
  Download,
  Gauge,
  MessageSquareText,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";
import {
  useQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  downloadModelComparisonCsv,
  getAnalyticsDashboard,
  getModelComparison,
} from "@/lib/analytics";
import {
  getApiErrorMessage,
} from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

import type {
  DailyPredictionItem,
  LabelDistributionItem,
  ModelComparisonItem,
  ModelUsageItem,
} from "@/types/analytics";

type DateRangeOption =
  | "all"
  | "7"
  | "30"
  | "90";

type TaskOption =
  | "all"
  | "hate_speech"
  | "sentiment";

function formatNumber(
  value: number | null | undefined,
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US",
  ).format(value);
}

function normalizePercentage(
  value: number | null | undefined,
): number | null {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  const normalized =
    value <= 1
      ? value * 100
      : value;

  return Math.max(
    0,
    Math.min(100, normalized),
  );
}

function formatPercentage(
  value: number | null | undefined,
): string {
  const normalized =
    normalizePercentage(value);

  if (normalized === null) {
    return "—";
  }

  return `${normalized.toFixed(1)}%`;
}

function formatLatency(
  value: number | null | undefined,
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(
      2,
    )} s`;
  }

  return `${value.toFixed(1)} ms`;
}

function formatWords(
  value: string,
): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function formatDate(
  value: string,
): string {
  const parsed = new Date(value);

  if (
    Number.isNaN(parsed.getTime())
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
    },
  ).format(parsed);
}

function getDailyCount(
  item: DailyPredictionItem,
): number {
  return (
    item.total_predictions ??
    item.prediction_count ??
    0
  );
}

function getFeedbackTotal(
  feedback: {
    total_feedback?: number;
    feedback_count?: number;
  },
): number {
  return (
    feedback.total_feedback ??
    feedback.feedback_count ??
    0
  );
}

function getFeedbackAccuracy(
  feedback: {
    observed_feedback_accuracy?:
      | number
      | null;
    observed_accuracy?:
      | number
      | null;
  },
): number | null {
  return (
    feedback
      .observed_feedback_accuracy ??
    feedback.observed_accuracy ??
    null
  );
}

function getDateFilters(
  option: DateRangeOption,
): {
  startAt: string | null;
  endAt: string | null;
} {
  if (option === "all") {
    return {
      startAt: null,
      endAt: null,
    };
  }

  const end = new Date();
  const start = new Date();

  start.setDate(
    end.getDate() -
      Number(option) +
      1,
  );

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

function isForbiddenError(
  error: unknown,
): boolean {
  if (
    typeof error !== "object" ||
    error === null
  ) {
    return false;
  }

  if (
    "response" in error &&
    typeof error.response ===
      "object" &&
    error.response !== null &&
    "status" in error.response
  ) {
    return (
      error.response.status === 403
    );
  }

  return false;
}

export function AnalyticsDashboard() {
  const currentUser = useAuthStore(
    (state) => state.user,
  );

  const [dateRange, setDateRange] =
    useState<DateRangeOption>("30");

  const [task, setTask] =
    useState<TaskOption>("all");

  const [isExporting, setIsExporting] =
    useState(false);

  const dateFilters = useMemo(
    () => getDateFilters(dateRange),
    [dateRange],
  );

  const dashboardQuery = useQuery({
    queryKey: [
      "analytics-dashboard",
      dateRange,
      task,
    ],

    queryFn: () =>
      getAnalyticsDashboard({
        startAt:
          dateFilters.startAt,
        endAt: dateFilters.endAt,
        task:
          task === "all"
            ? null
            : task,
        dailyLimit:
          dateRange === "7"
            ? 7
            : dateRange === "90"
              ? 90
              : 30,
      }),

    retry: (failureCount, error) => {
      if (isForbiddenError(error)) {
        return false;
      }

      return failureCount < 2;
    },
  });

  const comparisonQuery = useQuery({
    queryKey: [
      "analytics-model-comparison",
    ],
    queryFn: getModelComparison,

    retry: (failureCount, error) => {
      if (isForbiddenError(error)) {
        return false;
      }

      return failureCount < 2;
    },
  });

  const isForbidden =
    isForbiddenError(
      dashboardQuery.error,
    ) ||
    isForbiddenError(
      comparisonQuery.error,
    );

  async function handleRefresh() {
    await Promise.all([
      dashboardQuery.refetch(),
      comparisonQuery.refetch(),
    ]);

    toast.success(
      "Analytics refreshed.",
    );
  }

  async function handleExport() {
    setIsExporting(true);

    try {
      await downloadModelComparisonCsv();

      toast.success(
        "Model comparison exported.",
        {
          description:
            "The CSV report has been downloaded.",
        },
      );
    } catch (error) {
      toast.error(
        "Export failed.",
        {
          description:
            getApiErrorMessage(
              error,
              "Unable to download the analytics report.",
            ),
        },
      );
    } finally {
      setIsExporting(false);
    }
  }

  if (isForbidden) {
    return (
      <main className="p-4 sm:p-6 lg:p-8">
        <section className="mx-auto max-w-4xl rounded-3xl border bg-background p-6 sm:p-10">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <ShieldAlert className="size-6" />
          </div>

          <h1 className="mt-6 text-3xl font-bold">
            Research analytics access
          </h1>

          <p className="mt-3 max-w-2xl text-muted-foreground">
            The analytics API is restricted
            to researcher and administrator
            accounts. Your current account
            role is{" "}
            <span className="font-medium text-foreground">
              {currentUser?.role ??
                "unknown"}
            </span>
            .
          </p>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Ask an administrator to change
            your role to{" "}
            <strong>researcher</strong> or{" "}
            <strong>admin</strong> before
            opening this page.
          </div>
        </section>
      </main>
    );
  }

  if (
    dashboardQuery.isLoading ||
    comparisonQuery.isLoading
  ) {
    return <AnalyticsLoading />;
  }

  if (
    dashboardQuery.isError ||
    comparisonQuery.isError
  ) {
    const error =
      dashboardQuery.error ??
      comparisonQuery.error;

    return (
      <main className="p-4 sm:p-6 lg:p-8">
        <section className="mx-auto max-w-4xl rounded-3xl border bg-background p-6 sm:p-10">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="size-6" />
          </div>

          <h1 className="mt-6 text-3xl font-bold">
            Analytics could not load
          </h1>

          <p className="mt-3 text-muted-foreground">
            {getApiErrorMessage(
              error,
              "Unable to load analytics from the BanglaGuard API.",
            )}
          </p>

          <Button
            className="mt-6"
            onClick={handleRefresh}
          >
            <RefreshCw className="size-4" />
            Try again
          </Button>
        </section>
      </main>
    );
  }

  const dashboard =
    dashboardQuery.data;

  const comparison =
    comparisonQuery.data ?? [];

  if (!dashboard) {
    return null;
  }

  const { summary } = dashboard;

  const feedbackTotal =
    getFeedbackTotal(
      summary.feedback,
    );

  const feedbackAccuracy =
    getFeedbackAccuracy(
      summary.feedback,
    );

  const completionRate =
    summary.total_predictions > 0
      ? (summary.completed_predictions /
          summary.total_predictions) *
        100
      : 0;

  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-8">
      <AnalyticsHeader
        dateRange={dateRange}
        task={task}
        isRefreshing={
          dashboardQuery.isFetching ||
          comparisonQuery.isFetching
        }
        isExporting={isExporting}
        onDateRangeChange={
          setDateRange
        }
        onTaskChange={setTask}
        onRefresh={handleRefresh}
        onExport={handleExport}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total predictions"
          value={formatNumber(
            summary.total_predictions,
          )}
          description={`${formatPercentage(
            completionRate,
          )} completed`}
          icon={Activity}
        />

        <StatCard
          label="Average confidence"
          value={formatPercentage(
            summary.average_confidence,
          )}
          description={`Range ${formatPercentage(
            summary.minimum_confidence,
          )}–${formatPercentage(
            summary.maximum_confidence,
          )}`}
          icon={Gauge}
        />

        <StatCard
          label="Average latency"
          value={formatLatency(
            summary.average_latency_ms,
          )}
          description="Mean model response time"
          icon={Clock3}
        />

        <StatCard
          label="Human feedback"
          value={formatNumber(
            feedbackTotal,
          )}
          description={`Observed accuracy ${formatPercentage(
            feedbackAccuracy,
          )}`}
          icon={MessageSquareText}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <DailyPredictionsChart
          items={
            dashboard.daily_predictions
          }
        />

        <PredictionStatusCard
          completed={
            summary.completed_predictions
          }
          failed={
            summary.failed_predictions
          }
          total={
            summary.total_predictions
          }
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <LabelDistributionCard
          items={
            summary.label_distribution
          }
          total={
            summary.total_predictions
          }
        />

        <ModelUsageCard
          items={summary.model_usage}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1.5fr]">
        <FeedbackCard
          total={feedbackTotal}
          correct={
            summary.feedback
              .correct_feedback ?? 0
          }
          incorrect={
            summary.feedback
              .incorrect_feedback ?? 0
          }
          pending={
            summary.feedback
              .pending_feedback ?? 0
          }
          accuracy={
            feedbackAccuracy
          }
        />

        <ModelComparisonTable
          items={comparison}
        />
      </section>
    </main>
  );
}

function AnalyticsHeader({
  dateRange,
  task,
  isRefreshing,
  isExporting,
  onDateRangeChange,
  onTaskChange,
  onRefresh,
  onExport,
}: {
  dateRange: DateRangeOption;
  task: TaskOption;
  isRefreshing: boolean;
  isExporting: boolean;
  onDateRangeChange: (
    value: DateRangeOption,
  ) => void;
  onTaskChange: (
    value: TaskOption,
  ) => void;
  onRefresh: () => void;
  onExport: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-emerald-50 via-background to-cyan-50 dark:from-emerald-950/30 dark:via-background dark:to-cyan-950/20">
      <div className="p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <BarChart3 className="size-4" />
              Live research analytics
            </div>

            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
              Analytics dashboard
            </h1>

            <p className="mt-3 max-w-3xl text-muted-foreground">
              Inspect prediction activity,
              model usage, confidence,
              latency, label distribution,
              evaluation evidence and human
              feedback returned by the
              BanglaGuard API.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  isRefreshing &&
                    "animate-spin",
                )}
              />
              Refresh
            </Button>

            <Button
              onClick={onExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      <div className="grid border-t bg-background/70 sm:grid-cols-2">
        <div className="border-b p-4 sm:border-b-0 sm:border-r">
          <label
            htmlFor="analytics-date-range"
            className="text-xs font-medium text-muted-foreground"
          >
            Date range
          </label>

          <select
            id="analytics-date-range"
            value={dateRange}
            onChange={(event) =>
              onDateRangeChange(
                event.target
                  .value as DateRangeOption,
              )
            }
            className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            <option value="7">
              Last 7 days
            </option>

            <option value="30">
              Last 30 days
            </option>

            <option value="90">
              Last 90 days
            </option>

            <option value="all">
              All available data
            </option>
          </select>
        </div>

        <div className="p-4">
          <label
            htmlFor="analytics-task"
            className="text-xs font-medium text-muted-foreground"
          >
            Analysis task
          </label>

          <select
            id="analytics-task"
            value={task}
            onChange={(event) =>
              onTaskChange(
                event.target
                  .value as TaskOption,
              )
            }
            className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            <option value="all">
              All tasks
            </option>

            <option value="hate_speech">
              Hate-speech detection
            </option>

            <option value="sentiment">
              Sentiment analysis
            </option>
          </select>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: typeof Activity;
}) {
  return (
    <article className="rounded-3xl border bg-background p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {label}
          </p>

          <p className="mt-2 text-3xl font-bold">
            {value}
          </p>
        </div>

        <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Icon className="size-5" />
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {description}
      </p>
    </article>
  );
}

function DailyPredictionsChart({
  items,
}: {
  items: DailyPredictionItem[];
}) {
  const visibleItems =
    items.slice(-30);

  const maximum = Math.max(
    1,
    ...visibleItems.map(
      getDailyCount,
    ),
  );

  return (
    <section className="rounded-3xl border bg-background p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <TrendingUp className="size-5" />
        </div>

        <div>
          <h2 className="font-semibold">
            Prediction activity
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Stored predictions grouped by
            day.
          </p>
        </div>
      </div>

      {visibleItems.length > 0 ? (
        <div className="mt-8 overflow-x-auto">
          <div className="flex min-w-[560px] items-end gap-2">
            {visibleItems.map(
              (item) => {
                const count =
                  getDailyCount(item);

                const height =
                  count > 0
                    ? Math.max(
                        10,
                        (count /
                          maximum) *
                          180,
                      )
                    : 4;

                return (
                  <div
                    key={item.date}
                    className="flex min-w-0 flex-1 flex-col items-center"
                  >
                    <span className="mb-2 text-xs font-medium">
                      {count}
                    </span>

                    <div className="flex h-[180px] w-full items-end rounded-lg bg-muted/40">
                      <div
                        className="w-full rounded-lg bg-foreground"
                        style={{
                          height,
                        }}
                        title={`${formatDate(
                          item.date,
                        )}: ${count} predictions`}
                      />
                    </div>

                    <span className="mt-2 whitespace-nowrap text-[10px] text-muted-foreground">
                      {formatDate(
                        item.date,
                      )}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </div>
      ) : (
        <EmptyBlock message="No daily prediction activity is available for this filter." />
      )}
    </section>
  );
}

function PredictionStatusCard({
  completed,
  failed,
  total,
}: {
  completed: number;
  failed: number;
  total: number;
}) {
  const completedPercentage =
    total > 0
      ? (completed / total) * 100
      : 0;

  const failedPercentage =
    total > 0
      ? (failed / total) * 100
      : 0;

  return (
    <section className="rounded-3xl border bg-background p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Sparkles className="size-5" />
        </div>

        <div>
          <h2 className="font-semibold">
            Prediction status
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Completion and failure rates.
          </p>
        </div>
      </div>

      <div className="mt-7 space-y-6">
        <MetricBar
          label="Completed"
          value={completed}
          percentage={
            completedPercentage
          }
        />

        <MetricBar
          label="Failed"
          value={failed}
          percentage={failedPercentage}
        />

        <div className="rounded-2xl border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            Total stored records
          </p>

          <p className="mt-2 text-2xl font-bold">
            {formatNumber(total)}
          </p>
        </div>
      </div>
    </section>
  );
}

function MetricBar({
  label,
  value,
  percentage,
}: {
  label: string;
  value: number;
  percentage: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4">
        <span className="text-sm">
          {label}
        </span>

        <span className="text-sm font-semibold">
          {formatNumber(value)} ·{" "}
          {formatPercentage(
            percentage,
          )}
        </span>
      </div>

      <Progress
        value={normalizePercentage(
          percentage,
        ) ?? 0}
      />
    </div>
  );
}

function LabelDistributionCard({
  items,
  total,
}: {
  items: LabelDistributionItem[];
  total: number;
}) {
  return (
    <section className="rounded-3xl border bg-background p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <BarChart3 className="size-5" />
        </div>

        <div>
          <h2 className="font-semibold">
            Label distribution
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Predicted labels across stored
            results.
          </p>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="mt-7 space-y-5">
          {items.map((item) => {
            const percentage =
              item.percentage ??
              (total > 0
                ? (item.count /
                    total) *
                  100
                : 0);

            return (
              <div key={item.label}>
                <div className="mb-2 flex items-center justify-between gap-4">
                  <span className="font-medium">
                    {formatWords(
                      item.label,
                    )}
                  </span>

                  <span className="text-sm text-muted-foreground">
                    {formatNumber(
                      item.count,
                    )}{" "}
                    ·{" "}
                    {formatPercentage(
                      percentage,
                    )}
                  </span>
                </div>

                <Progress
                  value={
                    normalizePercentage(
                      percentage,
                    ) ?? 0
                  }
                />
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyBlock message="No label distribution is available." />
      )}
    </section>
  );
}

function ModelUsageCard({
  items,
}: {
  items: ModelUsageItem[];
}) {
  const totalUsage = items.reduce(
    (total, item) =>
      total +
      item.prediction_count,
    0,
  );

  return (
    <section className="rounded-3xl border bg-background p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <BrainCircuit className="size-5" />
        </div>

        <div>
          <h2 className="font-semibold">
            Model usage
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Prediction volume by registered
            model version.
          </p>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="mt-7 space-y-4">
          {items.map((item) => {
            const percentage =
              item.percentage ??
              (totalUsage > 0
                ? (item.prediction_count /
                    totalUsage) *
                  100
                : 0);

            return (
              <article
                key={
                  item.model_version_id
                }
                className="rounded-2xl border p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">
                      {item.model_name}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Version{" "}
                      {item.model_version}
                    </p>
                  </div>

                  <Badge variant="outline">
                    {formatNumber(
                      item.prediction_count,
                    )}
                  </Badge>
                </div>

                <Progress
                  className="mt-4"
                  value={
                    normalizePercentage(
                      percentage,
                    ) ?? 0
                  }
                />
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyBlock message="No model usage records are available." />
      )}
    </section>
  );
}

function FeedbackCard({
  total,
  correct,
  incorrect,
  pending,
  accuracy,
}: {
  total: number;
  correct: number;
  incorrect: number;
  pending: number;
  accuracy: number | null;
}) {
  return (
    <section className="rounded-3xl border bg-background p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <MessageSquareText className="size-5" />
        </div>

        <div>
          <h2 className="font-semibold">
            Human feedback
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Reviewer evidence attached to
            predictions.
          </p>
        </div>
      </div>

      <div className="mt-7 rounded-2xl border bg-muted/30 p-5">
        <p className="text-sm text-muted-foreground">
          Observed feedback accuracy
        </p>

        <p className="mt-2 text-3xl font-bold">
          {formatPercentage(accuracy)}
        </p>

        <Progress
          className="mt-4"
          value={
            normalizePercentage(
              accuracy,
            ) ?? 0
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <FeedbackMetric
          label="Total"
          value={total}
        />

        <FeedbackMetric
          label="Correct"
          value={correct}
        />

        <FeedbackMetric
          label="Incorrect"
          value={incorrect}
        />

        <FeedbackMetric
          label="Pending"
          value={pending}
        />
      </div>
    </section>
  );
}

function FeedbackMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border p-4">
      <p className="text-xs text-muted-foreground">
        {label}
      </p>

      <p className="mt-2 text-xl font-semibold">
        {formatNumber(value)}
      </p>
    </div>
  );
}

function ModelComparisonTable({
  items,
}: {
  items: ModelComparisonItem[];
}) {
  return (
    <section className="overflow-hidden rounded-3xl border bg-background">
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <BrainCircuit className="size-5" />
          </div>

          <div>
            <h2 className="font-semibold">
              Model comparison
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Live production performance
              and reviewer evidence.
            </p>
          </div>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="overflow-x-auto border-t">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-5 py-4 font-medium">
                  Model
                </th>

                <th className="px-5 py-4 font-medium">
                  Status
                </th>

                <th className="px-5 py-4 font-medium">
                  Predictions
                </th>

                <th className="px-5 py-4 font-medium">
                  Confidence
                </th>

                <th className="px-5 py-4 font-medium">
                  Latency
                </th>

                <th className="px-5 py-4 font-medium">
                  Feedback
                </th>

                <th className="px-5 py-4 font-medium">
                  Observed accuracy
                </th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => (
                <tr
                  key={
                    item.model_version_id
                  }
                  className="border-t"
                >
                  <td className="px-5 py-4">
                    <p className="font-medium">
                      {item.model_name}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      v{item.model_version} ·{" "}
                      {formatWords(
                        item.architecture,
                      )}
                    </p>
                  </td>

                  <td className="px-5 py-4">
                    <Badge
                      variant="outline"
                      className={cn(
                        item.status ===
                          "active" &&
                          "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                      )}
                    >
                      {formatWords(
                        item.status,
                      )}
                    </Badge>
                  </td>

                  <td className="px-5 py-4 font-medium">
                    {formatNumber(
                      item.prediction_count,
                    )}
                  </td>

                  <td className="px-5 py-4">
                    {formatPercentage(
                      item.average_confidence,
                    )}
                  </td>

                  <td className="px-5 py-4">
                    {formatLatency(
                      item.average_latency_ms,
                    )}
                  </td>

                  <td className="px-5 py-4">
                    {formatNumber(
                      item.feedback_count,
                    )}
                  </td>

                  <td className="px-5 py-4">
                    {formatPercentage(
                      item.observed_feedback_accuracy,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-t p-6">
          <EmptyBlock message="No model comparison records are available." />
        </div>
      )}
    </section>
  );
}

function EmptyBlock({
  message,
}: {
  message: string;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed p-6 text-center">
      <BarChart3 className="mx-auto size-6 text-muted-foreground" />

      <p className="mt-3 text-sm text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

function AnalyticsLoading() {
  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="h-72 animate-pulse rounded-3xl border bg-muted/40" />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({
          length: 4,
        }).map((_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-3xl border bg-muted/40"
          />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="h-96 animate-pulse rounded-3xl border bg-muted/40" />

        <div className="h-96 animate-pulse rounded-3xl border bg-muted/40" />
      </section>
    </main>
  );
}
