"use client";

import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Copy,
  Eraser,
  FileText,
  FlaskConical,
  History,
  Languages,
  LoaderCircle,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api";
import {
  createPrediction,
  listModelVersions,
  listPredictions,
} from "@/lib/predictions";
import { cn } from "@/lib/utils";

import type {
  AnalysisTask,
  ModelVersionRead,
  PredictionRead,
} from "@/types/prediction";

type ResultTab =
  | "overview"
  | "probabilities"
  | "explanation"
  | "metadata";

type ExplanationToken = {
  token: string;
  score: number;
};

const examples = [
  {
    label: "Neutral example",
    task: "sentiment" as const,
    text: "আজকের গবেষণা সভাটি বিকেল তিনটায় অনুষ্ঠিত হবে।",
  },
  {
    label: "Positive sentiment",
    task: "sentiment" as const,
    text: "এই প্রকল্পের ফলাফল সত্যিই অসাধারণ এবং খুবই আশাব্যঞ্জক।",
  },
  {
    label: "Negative sentiment",
    task: "sentiment" as const,
    text: "সেবাটির মান খুব খারাপ এবং আমি সম্পূর্ণ হতাশ।",
  },
  {
    label: "Potential hate speech",
    task: "hate_speech" as const,
    text: "এই মানুষগুলোকে সমাজ থেকে বের করে দেওয়া উচিত।",
  },
];

function toPercentage(value: number): number {
  if (value <= 1) {
    return value * 100;
  }

  return value;
}

function formatLabel(label: string): string {
  return label
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(new Date(value));
}

function getTokenClass(score: number) {
  const absoluteScore = Math.abs(score);

  if (absoluteScore >= 0.8) {
    return "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-900 dark:bg-rose-950/70 dark:text-rose-200";
  }

  if (absoluteScore >= 0.55) {
    return "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-900 dark:bg-orange-950/70 dark:text-orange-200";
  }

  if (absoluteScore >= 0.3) {
    return "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950/70 dark:text-amber-200";
  }

  return "border-border bg-muted text-muted-foreground";
}

function extractExplanationTokens(
  explanation: Record<string, unknown> | null,
): ExplanationToken[] {
  if (!explanation) {
    return [];
  }

  const tokenCollections = [
    explanation.tokens,
    explanation.token_scores,
    explanation.attributions,
    explanation.features,
  ];

  for (const collection of tokenCollections) {
    if (Array.isArray(collection)) {
      const parsed = collection
        .map((item): ExplanationToken | null => {
          if (
            typeof item === "object" &&
            item !== null
          ) {
            const record =
              item as Record<string, unknown>;

            const token =
              record.token ??
              record.word ??
              record.feature ??
              record.text;

            const score =
              record.score ??
              record.weight ??
              record.importance ??
              record.attribution;

            if (
              typeof token === "string" &&
              typeof score === "number"
            ) {
              return {
                token,
                score,
              };
            }
          }

          return null;
        })
        .filter(
          (
            item,
          ): item is ExplanationToken =>
            item !== null,
        );

      if (parsed.length > 0) {
        return parsed;
      }
    }

    if (
      typeof collection === "object" &&
      collection !== null &&
      !Array.isArray(collection)
    ) {
      const parsed = Object.entries(
        collection as Record<string, unknown>,
      )
        .filter(
          (
            entry,
          ): entry is [string, number] =>
            typeof entry[1] === "number",
        )
        .map(([token, score]) => ({
          token,
          score,
        }));

      if (parsed.length > 0) {
        return parsed;
      }
    }
  }

  return [];
}

function getModelLabel(
  model: ModelVersionRead | undefined,
): string {
  if (!model) {
    return "Active model";
  }

  return `${model.name} v${model.version}`;
}

export function PredictionWorkspace() {
  const queryClient = useQueryClient();

  const [text, setText] = useState("");
  const [task, setTask] =
    useState<AnalysisTask>("hate_speech");

  const [modelVersionId, setModelVersionId] =
    useState("");

  const [
    includeExplanation,
    setIncludeExplanation,
  ] = useState(true);

  const [result, setResult] =
    useState<PredictionRead | null>(null);

  const [activeTab, setActiveTab] =
    useState<ResultTab>("overview");

  const characterCount = text.length;

  const wordCount = useMemo(() => {
    const trimmed = text.trim();

    return trimmed
      ? trimmed.split(/\s+/).length
      : 0;
  }, [text]);

  const modelsQuery = useQuery({
    queryKey: ["model-versions"],
    queryFn: listModelVersions,
    staleTime: 60_000,
  });

  const historyQuery = useQuery({
    queryKey: ["predictions", 10, 0],
    queryFn: () => listPredictions(10, 0),
    staleTime: 15_000,
  });

  const availableModels = useMemo(
    () =>
      (modelsQuery.data ?? []).filter(
        (model) => model.task === task,
      ),
    [modelsQuery.data, task],
  );

  const selectedModel =
    availableModels.find(
      (model) => model.id === modelVersionId,
    );

  const resultModel =
    modelsQuery.data?.find(
      (model) =>
        model.id === result?.model_version_id,
    );

  const predictionMutation = useMutation({
    mutationFn: createPrediction,

    onSuccess: async (prediction) => {
      setResult(prediction);
      setActiveTab("overview");

      toast.success("Bangla text analysed.", {
        description:
          "The result was returned by the live prediction API.",
      });

      await queryClient.invalidateQueries({
        queryKey: ["predictions"],
      });
    },

    onError: (error) => {
      toast.error("Prediction failed.", {
        description: getApiErrorMessage(
          error,
          "Unable to analyse the Bangla text.",
        ),
      });
    },
  });

  const isAnalysing =
    predictionMutation.isPending;

  const canSubmit =
    text.trim().length >= 1 &&
    !isAnalysing;

  function handleClear() {
    setText("");
    setResult(null);
    setActiveTab("overview");
  }

  function handleReset() {
    setText("");
    setTask("hate_speech");
    setModelVersionId("");
    setIncludeExplanation(true);
    setResult(null);
    setActiveTab("overview");

    toast.success("Prediction workspace reset.");
  }

  function handleExample(
    exampleText: string,
    exampleTask: AnalysisTask,
  ) {
    setText(exampleText);
    setTask(exampleTask);
    setModelVersionId("");
    setResult(null);
  }

  function handleTaskChange(
    nextTask: AnalysisTask,
  ) {
    setTask(nextTask);
    setModelVersionId("");
    setResult(null);
  }

  function handleAnalyse() {
    const normalizedInput = text.trim();

    if (!normalizedInput) {
      toast.error("Enter Bangla text to analyse.");
      return;
    }

    predictionMutation.mutate({
      text: normalizedInput,
      task,
      model_version_id:
        modelVersionId || null,
      include_explanation:
        includeExplanation,
    });
  }

  async function handleCopyResult() {
    if (!result) {
      return;
    }

    const copiedResult = [
      `Task: ${formatLabel(result.task)}`,
      `Label: ${formatLabel(
        result.predicted_label,
      )}`,
      `Confidence: ${toPercentage(
        result.confidence,
      ).toFixed(1)}%`,
      `Model: ${getModelLabel(resultModel)}`,
      `Prediction ID: ${result.id}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(
        copiedResult,
      );

      toast.success("Result copied.");
    } catch {
      toast.error("Unable to copy the result.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border bg-background">
        <div className="border-b bg-gradient-to-r from-emerald-50 via-background to-cyan-50 px-6 py-7 dark:from-emerald-950/30 dark:via-background dark:to-cyan-950/30 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <BrainCircuit className="size-4" />
                Live explainable Bangla inference
              </div>

              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Prediction workspace
              </h1>

              <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
                Analyse Bangla text using active or explicitly
                selected model versions and inspect the real
                prediction returned by FastAPI.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1.5"
              >
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                Live API
              </Badge>

              <Badge
                variant="outline"
                className="gap-1.5"
              >
                <FlaskConical className="size-3.5 text-cyan-600" />
                {modelsQuery.data?.length ?? 0} models
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="border-b p-6 sm:p-8 xl:border-b-0 xl:border-r">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  Bangla text input
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Enter a Bangla sentence, paragraph, comment,
                  or article excerpt.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                  disabled={!text && !result}
                >
                  <Eraser className="size-4" />
                  Clear
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                >
                  <RotateCcw className="size-4" />
                  Reset
                </Button>
              </div>
            </div>

            <div className="relative mt-5">
              <Textarea
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setResult(null);
                }}
                lang="bn"
                dir="auto"
                placeholder="এখানে বাংলা টেক্সট লিখুন অথবা পেস্ট করুন..."
                className="min-h-64 resize-y p-5 text-base leading-8 sm:min-h-72"
                maxLength={5000}
              />

              <div className="pointer-events-none absolute bottom-4 right-4 rounded-md border bg-background/90 px-2 py-1 text-xs text-muted-foreground backdrop-blur">
                বাংলা
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <span>
                  {characterCount} / 5000 characters
                </span>

                <span>{wordCount} words</span>
              </div>

              <span>
                Minimum backend input: 1 character
              </span>
            </div>

            <div className="mt-6">
              <p className="text-sm font-medium">
                Example inputs
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {examples.map((example) => (
                  <button
                    key={example.label}
                    type="button"
                    onClick={() =>
                      handleExample(
                        example.text,
                        example.task,
                      )
                    }
                    className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="bg-muted/20 p-6 sm:p-8">
            <div>
              <h2 className="text-lg font-semibold">
                Analysis configuration
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Select one backend-supported task and a
                compatible model.
              </p>
            </div>

            <div className="mt-6 space-y-6">
              <div className="space-y-2">
                <label
                  htmlFor="analysis-task"
                  className="text-sm font-medium"
                >
                  Analysis task
                </label>

                <div className="relative">
                  <select
                    id="analysis-task"
                    value={task}
                    onChange={(event) =>
                      handleTaskChange(
                        event.target
                          .value as AnalysisTask,
                      )
                    }
                    className="h-11 w-full appearance-none rounded-lg border bg-background px-3 pr-10 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="hate_speech">
                      Hate-speech detection
                    </option>

                    <option value="sentiment">
                      Sentiment analysis
                    </option>
                  </select>

                  <Languages className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="model-choice"
                  className="text-sm font-medium"
                >
                  Model version
                </label>

                <div className="relative">
                  <select
                    id="model-choice"
                    value={modelVersionId}
                    onChange={(event) =>
                      setModelVersionId(
                        event.target.value,
                      )
                    }
                    disabled={modelsQuery.isLoading}
                    className="h-11 w-full appearance-none rounded-lg border bg-background px-3 pr-10 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
                  >
                    <option value="">
                      Active model for this task
                    </option>

                    {availableModels.map((model) => (
                      <option
                        key={model.id}
                        value={model.id}
                      >
                        {model.name} v{model.version}
                        {model.status === "active"
                          ? " — Active"
                          : ""}
                      </option>
                    ))}
                  </select>

                  <FlaskConical className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                </div>

                {modelsQuery.isError ? (
                  <p className="text-xs text-destructive">
                    Model versions could not be loaded.
                    Active-model inference remains available.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {modelVersionId
                      ? getModelLabel(selectedModel)
                      : "The backend will select the active model."}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border bg-background p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      Include explanation
                    </p>

                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Request explanation data when the selected
                      model supports it.
                    </p>
                  </div>

                  <Switch
                    checked={includeExplanation}
                    onCheckedChange={
                      setIncludeExplanation
                    }
                    aria-label="Include explanation"
                  />
                </div>

                <div className="mt-4 border-t pt-4">
                  <div className="flex items-start gap-3">
                    <History className="mt-0.5 size-4 text-emerald-600" />

                    <div>
                      <p className="text-sm font-medium">
                        Stored automatically
                      </p>

                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        The current backend stores every
                        successful prediction for history,
                        analytics, and feedback.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />

                  <p className="text-xs leading-5 text-amber-800 dark:text-amber-200">
                    Predictions are research outputs and may
                    contain errors. Do not use them as the sole
                    basis for decisions affecting people.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                className="h-12 w-full"
                disabled={!canSubmit}
                onClick={handleAnalyse}
              >
                {isAnalysing ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Analysing Bangla text
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    Analyse text
                  </>
                )}
              </Button>
            </div>
          </aside>
        </div>
      </section>

      {isAnalysing ? (
        <AnalysisLoadingState />
      ) : null}

      {result && !isAnalysing ? (
        <section className="overflow-hidden rounded-3xl border bg-background">
          <div className="flex flex-col gap-4 border-b px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="size-4 text-emerald-600" />

                <h2 className="text-lg font-semibold">
                  Live analysis result
                </h2>

                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                  {formatLabel(result.status)}
                </Badge>
              </div>

              <p className="mt-1 text-sm text-muted-foreground">
                Real prediction returned by the BanglaGuard API
                using {getModelLabel(resultModel)}.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyResult}
            >
              <Copy className="size-4" />
              Copy result
            </Button>
          </div>

          <ResultTabs
            activeTab={activeTab}
            onChange={setActiveTab}
          />

          <div className="p-6 sm:p-8">
            {activeTab === "overview" ? (
              <OverviewResult result={result} />
            ) : null}

            {activeTab === "probabilities" ? (
              <ProbabilityResult
                probabilities={
                  result.probabilities
                }
              />
            ) : null}

            {activeTab === "explanation" ? (
              <ExplanationResult
                explanation={result.explanation}
                requested={includeExplanation}
              />
            ) : null}

            {activeTab === "metadata" ? (
              <MetadataResult
                result={result}
                model={resultModel}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      <PredictionHistory
        predictions={historyQuery.data ?? []}
        loading={historyQuery.isLoading}
        error={historyQuery.isError}
      />
    </div>
  );
}

function ResultTabs({
  activeTab,
  onChange,
}: {
  activeTab: ResultTab;
  onChange: (tab: ResultTab) => void;
}) {
  const tabs: Array<{
    value: ResultTab;
    label: string;
  }> = [
    {
      value: "overview",
      label: "Overview",
    },
    {
      value: "probabilities",
      label: "Probabilities",
    },
    {
      value: "explanation",
      label: "Explanation",
    },
    {
      value: "metadata",
      label: "Metadata",
    },
  ];

  return (
    <div className="border-b px-4 sm:px-6">
      <div
        className="flex gap-1 overflow-x-auto"
        role="tablist"
        aria-label="Prediction result sections"
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={
              activeTab === tab.value
            }
            onClick={() =>
              onChange(tab.value)
            }
            className={cn(
              "border-b-2 px-4 py-3 text-sm font-medium transition",
              activeTab === tab.value
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-300"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AnalysisLoadingState() {
  return (
    <section className="rounded-3xl border bg-background p-8">
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/50">
          <LoaderCircle className="size-6 animate-spin text-emerald-600" />
        </div>

        <h2 className="mt-5 text-lg font-semibold">
          Running live model inference
        </h2>

        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          The API is preprocessing the Bangla input and running
          the selected prediction model.
        </p>
      </div>
    </section>
  );
}

function OverviewResult({
  result,
}: {
  result: PredictionRead;
}) {
  const confidence =
    toPercentage(result.confidence);

  const isHateTask =
    result.task === "hate_speech";

  return (
    <article className="rounded-2xl border p-5">
      <div className="flex items-center justify-between gap-4">
        <div
          className={cn(
            "flex size-11 items-center justify-center rounded-xl",
            isHateTask
              ? "bg-rose-50 dark:bg-rose-950/40"
              : "bg-amber-50 dark:bg-amber-950/40",
          )}
        >
          {isHateTask ? (
            <ShieldAlert className="size-5 text-rose-600" />
          ) : (
            <BrainCircuit className="size-5 text-amber-600" />
          )}
        </div>

        <Badge variant="outline">
          {confidence >= 80
            ? "High confidence"
            : confidence >= 60
              ? "Moderate confidence"
              : "Low confidence"}
        </Badge>
      </div>

      <p className="mt-5 text-sm text-muted-foreground">
        {isHateTask
          ? "Hate-speech classification"
          : "Sentiment classification"}
      </p>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h3 className="text-2xl font-bold">
          {formatLabel(
            result.predicted_label,
          )}
        </h3>

        <span className="text-3xl font-bold">
          {confidence.toFixed(1)}%
        </span>
      </div>

      <Progress
        value={Math.min(confidence, 100)}
        className="mt-5"
      />

      {result.error_message ? (
        <p className="mt-4 text-sm text-destructive">
          {result.error_message}
        </p>
      ) : (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          This label and confidence score were returned by the
          selected backend model.
        </p>
      )}
    </article>
  );
}

function ProbabilityResult({
  probabilities,
}: {
  probabilities: Record<string, number> | null;
}) {
  const entries = Object.entries(
    probabilities ?? {},
  ).sort((left, right) => right[1] - left[1]);

  if (entries.length === 0) {
    return (
      <EmptyResultMessage
        icon={BarChart3}
        title="No probability distribution"
        description="The selected model did not return class probabilities."
      />
    );
  }

  return (
    <div>
      <h3 className="font-semibold">
        Class probability distribution
      </h3>

      <p className="mt-1 text-sm text-muted-foreground">
        Real class scores returned by the selected model.
      </p>

      <div className="mt-6 space-y-5">
        {entries.map(([label, value]) => {
          const percentage =
            toPercentage(value);

          return (
            <div key={label}>
              <div className="mb-2 flex items-center justify-between gap-4">
                <span className="text-sm font-medium">
                  {formatLabel(label)}
                </span>

                <span className="text-sm font-semibold">
                  {percentage.toFixed(1)}%
                </span>
              </div>

              <Progress
                value={Math.min(
                  percentage,
                  100,
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExplanationResult({
  explanation,
  requested,
}: {
  explanation: Record<string, unknown> | null;
  requested: boolean;
}) {
  if (!requested) {
    return (
      <EmptyResultMessage
        icon={BrainCircuit}
        title="Explanation was not requested"
        description="Enable the explanation option before running inference."
      />
    );
  }

  if (!explanation) {
    return (
      <EmptyResultMessage
        icon={BrainCircuit}
        title="No explanation returned"
        description="The selected model or artifact does not currently provide explanation data."
      />
    );
  }

  const tokens =
    extractExplanationTokens(explanation);

  return (
    <div>
      <h3 className="font-semibold">
        Model explanation
      </h3>

      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Explanation data returned by the live backend model.
      </p>

      {tokens.length > 0 ? (
        <div
          lang="bn"
          className="mt-6 flex flex-wrap gap-2 rounded-2xl border bg-muted/20 p-5"
        >
          {tokens.map((item, index) => (
            <span
              key={`${item.token}-${index}`}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium",
                getTokenClass(item.score),
              )}
              title={`Contribution: ${(
                item.score * 100
              ).toFixed(1)}%`}
            >
              {item.token}
            </span>
          ))}
        </div>
      ) : (
        <pre className="mt-6 max-h-96 overflow-auto rounded-2xl border bg-muted/30 p-5 text-xs leading-6">
          {JSON.stringify(
            explanation,
            null,
            2,
          )}
        </pre>
      )}
    </div>
  );
}

function MetadataResult({
  result,
  model,
}: {
  result: PredictionRead;
  model: ModelVersionRead | undefined;
}) {
  const metadata = [
    {
      label: "Prediction ID",
      value: result.id,
    },
    {
      label: "Task",
      value: formatLabel(result.task),
    },
    {
      label: "Model",
      value: getModelLabel(model),
    },
    {
      label: "Architecture",
      value:
        model?.architecture ?? "Unknown",
    },
    {
      label: "Inference latency",
      value:
        result.latency_ms === null
          ? "Unavailable"
          : `${result.latency_ms.toFixed(
              3,
            )} ms`,
    },
    {
      label: "Language form",
      value:
        result.language_form ??
        "Unavailable",
    },
    {
      label: "Stored",
      value: "Yes",
    },
    {
      label: "Created",
      value: formatDate(result.created_at),
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {metadata.map((item) => (
        <div
          key={item.label}
          className="min-w-0 rounded-2xl border p-4"
        >
          <p className="text-xs text-muted-foreground">
            {item.label}
          </p>

          <p className="mt-2 break-words font-semibold">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function PredictionHistory({
  predictions,
  loading,
  error,
}: {
  predictions: PredictionRead[];
  loading: boolean;
  error: boolean;
}) {
  return (
    <section className="rounded-3xl border bg-background p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <History className="size-5 text-emerald-600" />

            <h2 className="text-lg font-semibold">
              Recent predictions
            </h2>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            The latest stored prediction records from your
            account.
          </p>
        </div>

        <Badge variant="outline">
          {predictions.length} records
        </Badge>
      </div>

      {loading ? (
        <div className="mt-6 flex min-h-40 items-center justify-center">
          <LoaderCircle className="size-6 animate-spin text-emerald-600" />
        </div>
      ) : error ? (
        <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          Prediction history could not be loaded.
        </div>
      ) : predictions.length === 0 ? (
        <div className="mt-6 flex min-h-40 items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
          <div>
            <FileText className="mx-auto size-8 text-muted-foreground/60" />

            <p className="mt-4 font-medium">
              No prediction history yet
            </p>

            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Submit an analysis to create the first stored
              research record.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border">
          <div className="divide-y">
            {predictions.map((prediction) => (
              <article
                key={prediction.id}
                className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {formatLabel(
                        prediction.task,
                      )}
                    </Badge>

                    <span className="text-sm font-semibold">
                      {formatLabel(
                        prediction.predicted_label,
                      )}
                    </span>

                    <span className="text-sm text-muted-foreground">
                      {toPercentage(
                        prediction.confidence,
                      ).toFixed(1)}
                      %
                    </span>
                  </div>

                  <p
                    lang="bn"
                    className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground"
                  >
                    {prediction.input_text ??
                      prediction.normalized_text ??
                      "Prediction text storage is disabled."}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground sm:justify-end">
                    <Clock3 className="size-3.5" />
                    {formatDate(
                      prediction.created_at,
                    )}
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {prediction.latency_ms === null
                      ? "Latency unavailable"
                      : `${prediction.latency_ms.toFixed(
                          1,
                        )} ms`}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function EmptyResultMessage({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof BrainCircuit;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-52 items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
      <div>
        <Icon className="mx-auto size-8 text-muted-foreground/60" />

        <p className="mt-4 font-medium">
          {title}
        </p>

        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
