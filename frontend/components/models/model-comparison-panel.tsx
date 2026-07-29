"use client";

import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  FlaskConical,
  GitCompareArrows,
  Layers3,
  X,
} from "lucide-react";
import { useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

import type {
  ModelVersionRead,
} from "@/types/prediction";

type ModelComparisonPanelProps = {
  models: ModelVersionRead[];
  open: boolean;
  onClose: () => void;
};

type MetricKey =
  | "accuracy"
  | "macro_precision"
  | "macro_recall"
  | "macro_f1"
  | "weighted_f1"
  | "validation_accuracy"
  | "validation_macro_f1";

const metricRows: Array<{
  key: MetricKey;
  label: string;
  description: string;
}> = [
  {
    key: "accuracy",
    label: "Test accuracy",
    description:
      "Overall proportion of correct test predictions.",
  },
  {
    key: "macro_precision",
    label: "Macro precision",
    description:
      "Average class precision with equal class weighting.",
  },
  {
    key: "macro_recall",
    label: "Macro recall",
    description:
      "Average class recall with equal class weighting.",
  },
  {
    key: "macro_f1",
    label: "Macro F1",
    description:
      "Balanced macro average of precision and recall.",
  },
  {
    key: "weighted_f1",
    label: "Weighted F1",
    description:
      "F1 score weighted by class support.",
  },
  {
    key: "validation_accuracy",
    label: "Validation accuracy",
    description:
      "Accuracy measured on the validation split.",
  },
  {
    key: "validation_macro_f1",
    label: "Validation macro F1",
    description:
      "Macro F1 measured on the validation split.",
  },
];

function formatWords(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function toPercentage(value: number): number {
  if (value >= 0 && value <= 1) {
    return value * 100;
  }

  return value;
}

function readNumber(
  model: ModelVersionRead,
  key: string,
): number | null {
  const value = model.metrics?.[key];

  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return value;
}

function readText(
  model: ModelVersionRead,
  key: string,
): string | null {
  const value = model.metrics?.[key];

  return typeof value === "string"
    ? value
    : null;
}

function bestMetricValue(
  models: ModelVersionRead[],
  key: string,
): number | null {
  const values = models
    .map((model) => readNumber(model, key))
    .filter(
      (value): value is number =>
        value !== null,
    );

  if (values.length === 0) {
    return null;
  }

  return Math.max(...values);
}

function isBestValue(
  value: number | null,
  bestValue: number | null,
): boolean {
  if (
    value === null ||
    bestValue === null
  ) {
    return false;
  }

  return Math.abs(
    value - bestValue,
  ) < 0.000001;
}

export function ModelComparisonPanel({
  models,
  open,
  onClose,
}: ModelComparisonPanelProps) {
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

  if (!open || models.length < 2) {
    return null;
  }

  const warnings = Array.from(
    new Set(
      models
        .map((model) =>
          readText(model, "warning"),
        )
        .filter(
          (warning): warning is string =>
            warning !== null,
        ),
    ),
  );

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Model comparison"
    >
      <button
        type="button"
        aria-label="Close model comparison"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <section className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-3xl border-t bg-background shadow-2xl">
        <header className="border-b px-5 py-5 sm:px-8">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                <GitCompareArrows className="size-4" />
                Research model comparison
              </div>

              <h2 className="mt-2 text-2xl font-bold">
                Compare model versions
              </h2>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Side-by-side comparison of registered
                architecture, configuration and evaluation
                evidence.
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close comparison"
            >
              <X className="size-5" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          <div className="space-y-8">
            {warnings.length > 0 ? (
              <section className="space-y-3">
                {warnings.map((warning) => (
                  <div
                    key={warning}
                    className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {warning}
                  </div>
                ))}
              </section>
            ) : null}

            <section>
              <ComparisonHeading
                icon={BrainCircuit}
                title="Selected models"
                description={`${models.length} compatible model versions selected.`}
              />

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                {models.map((model) => (
                  <article
                    key={model.id}
                    className="rounded-2xl border p-5"
                  >
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {model.task ===
                        "hate_speech"
                          ? "Hate Speech"
                          : "Sentiment"}
                      </Badge>

                      <Badge
                        variant="outline"
                        className={
                          model.status ===
                          "active"
                            ? "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                            : undefined
                        }
                      >
                        {formatWords(
                          model.status,
                        )}
                      </Badge>
                    </div>

                    <h3 className="mt-4 text-lg font-semibold">
                      {model.name}
                    </h3>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Version {model.version}
                    </p>

                    <div className="mt-5 space-y-3 text-sm">
                      <ComparisonValue
                        label="Architecture"
                        value={formatWords(
                          model.architecture,
                        )}
                      />

                      <ComparisonValue
                        label="Preprocessing"
                        value={
                          model.preprocessing_version ??
                          "Not specified"
                        }
                      />

                      <ComparisonValue
                        label="Explainable"
                        value={
                          model.is_explainable
                            ? "Yes"
                            : "No"
                        }
                      />
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section>
              <ComparisonHeading
                icon={BarChart3}
                title="Evaluation metrics"
                description="Higher values are highlighted as the strongest result among the selected models."
              />

              <div className="mt-4 overflow-x-auto rounded-2xl border">
                <table className="min-w-[900px] w-full border-collapse text-left">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="min-w-56 border-b p-4 text-sm font-semibold">
                        Metric
                      </th>

                      {models.map((model) => (
                        <th
                          key={model.id}
                          className="min-w-52 border-b p-4 text-sm font-semibold"
                        >
                          {model.name}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {metricRows.map((metric) => {
                      const bestValue =
                        bestMetricValue(
                          models,
                          metric.key,
                        );

                      return (
                        <tr
                          key={metric.key}
                          className="border-b last:border-b-0"
                        >
                          <td className="p-4 align-top">
                            <p className="text-sm font-medium">
                              {metric.label}
                            </p>

                            <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
                              {metric.description}
                            </p>
                          </td>

                          {models.map(
                            (model) => {
                              const value =
                                readNumber(
                                  model,
                                  metric.key,
                                );

                              const percentage =
                                value === null
                                  ? null
                                  : toPercentage(
                                      value,
                                    );

                              const best =
                                isBestValue(
                                  value,
                                  bestValue,
                                );

                              return (
                                <td
                                  key={model.id}
                                  className="p-4 align-top"
                                >
                                  {percentage ===
                                  null ? (
                                    <span className="text-sm text-muted-foreground">
                                      Not available
                                    </span>
                                  ) : (
                                    <div
                                      className={
                                        best
                                          ? "rounded-xl border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30"
                                          : "rounded-xl border p-3"
                                      }
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-lg font-semibold">
                                          {percentage.toFixed(
                                            1,
                                          )}
                                          %
                                        </span>

                                        {best ? (
                                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                                            Best
                                          </Badge>
                                        ) : null}
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
                                  )}
                                </td>
                              );
                            },
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <ComparisonHeading
                icon={Layers3}
                title="Dataset and training evidence"
                description="Sample counts and training metadata registered with each model version."
              />

              <div className="mt-4 overflow-x-auto rounded-2xl border">
                <table className="min-w-[900px] w-full border-collapse text-left">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="min-w-48 border-b p-4 text-sm font-semibold">
                        Evidence
                      </th>

                      {models.map((model) => (
                        <th
                          key={model.id}
                          className="min-w-52 border-b p-4 text-sm font-semibold"
                        >
                          {model.name}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {[
                      {
                        label:
                          "Training samples",
                        key:
                          "training_samples",
                      },
                      {
                        label:
                          "Validation samples",
                        key:
                          "validation_samples",
                      },
                      {
                        label:
                          "Test samples",
                        key:
                          "evaluation_samples",
                      },
                      {
                        label:
                          "Evaluation split",
                        key:
                          "evaluation_split",
                      },
                      {
                        label:
                          "Test loss",
                        key: "test_loss",
                      },
                      {
                        label:
                          "Training runtime",
                        key:
                          "training_runtime_seconds",
                      },
                    ].map((item) => (
                      <tr
                        key={item.key}
                        className="border-b last:border-b-0"
                      >
                        <td className="p-4 text-sm font-medium">
                          {item.label}
                        </td>

                        {models.map((model) => {
                          const value =
                            model.metrics?.[
                              item.key
                            ];

                          return (
                            <td
                              key={model.id}
                              className="p-4 text-sm"
                            >
                              {value ===
                                undefined ||
                              value === null
                                ? "Not available"
                                : item.key ===
                                    "training_runtime_seconds" &&
                                  typeof value ===
                                    "number"
                                  ? `${value.toFixed(
                                      2,
                                    )} seconds`
                                  : String(
                                      value,
                                    )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <ComparisonHeading
                icon={FlaskConical}
                title="Research interpretation"
                description="These results should be interpreted in the context of the recorded dataset size."
              />

              <div className="mt-4 rounded-2xl border bg-muted/20 p-5 text-sm leading-7 text-muted-foreground">
                A higher metric does not automatically prove
                that one model is generally superior. The
                current registered evaluations use extremely
                small validation and test splits. These scores
                demonstrate that the evaluation pipeline works,
                but they are not reliable enough for publication
                claims or real moderation decisions.
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}

function ComparisonHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof BarChart3;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
        <Icon className="size-5 text-emerald-600" />
      </div>

      <div>
        <h3 className="font-semibold">
          {title}
        </h3>

        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function ComparisonValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t pt-3 first:border-t-0 first:pt-0">
      <span className="text-muted-foreground">
        {label}
      </span>

      <span className="max-w-[60%] break-words text-right font-medium">
        {value}
      </span>
    </div>
  );
}
