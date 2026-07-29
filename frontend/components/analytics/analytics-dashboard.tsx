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
  value?: string | null,
): string {
  if (!value) {
    return "—";
  }

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
    agreement_rate?:
      | number
      | null;
    observed_feedback_accuracy?:
      | number
      | null;
    observed_accuracy?:
      | number
      | null;
  },
): number | null {
  return (
    feedback.agreement_rate ??
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

  const [
    selectedEvaluationModelId,
    setSelectedEvaluationModelId,
  ] = useState("");

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

  const selectedEvaluationModel =
    comparison.find(
      (item) =>
        item.model_version_id ===
        selectedEvaluationModelId,
    ) ??
    comparison.find(
      (item) =>
        item.status.toLowerCase() ===
        "active",
    ) ??
    comparison[0] ??
    null;

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

      <ResearchEvaluationPanel
        items={comparison}
        selectedItem={
          selectedEvaluationModel
        }
        selectedModelId={
          selectedEvaluationModel
            ?.model_version_id ?? ""
        }
        onSelectedModelChange={
          setSelectedEvaluationModelId
        }
      />

      <section className="grid gap-6 xl:grid-cols-[1fr_1.5fr]">
        <FeedbackCard
          total={feedbackTotal}
          correct={
            summary.feedback.correct ??
            summary.feedback
              .correct_feedback ??
            0
          }
          incorrect={
            summary.feedback.incorrect ??
            summary.feedback
              .incorrect_feedback ??
            0
          }
          pending={
            summary.feedback.pending ??
            summary.feedback
              .pending_feedback ??
            0
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


type UnknownRecord = Record<
  string,
  unknown
>;

type ClassReportRow = {
  label: string;
  precision: number | null;
  recall: number | null;
  f1Score: number | null;
  support: number | null;
};

function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getMetricNumber(
  metrics: UnknownRecord,
  key: string,
): number | null {
  const value = metrics[key];

  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : null;
}

function getMetricString(
  metrics: UnknownRecord,
  key: string,
): string | null {
  const value = metrics[key];

  return typeof value === "string"
    ? value
    : null;
}

function getMetricMatrix(
  metrics: UnknownRecord,
): number[][] {
  const value =
    metrics.confusion_matrix;

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(Array.isArray)
    .map((row) =>
      row.map((cell) =>
        typeof cell === "number" &&
        Number.isFinite(cell)
          ? cell
          : 0,
      ),
    );
}

function getMetricLabels(
  metrics: UnknownRecord,
  matrix: number[][],
): string[] {
  const value =
    metrics.confusion_matrix_labels;

  if (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "string",
    )
  ) {
    return value;
  }

  return matrix.map(
    (_, index) =>
      `Class ${index + 1}`,
  );
}

function getClassReportRows(
  metrics: UnknownRecord,
): ClassReportRow[] {
  const report =
    metrics.classification_report;

  if (!isRecord(report)) {
    return [];
  }

  const ignoredKeys = new Set([
    "accuracy",
    "macro avg",
    "weighted avg",
    "micro avg",
    "samples avg",
  ]);

  return Object.entries(report)
    .filter(
      ([label, value]) =>
        !ignoredKeys.has(label) &&
        isRecord(value),
    )
    .map(([label, value]) => {
      const row =
        value as UnknownRecord;

      return {
        label,
        precision: getMetricNumber(
          row,
          "precision",
        ),
        recall: getMetricNumber(
          row,
          "recall",
        ),
        f1Score:
          getMetricNumber(
            row,
            "f1-score",
          ) ??
          getMetricNumber(
            row,
            "f1_score",
          ),
        support: getMetricNumber(
          row,
          "support",
        ),
      };
    });
}

function ResearchEvaluationPanel({
  items,
  selectedItem,
  selectedModelId,
  onSelectedModelChange,
}: {
  items: ModelComparisonItem[];
  selectedItem:
    | ModelComparisonItem
    | null;
  selectedModelId: string;
  onSelectedModelChange: (
    value: string,
  ) => void;
}) {
  if (
    items.length === 0 ||
    !selectedItem
  ) {
    return (
      <section className="rounded-3xl border bg-background p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Sparkles className="size-5" />
          </div>

          <div>
            <h2 className="font-semibold">
              Research evaluation
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Registered evaluation
              evidence for trained models.
            </p>
          </div>
        </div>

        <EmptyBlock message="No registered model evaluation is available." />
      </section>
    );
  }

  const metrics =
    selectedItem.registered_metrics;

  const accuracy =
    getMetricNumber(
      metrics,
      "accuracy",
    );

  const macroPrecision =
    getMetricNumber(
      metrics,
      "macro_precision",
    );

  const macroRecall =
    getMetricNumber(
      metrics,
      "macro_recall",
    );

  const macroF1 =
    getMetricNumber(
      metrics,
      "macro_f1",
    );

  const weightedF1 =
    getMetricNumber(
      metrics,
      "weighted_f1",
    );

  const validationAccuracy =
    getMetricNumber(
      metrics,
      "validation_accuracy",
    );

  const validationMacroF1 =
    getMetricNumber(
      metrics,
      "validation_macro_f1",
    );

  const trainingLoss =
    getMetricNumber(
      metrics,
      "train_loss",
    );

  const validationLoss =
    getMetricNumber(
      metrics,
      "validation_loss",
    );

  const testLoss =
    getMetricNumber(
      metrics,
      "test_loss",
    );

  const runtime =
    getMetricNumber(
      metrics,
      "training_runtime_seconds",
    );

  const trainingSamples =
    getMetricNumber(
      metrics,
      "training_samples",
    );

  const validationSamples =
    getMetricNumber(
      metrics,
      "validation_samples",
    );

  const evaluationSamples =
    getMetricNumber(
      metrics,
      "evaluation_samples",
    );

  const evaluationSplit =
    getMetricString(
      metrics,
      "evaluation_split",
    );

  const warning =
    getMetricString(
      metrics,
      "warning",
    );

  const matrix =
    getMetricMatrix(metrics);

  const matrixLabels =
    getMetricLabels(
      metrics,
      matrix,
    );

  const classRows =
    getClassReportRows(metrics);

  const hasMetrics =
    Object.keys(metrics).length > 0;

  return (
    <section className="overflow-hidden rounded-3xl border bg-background">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Sparkles className="size-5" />
            </div>

            <div>
              <h2 className="font-semibold">
                Research evaluation
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Registered validation and
                test evidence for trained
                model versions.
              </p>
            </div>
          </div>

          <div className="w-full lg:max-w-sm">
            <label
              htmlFor="evaluation-model"
              className="text-xs font-medium text-muted-foreground"
            >
              Evaluated model
            </label>

            <select
              id="evaluation-model"
              value={selectedModelId}
              onChange={(event) =>
                onSelectedModelChange(
                  event.target.value,
                )
              }
              className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm"
            >
              {items.map((item) => (
                <option
                  key={
                    item.model_version_id
                  }
                  value={
                    item.model_version_id
                  }
                >
                  {item.model_name} v
                  {item.model_version}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {formatWords(
              selectedItem.task,
            )}
          </Badge>

          <Badge variant="outline">
            {formatWords(
              selectedItem.architecture,
            )}
          </Badge>

          <Badge
            variant="outline"
            className={cn(
              selectedItem.status
                .toLowerCase() ===
                "active" &&
                "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
            )}
          >
            {formatWords(
              selectedItem.status,
            )}
          </Badge>

          {evaluationSplit && (
            <Badge variant="secondary">
              {formatWords(
                evaluationSplit,
              )} evaluation
            </Badge>
          )}
        </div>

        {warning && (
          <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle className="mt-0.5 size-5 shrink-0" />

            <div>
              <p className="font-semibold">
                Research validity warning
              </p>

              <p className="mt-1">
                {warning}
              </p>

              <p className="mt-2 text-xs opacity-80">
                These figures validate the
                pipeline only and must not
                be presented as final or
                publishable model
                performance.
              </p>
            </div>
          </div>
        )}
      </div>

      {!hasMetrics ? (
        <div className="border-t p-6">
          <EmptyBlock message="This model does not have registered evaluation metrics." />
        </div>
      ) : (
        <>
          <div className="grid gap-4 border-t p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-5">
            <EvaluationMetricCard
              label="Test accuracy"
              value={accuracy}
            />

            <EvaluationMetricCard
              label="Macro precision"
              value={macroPrecision}
            />

            <EvaluationMetricCard
              label="Macro recall"
              value={macroRecall}
            />

            <EvaluationMetricCard
              label="Macro F1"
              value={macroF1}
            />

            <EvaluationMetricCard
              label="Weighted F1"
              value={weightedF1}
            />
          </div>

          <div className="grid gap-6 border-t p-5 sm:p-6 xl:grid-cols-[1.15fr_0.85fr]">
            <ConfusionMatrixCard
              matrix={matrix}
              labels={matrixLabels}
            />

            <EvaluationContextCard
              validationAccuracy={
                validationAccuracy
              }
              validationMacroF1={
                validationMacroF1
              }
              trainingLoss={trainingLoss}
              validationLoss={
                validationLoss
              }
              testLoss={testLoss}
              runtime={runtime}
              trainingSamples={
                trainingSamples
              }
              validationSamples={
                validationSamples
              }
              evaluationSamples={
                evaluationSamples
              }
              evaluationSplit={
                evaluationSplit
              }
            />
          </div>

          <div className="border-t p-5 sm:p-6">
            <ClassificationReportTable
              rows={classRows}
            />
          </div>

          <div className="border-t p-5 sm:p-6">
            <TrainingConfigurationCard
              configuration={
                selectedItem
                  .registered_configuration ??
                {}
              }
            />
          </div>
        </>
      )}
    </section>
  );
}

function EvaluationMetricCard({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const normalized =
    normalizePercentage(value);

  return (
    <article className="rounded-2xl border p-4">
      <p className="text-xs text-muted-foreground">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold">
        {formatPercentage(value)}
      </p>

      <Progress
        className="mt-4 h-2"
        value={normalized ?? 0}
      />
    </article>
  );
}

function ConfusionMatrixCard({
  matrix,
  labels,
}: {
  matrix: number[][];
  labels: string[];
}) {
  if (matrix.length === 0) {
    return (
      <section className="rounded-2xl border p-5">
        <h3 className="font-semibold">
          Confusion matrix
        </h3>

        <EmptyBlock message="No confusion matrix was registered for this model." />
      </section>
    );
  }

  const maximum = Math.max(
    1,
    ...matrix.flat(),
  );

  return (
    <section className="overflow-hidden rounded-2xl border">
      <div className="border-b p-5">
        <h3 className="font-semibold">
          Confusion matrix
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">
          Rows are actual labels; columns
          are predicted labels.
        </p>
      </div>

      <div className="overflow-x-auto p-5">
        <table className="mx-auto text-center text-xs">
          <thead>
            <tr>
              <th className="p-2 text-left text-muted-foreground">
                Actual ↓ / Predicted →
              </th>

              {labels.map((label) => (
                <th
                  key={label}
                  className="min-w-24 p-2 font-medium"
                >
                  {formatWords(label)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {matrix.map(
              (row, rowIndex) => (
                <tr key={rowIndex}>
                  <th className="p-2 text-left font-medium">
                    {formatWords(
                      labels[rowIndex] ??
                        `Class ${
                          rowIndex + 1
                        }`,
                    )}
                  </th>

                  {row.map(
                    (
                      value,
                      columnIndex,
                    ) => {
                      const intensity =
                        value / maximum;

                      return (
                        <td
                          key={
                            columnIndex
                          }
                          className="p-1"
                        >
                          <div
                            className="flex h-16 min-w-20 items-center justify-center rounded-xl border font-semibold"
                            style={{
                              backgroundColor: `rgba(16, 185, 129, ${
                                0.08 +
                                intensity *
                                  0.55
                              })`,
                            }}
                            title={`Actual ${
                              labels[
                                rowIndex
                              ] ??
                              rowIndex + 1
                            }, predicted ${
                              labels[
                                columnIndex
                              ] ??
                              columnIndex +
                                1
                            }: ${value}`}
                          >
                            {formatNumber(
                              value,
                            )}
                          </div>
                        </td>
                      );
                    },
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatDecimal(
  value: number | null,
): string {
  if (value === null) {
    return "—";
  }

  return value.toFixed(4);
}

function formatRuntimeSeconds(
  value: number | null,
): string {
  if (value === null) {
    return "—";
  }

  if (value >= 60) {
    return `${(
      value / 60
    ).toFixed(2)} min`;
  }

  return `${value.toFixed(2)} s`;
}

function EvaluationContextCard({
  validationAccuracy,
  validationMacroF1,
  trainingLoss,
  validationLoss,
  testLoss,
  runtime,
  trainingSamples,
  validationSamples,
  evaluationSamples,
  evaluationSplit,
}: {
  validationAccuracy: number | null;
  validationMacroF1: number | null;
  trainingLoss: number | null;
  validationLoss: number | null;
  testLoss: number | null;
  runtime: number | null;
  trainingSamples: number | null;
  validationSamples: number | null;
  evaluationSamples: number | null;
  evaluationSplit: string | null;
}) {
  const rows = [
    {
      label: "Validation accuracy",
      value: formatPercentage(
        validationAccuracy,
      ),
    },
    {
      label: "Validation macro F1",
      value: formatPercentage(
        validationMacroF1,
      ),
    },
    {
      label: "Training loss",
      value: formatDecimal(
        trainingLoss,
      ),
    },
    {
      label: "Validation loss",
      value: formatDecimal(
        validationLoss,
      ),
    },
    {
      label: "Test loss",
      value: formatDecimal(testLoss),
    },
    {
      label: "Training runtime",
      value: formatRuntimeSeconds(
        runtime,
      ),
    },
    {
      label: "Training samples",
      value: formatNumber(
        trainingSamples,
      ),
    },
    {
      label: "Validation samples",
      value: formatNumber(
        validationSamples,
      ),
    },
    {
      label: `${
        evaluationSplit
          ? formatWords(
              evaluationSplit,
            )
          : "Evaluation"
      } samples`,
      value: formatNumber(
        evaluationSamples,
      ),
    },
  ];

  return (
    <section className="rounded-2xl border">
      <div className="border-b p-5">
        <h3 className="font-semibold">
          Evaluation context
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">
          Dataset size, validation
          evidence, losses, and runtime.
        </p>
      </div>

      <dl className="divide-y">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 px-5 py-3"
          >
            <dt className="text-sm text-muted-foreground">
              {row.label}
            </dt>

            <dd className="text-sm font-semibold">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ClassificationReportTable({
  rows,
}: {
  rows: ClassReportRow[];
}) {
  return (
    <section>
      <div>
        <h3 className="font-semibold">
          Per-class performance
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">
          Precision, recall and F1 evidence
          from the registered classification
          report.
        </p>
      </div>

      {rows.length > 0 ? (
        <div className="mt-5 overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[650px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-5 py-4 font-medium">
                  Class
                </th>

                <th className="px-5 py-4 font-medium">
                  Precision
                </th>

                <th className="px-5 py-4 font-medium">
                  Recall
                </th>

                <th className="px-5 py-4 font-medium">
                  F1 score
                </th>

                <th className="px-5 py-4 font-medium">
                  Support
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.label}
                  className="border-t"
                >
                  <td className="px-5 py-4 font-medium">
                    {formatWords(
                      row.label,
                    )}
                  </td>

                  <td className="px-5 py-4">
                    {formatPercentage(
                      row.precision,
                    )}
                  </td>

                  <td className="px-5 py-4">
                    {formatPercentage(
                      row.recall,
                    )}
                  </td>

                  <td className="px-5 py-4">
                    {formatPercentage(
                      row.f1Score,
                    )}
                  </td>

                  <td className="px-5 py-4">
                    {formatNumber(
                      row.support,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyBlock message="No per-class classification report was registered." />
      )}
    </section>
  );
}


function formatConfigurationValue(
  value: unknown,
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (
    typeof value === "number"
  ) {
    if (
      Math.abs(value) > 0 &&
      Math.abs(value) < 0.001
    ) {
      return value.toExponential(2);
    }

    return new Intl.NumberFormat(
      "en-US",
      {
        maximumFractionDigits: 6,
      },
    ).format(value);
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map(
        formatConfigurationValue,
      )
      .join(", ");
  }

  if (isRecord(value)) {
    return Object.entries(value)
      .map(
        ([key, nestedValue]) =>
          `${formatWords(
            key,
          )}: ${formatConfigurationValue(
            nestedValue,
          )}`,
      )
      .join(" · ");
  }

  return String(value);
}

function getConfigurationLabel(
  key: string,
): string {
  const labels: Record<
    string,
    string
  > = {
    base_model: "Base model",
    epochs: "Epochs",
    train_batch_size:
      "Training batch size",
    eval_batch_size:
      "Evaluation batch size",
    learning_rate:
      "Learning rate",
    random_seed:
      "Random seed",
    max_length:
      "Maximum sequence length",
    labels: "Class labels",
    class_weight:
      "Class weighting",
    word_ngram_range:
      "Word n-gram range",
    character_ngram_range:
      "Character n-gram range",
    training_samples:
      "Training samples",
    validation_samples:
      "Validation samples",
    test_samples:
      "Test samples",
    dataset_directory:
      "Dataset directory",
    type: "Model type",
  };

  return (
    labels[key] ??
    formatWords(key)
  );
}

function TrainingConfigurationCard({
  configuration,
}: {
  configuration?:
    | UnknownRecord
    | null;
}) {
  const safeConfiguration =
    isRecord(configuration)
      ? configuration
      : {};

  const entries = Object.entries(
    safeConfiguration,
  );

  const priority = [
    "base_model",
    "type",
    "epochs",
    "train_batch_size",
    "eval_batch_size",
    "learning_rate",
    "random_seed",
    "max_length",
    "class_weight",
    "word_ngram_range",
    "character_ngram_range",
    "labels",
    "training_samples",
    "validation_samples",
    "test_samples",
    "dataset_directory",
  ];

  const priorityMap = new Map(
    priority.map(
      (key, index) => [
        key,
        index,
      ],
    ),
  );

  const sortedEntries = [
    ...entries,
  ].sort(([left], [right]) => {
    const leftPriority =
      priorityMap.get(left) ??
      Number.MAX_SAFE_INTEGER;

    const rightPriority =
      priorityMap.get(right) ??
      Number.MAX_SAFE_INTEGER;

    if (
      leftPriority !== rightPriority
    ) {
      return (
        leftPriority -
        rightPriority
      );
    }

    return left.localeCompare(
      right,
    );
  });

  return (
    <section>
      <div>
        <h3 className="font-semibold">
          Training configuration
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">
          Reproducibility metadata
          registered with this model
          version.
        </p>
      </div>

      {sortedEntries.length > 0 ? (
        <dl className="mt-5 grid overflow-hidden rounded-2xl border sm:grid-cols-2 xl:grid-cols-3">
          {sortedEntries.map(
            ([key, value]) => (
              <div
                key={key}
                className="border-b p-4 last:border-b-0 sm:border-r"
              >
                <dt className="text-xs font-medium text-muted-foreground">
                  {getConfigurationLabel(
                    key,
                  )}
                </dt>

                <dd
                  className="mt-2 break-words text-sm font-semibold"
                  title={formatConfigurationValue(
                    value,
                  )}
                >
                  {formatConfigurationValue(
                    value,
                  )}
                </dd>
              </div>
            ),
          )}
        </dl>
      ) : (
        <EmptyBlock message="No training configuration was registered for this model." />
      )}
    </section>
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
