"use client";

import {
  BarChart3,
  BrainCircuit,
  Copy,
  Database,
  FlaskConical,
  FolderOpen,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
} from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

import type {
  ModelVersionRead,
} from "@/types/prediction";

type ModelDetailsPanelProps = {
  model: ModelVersionRead | null;
  open: boolean;
  onClose: () => void;
};

type DisplayMetric = {
  key: string;
  label: string;
  value: number;
};

const metricLabels:
  Record<string, string> = {
    accuracy: "Test accuracy",
    macro_precision: "Macro precision",
    macro_recall: "Macro recall",
    macro_f1: "Macro F1",
    weighted_f1: "Weighted F1",
    validation_accuracy:
      "Validation accuracy",
    validation_macro_f1:
      "Validation macro F1",
  };

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

function formatValue(
  value: unknown,
): string {
  if (value === null || value === undefined) {
    return "Not specified";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
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
      timeStyle: "short",
    },
  ).format(date);
}

function toPercentage(
  value: number,
): number {
  if (value >= 0 && value <= 1) {
    return value * 100;
  }

  return value;
}

export function ModelDetailsPanel({
  model,
  open,
  onClose,
}: ModelDetailsPanelProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const originalOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.body.style.overflow =
        originalOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [onClose, open]);

  const displayMetrics = useMemo<
    DisplayMetric[]
  >(() => {
    if (!model?.metrics) {
      return [];
    }

    return Object.entries(
      metricLabels,
    ).flatMap(([key, label]) => {
      const value = model.metrics?.[key];

      if (
        typeof value !== "number" ||
        !Number.isFinite(value)
      ) {
        return [];
      }

      return [
        {
          key,
          label,
          value,
        },
      ];
    });
  }, [model]);

  if (!open || !model) {
    return null;
  }

  const modelId = model.id;

  const warning =
    typeof model.metrics?.warning ===
    "string"
      ? model.metrics.warning
      : null;

  const configurationEntries =
    Object.entries(
      model.configuration ?? {},
    );

  async function copyModelId() {
    try {
      await navigator.clipboard.writeText(
        modelId,
      );

      toast.success("Model ID copied.");
    } catch {
      toast.error(
        "Unable to copy the model ID.",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={`${model.name} details`}
    >
      <button
        type="button"
        aria-label="Close model details"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l bg-background shadow-2xl">
        <header className="border-b px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {model.task ===
                  "hate_speech"
                    ? "Hate Speech"
                    : "Sentiment"}
                </Badge>

                <Badge variant="outline">
                  {formatWords(
                    model.status,
                  )}
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

              <h2 className="mt-4 break-words text-2xl font-bold">
                {model.name}
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Version {model.version}
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close details"
            >
              <X className="size-5" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          <div className="space-y-8">
            <DetailsSection
              icon={BrainCircuit}
              title="Model overview"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <InformationCard
                  label="Architecture"
                  value={formatWords(
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
                  label="Registered"
                  value={formatDate(
                    model.created_at,
                  )}
                />

                <InformationCard
                  label="Activated"
                  value={formatDate(
                    model.activated_at,
                  )}
                />
              </div>
            </DetailsSection>

            <DetailsSection
              icon={BarChart3}
              title="Evaluation dashboard"
            >
              {warning ? (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  {warning}
                </div>
              ) : null}

              {displayMetrics.length > 0 ? (
                <div className="space-y-4">
                  {displayMetrics.map(
                    (metric) => {
                      const percentage =
                        toPercentage(
                          metric.value,
                        );

                      return (
                        <div
                          key={metric.key}
                          className="rounded-xl border p-4"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-sm font-medium">
                              {metric.label}
                            </span>

                            <span className="font-semibold">
                              {percentage.toFixed(
                                1,
                              )}
                              %
                            </span>
                          </div>

                          <Progress
                            value={Math.min(
                              Math.max(
                                percentage,
                                0,
                              ),
                              100,
                            )}
                            className="mt-3"
                          />
                        </div>
                      );
                    },
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  No numeric evaluation
                  metrics are registered.
                </p>
              )}

              <EvaluationSummary
                metrics={model.metrics}
              />
            </DetailsSection>

            <DetailsSection
              icon={Settings2}
              title="Training configuration"
            >
              {configurationEntries.length >
              0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {configurationEntries.map(
                    ([key, value]) => (
                      <InformationCard
                        key={key}
                        label={formatWords(
                          key,
                        )}
                        value={formatValue(
                          value,
                        )}
                      />
                    ),
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  No training configuration
                  is registered.
                </p>
              )}
            </DetailsSection>

            <DetailsSection
              icon={FolderOpen}
              title="Artifact information"
            >
              <div className="space-y-3">
                <PathCard
                  label="Model artifact"
                  value={
                    model.artifact_path
                  }
                />

                <PathCard
                  label="Tokenizer"
                  value={
                    model.tokenizer_path ??
                    "Not applicable"
                  }
                />
              </div>
            </DetailsSection>

            <DetailsSection
              icon={Database}
              title="Registry identity"
            >
              <div className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      Model ID
                    </p>

                    <p className="mt-2 break-all font-mono text-sm">
                      {model.id}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyModelId}
                  >
                    <Copy className="size-4" />
                    Copy
                  </Button>
                </div>
              </div>
            </DetailsSection>

            <details className="rounded-xl border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                Raw registry metadata
              </summary>

              <pre className="overflow-x-auto border-t bg-muted/20 p-4 text-xs leading-6">
                {JSON.stringify(
                  model,
                  null,
                  2,
                )}
              </pre>
            </details>
          </div>
        </div>
      </aside>
    </div>
  );
}

function DetailsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof FlaskConical;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Icon className="size-4 text-emerald-600" />

        <h3 className="font-semibold">
          {title}
        </h3>
      </div>

      {children}
    </section>
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
    <div className="min-w-0 rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-semibold">
        {value}
      </p>
    </div>
  );
}

function PathCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FolderOpen className="size-3.5" />
        {label}
      </div>

      <p className="mt-2 break-all font-mono text-xs leading-6">
        {value}
      </p>
    </div>
  );
}

function EvaluationSummary({
  metrics,
}: {
  metrics: Record<
    string,
    unknown
  > | null;
}) {
  if (!metrics) {
    return null;
  }

  const items = [
    {
      label: "Training samples",
      value:
        metrics.training_samples,
    },
    {
      label: "Validation samples",
      value:
        metrics.validation_samples,
    },
    {
      label: "Test samples",
      value:
        metrics.evaluation_samples,
    },
    {
      label: "Evaluation split",
      value:
        metrics.evaluation_split,
    },
    {
      label: "Test loss",
      value: metrics.test_loss,
    },
    {
      label: "Train loss",
      value: metrics.train_loss,
    },
  ].filter(
    (item) =>
      item.value !== undefined &&
      item.value !== null,
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <InformationCard
          key={item.label}
          label={item.label}
          value={formatValue(
            item.value,
          )}
        />
      ))}
    </div>
  );
}
