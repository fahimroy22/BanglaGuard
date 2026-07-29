"use client";

import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  Database,
  FileQuestion,
  FlaskConical,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  getApiErrorMessage,
} from "@/lib/api";
import {
  listModelVersions,
} from "@/lib/predictions";
import { cn } from "@/lib/utils";

import type {
  ModelStatus,
  ModelVersionRead,
} from "@/types/prediction";

type NumericMetric = {
  key: string;
  label: string;
  value: number;
  percentage: number;
};

const preferredMetricKeys = [
  "accuracy",
  "f1",
  "f1_score",
  "macro_f1",
  "weighted_f1",
  "precision",
  "recall",
  "validation_accuracy",
  "validation_f1",
  "test_accuracy",
  "test_f1",
];

function formatWords(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function formatTask(
  task: ModelVersionRead["task"],
): string {
  if (task === "hate_speech") {
    return "Hate Speech";
  }

  return "Sentiment";
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: "medium",
    },
  ).format(date);
}

function normalizeMetricPercentage(
  value: number,
): number {
  if (value >= 0 && value <= 1) {
    return value * 100;
  }

  if (value >= 0 && value <= 100) {
    return value;
  }

  return 0;
}

function extractNumericMetrics(
  metrics: Record<string, unknown> | null,
): NumericMetric[] {
  if (!metrics) {
    return [];
  }

  const entries = Object.entries(metrics)
    .filter(
      (
        entry,
      ): entry is [string, number] =>
        typeof entry[1] === "number" &&
        Number.isFinite(entry[1]),
    )
    .map(([key, value]) => ({
      key,
      label: formatWords(key),
      value,
      percentage:
        normalizeMetricPercentage(value),
    }));

  return entries
    .sort((first, second) => {
      const firstIndex =
        preferredMetricKeys.indexOf(
          first.key.toLowerCase(),
        );

      const secondIndex =
        preferredMetricKeys.indexOf(
          second.key.toLowerCase(),
        );

      const safeFirst =
        firstIndex === -1
          ? Number.MAX_SAFE_INTEGER
          : firstIndex;

      const safeSecond =
        secondIndex === -1
          ? Number.MAX_SAFE_INTEGER
          : secondIndex;

      return safeFirst - safeSecond;
    })
    .slice(0, 4);
}

function getStatusClasses(
  status: ModelStatus,
): string {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";
  }

  if (status === "retired") {
    return "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
  }

  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";
}

function getArchitectureLabel(
  architecture: string,
): string {
  const architectureMap:
    Record<string, string> = {
      tfidf_logistic_regression:
        "TF-IDF Logistic Regression",
      tfidf_linear_svm:
        "TF-IDF Linear SVM",
      banglabert_sequence_classification:
        "BanglaBERT Sequence Classifier",
      transformer_sequence_classification:
        "Transformer Sequence Classifier",
    };

  return (
    architectureMap[architecture] ??
    formatWords(architecture)
  );
}

function getArchitectureFamily(
  architecture: string,
): string {
  if (
    architecture.includes("banglabert") ||
    architecture.includes("transformer")
  ) {
    return "Transformer";
  }

  if (
    architecture.includes("tfidf") ||
    architecture.includes("logistic") ||
    architecture.includes("svm")
  ) {
    return "Classical ML";
  }

  return "Custom";
}

export function ModelRegistry() {
  const modelsQuery = useQuery({
    queryKey: ["model-versions"],
    queryFn: listModelVersions,
    staleTime: 60_000,
  });

  const models = modelsQuery.data ?? [];

  const activeCount = models.filter(
    (model) => model.status === "active",
  ).length;

  const explainableCount = models.filter(
    (model) => model.is_explainable,
  ).length;

  const hateSpeechCount = models.filter(
    (model) =>
      model.task === "hate_speech",
  ).length;

  const sentimentCount = models.filter(
    (model) =>
      model.task === "sentiment",
  ).length;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border bg-background">
        <div className="border-b bg-gradient-to-r from-emerald-50 via-background to-cyan-50 px-6 py-7 dark:from-emerald-950/30 dark:via-background dark:to-cyan-950/30 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <FlaskConical className="size-4" />
                Live model registry
              </div>

              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Model versions
              </h1>

              <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
                Inspect registered Bangla NLP models, active
                production versions, architecture details,
                metrics and explainability support.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1.5"
              >
                <Database className="size-3.5 text-emerald-600" />
                {models.length} registered
              </Badge>

              <Badge
                variant="outline"
                className="gap-1.5"
              >
                <CheckCircle2 className="size-3.5 text-cyan-600" />
                {activeCount} active
              </Badge>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  void modelsQuery.refetch()
                }
                disabled={
                  modelsQuery.isFetching
                }
              >
                <RefreshCw
                  className={cn(
                    "size-4",
                    modelsQuery.isFetching &&
                      "animate-spin",
                  )}
                />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          <RegistryStat
            icon={Database}
            label="Total models"
            value={models.length}
          />

          <RegistryStat
            icon={ShieldCheck}
            label="Hate speech"
            value={hateSpeechCount}
          />

          <RegistryStat
            icon={Activity}
            label="Sentiment"
            value={sentimentCount}
          />

          <RegistryStat
            icon={BrainCircuit}
            label="Explainable"
            value={explainableCount}
          />
        </div>
      </section>

      {modelsQuery.isPending ? (
        <ModelLoadingState />
      ) : null}

      {modelsQuery.isError ? (
        <ModelErrorState
          message={getApiErrorMessage(
            modelsQuery.error,
            "Unable to load the model registry.",
          )}
          onRetry={() =>
            void modelsQuery.refetch()
          }
        />
      ) : null}

      {!modelsQuery.isPending &&
      !modelsQuery.isError &&
      models.length === 0 ? (
        <ModelEmptyState />
      ) : null}

      {!modelsQuery.isPending &&
      !modelsQuery.isError &&
      models.length > 0 ? (
        <section>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                Registered models
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Read-only registry data returned by the
                BanglaGuard API.
              </p>
            </div>

            <p className="text-sm text-muted-foreground">
              Phase 17.1 · Read-only mode
            </p>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {models.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RegistryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-background p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {label}
          </p>

          <p className="mt-2 text-3xl font-bold">
            {value}
          </p>
        </div>

        <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
          <Icon className="size-5 text-emerald-600" />
        </div>
      </div>
    </div>
  );
}

function ModelCard({
  model,
}: {
  model: ModelVersionRead;
}) {
  const numericMetrics =
    extractNumericMetrics(model.metrics);

  return (
    <article className="overflow-hidden rounded-3xl border bg-background">
      <div className="border-b p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {formatTask(model.task)}
              </Badge>

              <Badge
                variant="outline"
                className={getStatusClasses(
                  model.status,
                )}
              >
                {formatWords(model.status)}
              </Badge>

              {model.is_explainable ? (
                <Badge
                  variant="outline"
                  className="gap-1.5"
                >
                  <Sparkles className="size-3" />
                  Explainable
                </Badge>
              ) : null}
            </div>

            <h2 className="mt-4 break-words text-xl font-semibold">
              {model.name}
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Version {model.version}
            </p>
          </div>

          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40">
            <BrainCircuit className="size-6 text-emerald-600" />
          </div>
        </div>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <InformationCard
            label="Architecture"
            value={getArchitectureLabel(
              model.architecture,
            )}
          />

          <InformationCard
            label="Model family"
            value={getArchitectureFamily(
              model.architecture,
            )}
          />

          <InformationCard
            label="Preprocessing"
            value={
              model.preprocessing_version ??
              "Not specified"
            }
          />

          <InformationCard
            label="Activated"
            value={formatDate(
              model.activated_at,
            )}
          />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <Gauge className="size-4 text-emerald-600" />

            <h3 className="text-sm font-semibold">
              Evaluation metrics
            </h3>
          </div>

          {numericMetrics.length > 0 ? (
            <div className="mt-4 space-y-4">
              {numericMetrics.map(
                (metric) => (
                  <div key={metric.key}>
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        {metric.label}
                      </span>

                      <span className="text-sm font-semibold">
                        {metric.percentage.toFixed(
                          1,
                        )}
                        %
                      </span>
                    </div>

                    <Progress
                      value={Math.min(
                        Math.max(
                          metric.percentage,
                          0,
                        ),
                        100,
                      )}
                    />
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed bg-muted/20 p-4">
              <p className="text-sm font-medium">
                No numeric metrics available
              </p>

              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                This model record does not yet include
                accuracy, precision, recall or F1 values.
              </p>
            </div>
          )}
        </div>

        {model.metrics ? (
          <MetricNotes metrics={model.metrics} />
        ) : null}

        <div className="grid gap-3 border-t pt-5 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 size-4 text-muted-foreground" />

            <div>
              <p className="text-xs text-muted-foreground">
                Registered
              </p>

              <p className="mt-1 text-sm font-medium">
                {formatDate(model.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <FlaskConical className="mt-0.5 size-4 text-muted-foreground" />

            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Model ID
              </p>

              <p className="mt-1 break-all text-sm font-medium">
                {model.id}
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function InformationCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border bg-muted/10 p-4">
      <p className="text-xs text-muted-foreground">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-semibold">
        {value}
      </p>
    </div>
  );
}

function MetricNotes({
  metrics,
}: {
  metrics: Record<string, unknown>;
}) {
  const notes = Object.entries(metrics)
    .filter(
      ([, value]) =>
        typeof value === "string",
    )
    .slice(0, 3);

  if (notes.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />

        <div>
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Registry notes
          </p>

          <div className="mt-2 space-y-1 text-xs leading-5 text-amber-800 dark:text-amber-200">
            {notes.map(([key, value]) => (
              <p key={key}>
                <span className="font-medium">
                  {formatWords(key)}:
                </span>{" "}
                {String(value)}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelLoadingState() {
  return (
    <section className="grid gap-5 xl:grid-cols-2">
      {[1, 2, 3, 4].map((item) => (
        <div
          key={item}
          className="animate-pulse rounded-3xl border bg-background p-6"
        >
          <div className="h-5 w-28 rounded bg-muted" />
          <div className="mt-5 h-7 w-2/3 rounded bg-muted" />
          <div className="mt-3 h-4 w-32 rounded bg-muted" />

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4].map(
              (card) => (
                <div
                  key={card}
                  className="h-20 rounded-2xl bg-muted"
                />
              ),
            )}
          </div>

          <div className="mt-7 h-4 w-36 rounded bg-muted" />
          <div className="mt-4 h-2 rounded bg-muted" />
          <div className="mt-4 h-2 rounded bg-muted" />
        </div>
      ))}
    </section>
  );
}

function ModelEmptyState() {
  return (
    <section className="flex min-h-80 items-center justify-center rounded-3xl border border-dashed bg-background p-8 text-center">
      <div>
        <FileQuestion className="mx-auto size-10 text-muted-foreground/60" />

        <h2 className="mt-5 text-lg font-semibold">
          No registered models
        </h2>

        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Train or register a Bangla NLP model before using
          the model registry.
        </p>
      </div>
    </section>
  );
}

function ModelErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="flex min-h-80 items-center justify-center rounded-3xl border border-destructive/30 bg-destructive/5 p-8 text-center">
      <div>
        <AlertTriangle className="mx-auto size-10 text-destructive" />

        <h2 className="mt-5 text-lg font-semibold">
          Model registry unavailable
        </h2>

        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          {message}
        </p>

        <Button
          type="button"
          variant="outline"
          className="mt-5"
          onClick={onRetry}
        >
          <RefreshCw className="size-4" />
          Try again
        </Button>
      </div>
    </section>
  );
}
