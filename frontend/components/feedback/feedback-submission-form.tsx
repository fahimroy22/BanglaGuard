"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Loader2,
  Send,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";
import {
  useMutation,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getApiErrorMessage,
} from "@/lib/api";
import {
  createFeedback,
} from "@/lib/feedback";
import { cn } from "@/lib/utils";

import type {
  FeedbackRead,
  FeedbackVerdict,
} from "@/types/feedback";
import type {
  PredictionRead,
} from "@/types/prediction";

type FeedbackSubmissionFormProps = {
  prediction: PredictionRead;
  onSubmitted: (
    feedback: FeedbackRead,
  ) => Promise<void> | void;
};

type VerdictOption = {
  value: FeedbackVerdict;
  title: string;
  description: string;
  icon: typeof CheckCircle2;
};

const verdictOptions: VerdictOption[] = [
  {
    value: "correct",
    title: "Correct",
    description:
      "The model prediction is accurate.",
    icon: CheckCircle2,
  },
  {
    value: "incorrect",
    title: "Incorrect",
    description:
      "The predicted label should be changed.",
    icon: AlertTriangle,
  },
  {
    value: "unsure",
    title: "Unsure",
    description:
      "The text or prediction is ambiguous.",
    icon: CircleHelp,
  },
];

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

function getLabelOptions(
  prediction: PredictionRead,
): string[] {
  const probabilityLabels = Object.keys(
    prediction.probabilities ?? {},
  );

  if (probabilityLabels.length > 0) {
    return Array.from(
      new Set([
        ...probabilityLabels,
        prediction.predicted_label,
      ]),
    );
  }

  if (
    prediction.task ===
    "hate_speech"
  ) {
    return [
      "hateful",
      "offensive",
      "non_hateful",
    ];
  }

  return [
    "positive",
    "negative",
    "neutral",
  ];
}

export function FeedbackSubmissionForm({
  prediction,
  onSubmitted,
}: FeedbackSubmissionFormProps) {
  const [verdict, setVerdict] =
    useState<FeedbackVerdict | null>(
      null,
    );

  const [
    correctedLabel,
    setCorrectedLabel,
  ] = useState("");

  const [comment, setComment] =
    useState("");

  const labelOptions = useMemo(
    () =>
      getLabelOptions(
        prediction,
      ),
    [prediction],
  );

  const mutation = useMutation({
    mutationFn: createFeedback,

    onSuccess: async (
      createdFeedback,
    ) => {
      toast.success(
        "Feedback submitted successfully.",
      );

      await onSubmitted(
        createdFeedback,
      );
    },

    onError: (error) => {
      toast.error(
        getApiErrorMessage(
          error,
          "Unable to submit feedback.",
        ),
      );
    },
  });

  const trimmedComment =
    comment.trim();

  const canSubmit =
    verdict !== null &&
    !mutation.isPending &&
    (
      verdict !== "incorrect" ||
      correctedLabel.trim().length > 0
    );

  function submitFeedback() {
    if (!verdict) {
      toast.error(
        "Select a feedback verdict.",
      );

      return;
    }

    if (
      verdict === "incorrect" &&
      !correctedLabel.trim()
    ) {
      toast.error(
        "Select the correct label.",
      );

      return;
    }

    mutation.mutate({
      prediction_id:
        prediction.id,
      verdict,
      corrected_label:
        verdict === "incorrect"
          ? correctedLabel.trim()
          : null,
      comment:
        trimmedComment ||
        null,
    });
  }

  return (
    <section className="rounded-lg border p-5">
      <div>
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Human evaluation
        </p>

        <h3 className="mt-1 text-lg font-semibold">
          Is this prediction correct?
        </h3>

        <p className="mt-2 text-sm text-muted-foreground">
          Your response will be stored
          as research feedback and can
          later support error analysis
          and model retraining.
        </p>
      </div>

      <div
        className="mt-5 grid gap-3"
        role="radiogroup"
        aria-label="Feedback verdict"
      >
        {verdictOptions.map(
          (option) => {
            const Icon =
              option.icon;

            const isSelected =
              verdict ===
              option.value;

            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={
                  isSelected
                }
                disabled={
                  mutation.isPending
                }
                onClick={() => {
                  setVerdict(
                    option.value,
                  );

                  if (
                    option.value !==
                    "incorrect"
                  ) {
                    setCorrectedLabel(
                      "",
                    );
                  }
                }}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-4 text-left transition",
                  "hover:border-emerald-300 hover:bg-emerald-50/60",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  "dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20",
                  isSelected &&
                    "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 dark:bg-emerald-950/30",
                )}
              >
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground",
                    isSelected &&
                      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
                  )}
                >
                  <Icon className="size-5" />
                </div>

                <div>
                  <p className="font-semibold">
                    {option.title}
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {
                      option.description
                    }
                  </p>
                </div>
              </button>
            );
          },
        )}
      </div>

      {verdict === "incorrect" && (
        <div className="mt-5">
          <label
            htmlFor="feedback-corrected-label"
            className="text-sm font-medium"
          >
            Correct label
            <span className="ml-1 text-red-600">
              *
            </span>
          </label>

          <p className="mt-1 text-xs text-muted-foreground">
            Select the label that should
            replace{" "}
            <strong>
              {formatWords(
                prediction
                  .predicted_label,
              )}
            </strong>
            .
          </p>

          <select
            id="feedback-corrected-label"
            value={correctedLabel}
            disabled={
              mutation.isPending
            }
            onChange={(event) =>
              setCorrectedLabel(
                event.target.value,
              )
            }
            className="mt-3 gh-input w-full"
          >
            <option value="">
              Select a corrected label
            </option>

            {labelOptions.map(
              (label) => (
                <option
                  key={label}
                  value={label}
                >
                  {formatWords(
                    label,
                  )}
                </option>
              ),
            )}
          </select>
        </div>
      )}

      <div className="mt-5">
        <div className="flex items-center justify-between gap-4">
          <label
            htmlFor="feedback-comment"
            className="text-sm font-medium"
          >
            Research comment
          </label>

          <span className="text-xs text-muted-foreground">
            {comment.length}/2000
          </span>
        </div>

        <textarea
          id="feedback-comment"
          value={comment}
          disabled={
            mutation.isPending
          }
          maxLength={2000}
          rows={5}
          onChange={(event) =>
            setComment(
              event.target.value,
            )
          }
          placeholder="Optional: explain why the prediction is correct, incorrect, or uncertain..."
          className="mt-3 w-full resize-y rounded-xl border bg-background px-3 py-3 text-sm"
        />
      </div>

      <div className="mt-5 rounded-xl border bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground">
          Prediction ID
        </p>

        <p className="mt-1 break-all font-mono text-xs">
          {prediction.id}
        </p>
      </div>

      <Button
        type="button"
        className="mt-5 w-full"
        disabled={!canSubmit}
        onClick={submitFeedback}
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Submitting feedback
          </>
        ) : (
          <>
            <Send className="mr-2 size-4" />
            Submit feedback
          </>
        )}
      </Button>
    </section>
  );
}
