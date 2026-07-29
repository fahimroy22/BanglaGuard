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
  MessageSquareText,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type AnalysisTask =
  | "hate_speech"
  | "sentiment"
  | "both";

type ModelChoice =
  | "active"
  | "banglabert"
  | "baseline";

type ResultTab =
  | "overview"
  | "probabilities"
  | "explanation"
  | "metadata";

const examples = [
  {
    label: "Neutral example",
    text: "আজকের গবেষণা সভাটি বিকেল তিনটায় অনুষ্ঠিত হবে।",
  },
  {
    label: "Positive sentiment",
    text: "এই প্রকল্পের ফলাফল সত্যিই অসাধারণ এবং খুবই আশাব্যঞ্জক।",
  },
  {
    label: "Negative sentiment",
    text: "সেবাটির মান খুব খারাপ এবং আমি সম্পূর্ণ হতাশ।",
  },
  {
    label: "Potential hate speech",
    text: "এই মানুষগুলোকে সমাজ থেকে বের করে দেওয়া উচিত।",
  },
];

const mockProbabilities = [
  {
    label: "Hate speech",
    value: 92.8,
  },
  {
    label: "Non-hate",
    value: 7.2,
  },
  {
    label: "Negative",
    value: 78.4,
  },
  {
    label: "Neutral",
    value: 15.1,
  },
  {
    label: "Positive",
    value: 6.5,
  },
];

const explanationTokens = [
  {
    token: "এই",
    score: 0.08,
  },
  {
    token: "মানুষগুলোকে",
    score: 0.52,
  },
  {
    token: "সমাজ",
    score: 0.61,
  },
  {
    token: "থেকে",
    score: 0.43,
  },
  {
    token: "বের",
    score: 0.81,
  },
  {
    token: "করে",
    score: 0.69,
  },
  {
    token: "দেওয়া",
    score: 0.76,
  },
  {
    token: "উচিত",
    score: 0.88,
  },
];

function getTokenClass(score: number) {
  if (score >= 0.8) {
    return "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-900 dark:bg-rose-950/70 dark:text-rose-200";
  }

  if (score >= 0.55) {
    return "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-900 dark:bg-orange-950/70 dark:text-orange-200";
  }

  if (score >= 0.3) {
    return "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950/70 dark:text-amber-200";
  }

  return "border-border bg-muted text-muted-foreground";
}

export function PredictionWorkspace() {
  const [text, setText] = useState("");
  const [task, setTask] =
    useState<AnalysisTask>("both");
  const [model, setModel] =
    useState<ModelChoice>("active");
  const [includeExplanation, setIncludeExplanation] =
    useState(true);
  const [storePrediction, setStorePrediction] =
    useState(true);
  const [isAnalysing, setIsAnalysing] =
    useState(false);
  const [hasResult, setHasResult] =
    useState(false);
  const [activeTab, setActiveTab] =
    useState<ResultTab>("overview");

  const characterCount = text.length;
  const wordCount = useMemo(() => {
    const trimmed = text.trim();

    if (!trimmed) {
      return 0;
    }

    return trimmed.split(/\s+/).length;
  }, [text]);

  const canSubmit =
    text.trim().length >= 3 &&
    !isAnalysing;

  function handleClear() {
    setText("");
    setHasResult(false);
    setActiveTab("overview");
  }

  function handleReset() {
    setText("");
    setTask("both");
    setModel("active");
    setIncludeExplanation(true);
    setStorePrediction(true);
    setHasResult(false);
    setActiveTab("overview");

    toast.success("Prediction workspace reset.");
  }

  function handleExample(exampleText: string) {
    setText(exampleText);
    setHasResult(false);
  }

  async function handleAnalyse() {
    if (!canSubmit) {
      toast.error("Enter at least three characters.");
      return;
    }

    setIsAnalysing(true);
    setHasResult(false);

    /*
     * Temporary simulation for Phase 16.1.
     * Phase 16.2 will replace this timeout with the
     * real FastAPI prediction request.
     */
    await new Promise((resolve) =>
      window.setTimeout(resolve, 900),
    );

    setIsAnalysing(false);
    setHasResult(true);
    setActiveTab("overview");

    toast.success("Bangla text analysed.", {
      description:
        "Showing temporary research preview results.",
    });
  }

  async function handleCopyResult() {
    const result =
      "Hate speech: 92.8%\nSentiment: Negative\nModel: BanglaBERT";

    try {
      await navigator.clipboard.writeText(result);
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
                Explainable Bangla inference
              </div>

              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Prediction workspace
              </h1>

              <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
                Analyse Bangla text for hate speech and
                sentiment, inspect confidence scores, compare
                probabilities, and review model explanations.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1.5"
              >
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                API ready
              </Badge>

              <Badge
                variant="outline"
                className="gap-1.5"
              >
                <FlaskConical className="size-3.5 text-cyan-600" />
                Research mode
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
                  Paste or type a Bangla sentence, paragraph,
                  comment, or article excerpt.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                  disabled={!text && !hasResult}
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
                  setHasResult(false);
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
                <span>{characterCount} / 5000 characters</span>
                <span>{wordCount} words</span>
              </div>

              <span>
                Minimum input: 3 characters
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
                      handleExample(example.text)
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
                Select the task, model, and research-output
                options.
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
                      setTask(
                        event.target
                          .value as AnalysisTask,
                      )
                    }
                    className="h-11 w-full appearance-none rounded-lg border bg-background px-3 pr-10 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="both">
                      Hate speech and sentiment
                    </option>
                    <option value="hate_speech">
                      Hate speech only
                    </option>
                    <option value="sentiment">
                      Sentiment only
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
                    value={model}
                    onChange={(event) =>
                      setModel(
                        event.target
                          .value as ModelChoice,
                      )
                    }
                    className="h-11 w-full appearance-none rounded-lg border bg-background px-3 pr-10 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="active">
                      Active production model
                    </option>
                    <option value="banglabert">
                      BanglaBERT classifier
                    </option>
                    <option value="baseline">
                      TF-IDF logistic regression
                    </option>
                  </select>

                  <FlaskConical className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border bg-background p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      Include explanation
                    </p>

                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Request token-level model contribution
                      scores.
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

                <div className="border-t" />

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      Store prediction
                    </p>

                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Save this record for history, analytics,
                      and feedback.
                    </p>
                  </div>

                  <Switch
                    checked={storePrediction}
                    onCheckedChange={
                      setStorePrediction
                    }
                    aria-label="Store prediction"
                  />
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

      {hasResult && !isAnalysing ? (
        <section className="overflow-hidden rounded-3xl border bg-background">
          <div className="flex flex-col gap-4 border-b px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-emerald-600" />

                <h2 className="text-lg font-semibold">
                  Analysis result
                </h2>

                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                  Completed
                </Badge>
              </div>

              <p className="mt-1 text-sm text-muted-foreground">
                Temporary preview data for the Phase 16.1
                interface.
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

          <div className="border-b px-4 sm:px-6">
            <div
              className="flex gap-1 overflow-x-auto"
              role="tablist"
              aria-label="Prediction result sections"
            >
              {[
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
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={
                    activeTab === tab.value
                  }
                  onClick={() =>
                    setActiveTab(
                      tab.value as ResultTab,
                    )
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

          <div className="p-6 sm:p-8">
            {activeTab === "overview" ? (
              <OverviewResult />
            ) : null}

            {activeTab === "probabilities" ? (
              <ProbabilityResult />
            ) : null}

            {activeTab === "explanation" ? (
              <ExplanationResult
                enabled={includeExplanation}
              />
            ) : null}

            {activeTab === "metadata" ? (
              <MetadataResult
                task={task}
                model={model}
                stored={storePrediction}
              />
            ) : null}
          </div>
        </section>
      ) : null}

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
              Prediction history will appear here after the API
              integration in Phase 16.2.
            </p>
          </div>

          <Badge variant="outline">
            0 stored records
          </Badge>
        </div>

        <div className="mt-6 flex min-h-40 items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
          <div>
            <FileText className="mx-auto size-8 text-muted-foreground/60" />

            <p className="mt-4 font-medium">
              No prediction history yet
            </p>

            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Submit an analysis with “Store prediction”
              enabled to create a traceable research record.
            </p>
          </div>
        </div>
      </section>
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
          Analysing Bangla text
        </h2>

        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Running classification, confidence estimation, and
          explainability preparation.
        </p>

        <Progress
          value={68}
          className="mt-6 max-w-sm"
        />
      </div>
    </section>
  );
}

function OverviewResult() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <article className="rounded-2xl border p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex size-11 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/40">
            <ShieldAlert className="size-5 text-rose-600" />
          </div>

          <Badge
            variant="outline"
            className="border-rose-200 text-rose-700 dark:border-rose-900 dark:text-rose-300"
          >
            High confidence
          </Badge>
        </div>

        <p className="mt-5 text-sm text-muted-foreground">
          Hate-speech classification
        </p>

        <div className="mt-2 flex items-end justify-between gap-4">
          <h3 className="text-2xl font-bold">
            Hate speech
          </h3>

          <span className="text-3xl font-bold">
            92.8%
          </span>
        </div>

        <Progress
          value={92.8}
          className="mt-5"
        />

        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          The model detected language associated with social
          exclusion or hostility toward a group of people.
        </p>
      </article>

      <article className="rounded-2xl border p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex size-11 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
            <MessageSquareText className="size-5 text-amber-600" />
          </div>

          <Badge variant="outline">
            Classified polarity
          </Badge>
        </div>

        <p className="mt-5 text-sm text-muted-foreground">
          Sentiment classification
        </p>

        <div className="mt-2 flex items-end justify-between gap-4">
          <h3 className="text-2xl font-bold">
            Negative
          </h3>

          <span className="text-3xl font-bold">
            78.4%
          </span>
        </div>

        <Progress
          value={78.4}
          className="mt-5"
        />

        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          The sentence expresses a strongly negative attitude
          and recommends exclusionary action.
        </p>
      </article>
    </div>
  );
}

function ProbabilityResult() {
  return (
    <div>
      <div>
        <h3 className="font-semibold">
          Class probability distribution
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">
          Normalized probability scores returned by the
          selected model.
        </p>
      </div>

      <div className="mt-6 space-y-5">
        {mockProbabilities.map((item) => (
          <div key={item.label}>
            <div className="mb-2 flex items-center justify-between gap-4">
              <span className="text-sm font-medium">
                {item.label}
              </span>

              <span className="text-sm font-semibold">
                {item.value.toFixed(1)}%
              </span>
            </div>

            <Progress value={item.value} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ExplanationResult({
  enabled,
}: {
  enabled: boolean;
}) {
  if (!enabled) {
    return (
      <div className="flex min-h-52 items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
        <div>
          <BrainCircuit className="mx-auto size-8 text-muted-foreground/60" />

          <p className="mt-4 font-medium">
            Explanation was not requested
          </p>

          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Enable “Include explanation” before running the
            analysis to receive token-level contribution data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div>
        <h3 className="font-semibold">
          Token contribution preview
        </h3>

        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Darker tokens represent stronger contributions toward
          the predicted class.
        </p>
      </div>

      <div
        lang="bn"
        className="mt-6 flex flex-wrap gap-2 rounded-2xl border bg-muted/20 p-5"
      >
        {explanationTokens.map((item) => (
          <span
            key={item.token}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm font-medium",
              getTokenClass(item.score),
            )}
            title={`Contribution: ${Math.round(
              item.score * 100,
            )}%`}
          >
            {item.token}
          </span>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">
            Highest-impact token
          </p>

          <p
            lang="bn"
            className="mt-2 font-semibold"
          >
            উচিত
          </p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">
            Explanation method
          </p>

          <p className="mt-2 font-semibold">
            Token attribution
          </p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">
            Explanation status
          </p>

          <p className="mt-2 font-semibold text-emerald-600">
            Available
          </p>
        </div>
      </div>
    </div>
  );
}

function MetadataResult({
  task,
  model,
  stored,
}: {
  task: AnalysisTask;
  model: ModelChoice;
  stored: boolean;
}) {
  const metadata = [
    {
      label: "Prediction ID",
      value: "preview-16-1",
    },
    {
      label: "Task",
      value: task.replace("_", " "),
    },
    {
      label: "Selected model",
      value: model,
    },
    {
      label: "Inference latency",
      value: "184 ms",
    },
    {
      label: "Language",
      value: "Bangla",
    },
    {
      label: "Stored",
      value: stored ? "Yes" : "No",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {metadata.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border p-4"
        >
          <p className="text-xs text-muted-foreground">
            {item.label}
          </p>

          <p className="mt-2 font-semibold capitalize">
            {item.value}
          </p>
        </div>
      ))}

      <div className="rounded-2xl border p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="size-3.5" />
          Generated
        </div>

        <p className="mt-2 font-semibold">
          Just now
        </p>
      </div>

      <div className="rounded-2xl border p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <BarChart3 className="size-3.5" />
          Research mode
        </div>

        <p className="mt-2 font-semibold">
          Explainable inference
        </p>
      </div>
    </div>
  );
}
