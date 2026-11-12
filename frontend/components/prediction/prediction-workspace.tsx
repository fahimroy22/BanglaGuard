"use client";

import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Copy,
  FlaskConical,
  History,
  Languages,
  LoaderCircle,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useAuthStore } from "@/store/auth-store";
import { PredictionResultTools } from "./prediction-result-tools";
import { ResearchTestingWorkspace } from "./research-testing-workspace";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings-store";

import type {
  AnalysisTask,
  ModelVersionRead,
  PredictionRead,
} from "@/types/prediction";

type ResultTab = "overview" | "probabilities" | "explanation" | "metadata";

type ExplanationToken = {
  token: string;
  score: number;
};

const examples = [
  {label: "Neutral", task: "sentiment", banglish: false, text: "আজকের গবেষণা সভাটি বিকেল তিনটায় অনুষ্ঠিত হবে।"},
  {label: "Positive", task: "sentiment", banglish: false, text: "এই প্রকল্পের ফলাফল সত্যিই অসাধারণ।"},
  {label: "Negative", task: "sentiment", banglish: false, text: "সেবাটির মান খুব খারাপ এবং আমি সম্পূর্ণ হতাশ।"},
  {label: "Neutral", task: "sentiment", banglish: true, text: "Ajker shobha bikel tintay shuru hobe."},
  {label: "Positive", task: "sentiment", banglish: true, text: "Ajker onushthan ta amar khub bhalo legeche."},
  {label: "Negative", task: "sentiment", banglish: true, text: "Shebar man khub kharap, ami khub hotash."},
  {label: "Neutral comment", task: "hate_speech", banglish: false, text: "আমার বন্ধুরা আজ বিকেলে মাঠে খেলতে যাবে।"},
  {label: "Harsh criticism", task: "hate_speech", banglish: false, text: "কাজটা খুব বাজে হয়েছে, আবার করো।"},
  {label: "Possible insult", task: "hate_speech", banglish: false, text: "তুই একটা বোকা, তোর কোনো বুদ্ধি নেই।"},
  {label: "Potential hate speech", task: "hate_speech", banglish: false, text: "এই মানুষগুলোকে সমাজ থেকে বের করে দেওয়া উচিত।"},
  {label: "Neutral comment", task: "hate_speech", banglish: true, text: "Amar bondhura aj bikele mathe khelte jabe."},
  {label: "Harsh criticism", task: "hate_speech", banglish: true, text: "Kajta khub baje hoyeche, abar koro."},
  {label: "Possible insult", task: "hate_speech", banglish: true, text: "Tui ekta boka, tor kono buddhi nai."},
  {label: "Potential hate speech", task: "hate_speech", banglish: true, text: "Gayer rong kalo bole oke chakri deya uchit na."},
] as const;

function toPercentage(value: number): number {
  if (value <= 1) {
    return value * 100;
  }

  return value;
}

function formatLabel(label: string): string {
  return label
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getTokenClass(score: number) {
  const absoluteScore = Math.abs(score);

  if (score > 0) {
    if (absoluteScore >= 0.8) {
      return "border-rose-400 bg-rose-100 text-rose-900 dark:border-rose-800 dark:bg-rose-950/70 dark:text-rose-200";
    }

    if (absoluteScore >= 0.55) {
      return "border-orange-400 bg-orange-100 text-orange-900 dark:border-orange-800 dark:bg-orange-950/70 dark:text-orange-200";
    }

    if (absoluteScore >= 0.3) {
      return "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-200";
    }

    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300";
  }

  if (score < 0) {
    if (absoluteScore >= 0.8) {
      return "border-blue-400 bg-blue-100 text-blue-900 dark:border-blue-800 dark:bg-blue-950/70 dark:text-blue-200";
    }

    if (absoluteScore >= 0.55) {
      return "border-sky-400 bg-sky-100 text-sky-900 dark:border-sky-800 dark:bg-sky-950/70 dark:text-sky-200";
    }

    if (absoluteScore >= 0.3) {
      return "border-cyan-300 bg-cyan-100 text-cyan-900 dark:border-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-200";
    }

    return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300";
  }

  return "border-border bg-muted text-muted-foreground";
}

function getContributionLabel(score: number): string {
  const absoluteScore = Math.abs(score);

  let strength = "Weak";

  if (absoluteScore >= 0.8) {
    strength = "Very strong";
  } else if (absoluteScore >= 0.55) {
    strength = "Strong";
  } else if (absoluteScore >= 0.3) {
    strength = "Moderate";
  }

  if (score > 0) {
    return `${strength} support for predicted class`;
  }

  if (score < 0) {
    return `${strength} opposition to predicted class`;
  }

  return "Neutral contribution";
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
          if (typeof item === "object" && item !== null) {
            const record = item as Record<string, unknown>;

            const token =
              record.token ?? record.word ?? record.feature ?? record.text;

            const score =
              record.score ??
              record.weight ??
              record.importance ??
              record.attribution;

            if (typeof token === "string" && typeof score === "number") {
              return {
                token,
                score,
              };
            }
          }

          return null;
        })
        .filter((item): item is ExplanationToken => item !== null);

      if (parsed.length > 0) {
        return parsed;
      }
    }

    if (
      typeof collection === "object" &&
      collection !== null &&
      !Array.isArray(collection)
    ) {
      const parsed = Object.entries(collection as Record<string, unknown>)
        .filter(
          (entry): entry is [string, number] => typeof entry[1] === "number",
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

function getModelLabel(model: ModelVersionRead | undefined): string {
  if (!model) {
    return "Active model";
  }

  return `${model.name} v${model.version}`;
}

const taskOptions = [
  {id: "hate_speech", task: "hate_speech", label: "Hate speech", banglish: false},
  {id: "sentiment", task: "sentiment", label: "Sentiment", banglish: false},
  {id: "banglish_hate", task: "hate_speech", label: "Banglish hate speech", banglish: true},
  {id: "banglish_sentiment", task: "sentiment", label: "Banglish sentiment", banglish: true},
] as const;

type TaskOption = typeof taskOptions[number];
const isBanglishModel = (model: ModelVersionRead) => /banglish|romani[sz]ed/i.test(model.name);

type Exchange = { prediction: PredictionRead; text: string; explanationRequested: boolean };

export function PredictionWorkspace() {
  const client = useQueryClient();
  const research = useAuthStore(s => s.user?.role === "admin" || s.user?.role === "researcher");
  const [text, setText] = useState("");
  const [task, setTask] = useState<AnalysisTask>(() => useSettingsStore.getState().defaultPredictionTask);
  const [banglish, setBanglish] = useState(false);
  const [chooseModel, setChooseModel] = useState(false);
  const [modelId, setModelId] = useState("");
  const [explain, setExplain] = useState(() => useSettingsStore.getState().includeExplanationByDefault);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [view, setView] = useState("analysis");
  const [current, setCurrent] = useState<Exchange | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const latest = useRef<HTMLDivElement>(null);
  const models = useQuery({queryKey: ["model-versions"], queryFn: listModelVersions, staleTime: 60_000, refetchOnMount: "always", refetchOnWindowFocus: true});
  const history = useQuery({queryKey: ["predictions", 10, 0], queryFn: () => listPredictions(10, 0), staleTime: 15_000});
  const available = (models.data ?? []).filter(m => m.task === task && !m.is_archived && (research || m.status === "active"));
  const selected = available.find(m => m.id === modelId);
  const active = available.find(m => m.status === "active");
  const banglishModels = available.filter(isBanglishModel);
  const quickModel = banglish
    ? banglishModels.find(m => m.status === "active") ??
      banglishModels.find(m => m.status === "draft" && m.architecture.includes("banglabert")) ??
      banglishModels.find(m => m.status === "draft")
    : active;
  const chosen = modelId ? selected : quickModel;
  const compatible = Boolean(chosen);
  function selectTask(option: TaskOption) {
    setTask(option.task);
    setBanglish(option.banglish);
    setModelId("");
    setChooseModel(false);
    prediction.reset();
  }
  const prediction = useMutation({
    mutationFn: createPrediction,
    onSuccess: (result, request) => {
      const exchange = {prediction: result, text: request.text, explanationRequested: request.include_explanation};
      setExchanges(old => [exchange, ...old]);
      setCurrent(exchange);
      void client.invalidateQueries({queryKey: ["predictions"]});
    },
  });
  useEffect(() => { if (current && view === "analysis" && !prediction.isPending ) latest.current?.scrollIntoView({block: "nearest"}); }, [current, view, prediction.isPending]);
  function changeTask(next: AnalysisTask) { setTask(next); setBanglish(false); setModelId(""); setChooseModel(false); prediction.reset(); }
  function submit() {
    if (!text.trim() || prediction.isPending || !compatible || models.isError || models.isLoading) return;
    prediction.mutate({text: text.trim(), task, model_version_id: modelId || (banglish ? chosen?.id ?? null : null), include_explanation: explain});
  }
  function reuse(value: string, next: AnalysisTask) { setText(value); if (next !== task) changeTask(next); else prediction.reset(); input.current?.focus(); }
  function availableBanglishAlternative(result: PredictionRead) {
    const modelsForTask = (models.data ?? []).filter(m => m.task === result.task && !m.is_archived);
    const used = modelsForTask.find(m => m.id === result.model_version_id);
    return Boolean(
      (result.language_form === "banglish_or_english" || result.language_form === "code_mixed") &&
      used && !isBanglishModel(used) &&
      modelsForTask.some(m => isBanglishModel(m) && (m.status === "active" || (research && m.status === "draft"))),
    );
  }
  const recent = [...exchanges, ...(history.data ?? [])
    .filter(saved => !exchanges.some(exchange => exchange.prediction.id === saved.id))
    .map(saved => ({prediction: saved, text: saved.input_text ?? "Text was not retained under your storage policy.", explanationRequested: Boolean(saved.explanation)}))];
  const views = [
    {id: "analysis", label: "Analyse text", Icon: BrainCircuit},
    {id: "history", label: "History", Icon: History},
    {id: "tools", label: research ? "Research tools" : "Batch analysis", Icon: FlaskConical},
  ];

  return (
    <div className="workspace-container mx-auto max-w-6xl space-y-5 pb-8">
      <header className="border-l-4 border-primary pl-4">
        <h1 className="text-3xl font-semibold tracking-tight">Text prediction</h1>
        <p className="mt-1 text-sm text-muted-foreground">Check sentiment or hate speech in Bangla, Banglish, and mixed-language text.</p>
      </header>
      <nav aria-label="Prediction workspace" className="flex flex-wrap gap-2 border-b pb-3">
        {views.map(({id, label, Icon}) => (
          <Button key={id} size="sm" variant={view === id ? "secondary" : "ghost"} aria-current={view === id ? "page" : undefined} onClick={() => setView(id)}>
            <Icon className="size-4" />{label}
          </Button>
        ))}
      </nav>
      {view === "analysis" && (
        <div className="space-y-6">
        <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="prediction-input-title">
          <div className="border-b bg-muted/40 px-4 py-4 sm:px-6">
          <h2 id="prediction-input-title" className="mb-3 text-sm font-semibold">Choose a task</h2>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" role="group" aria-label="Analysis task">
            {taskOptions.map(option => {
              const pressed = task === option.task && banglish === option.banglish;
              return <Button key={option.id} aria-pressed={pressed} variant={pressed ? "secondary" : "ghost"} className={cn("h-auto min-h-10 justify-start whitespace-normal text-left", pressed && "!border-primary/40 !bg-primary/10 !text-primary")} disabled={prediction.isPending} onClick={() => selectTask(option)}>
                {option.task === "sentiment" ? <Languages className="size-4" /> : <ShieldAlert className="size-4" />}
                {option.label}
              </Button>;
            })}
          </div>
          <div className="mt-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{chosen?.status === "active" ? "Active model" : chosen ? chosen.status === "draft" ? "Research candidate" : "Selected model" : "Model"}</p>
                <p className="break-words text-sm font-medium">{chosen ? getModelLabel(chosen) : models.isLoading ? "Loading…" : "No model selected"}</p>
              </div>
              <Button size="sm" variant="ghost" aria-label={chooseModel ? "Hide model choices" : "Change model"} aria-expanded={chooseModel} aria-controls={chooseModel ? "prediction-model-picker" : undefined} disabled={prediction.isPending} onClick={() => setChooseModel(open => !open)}>{chooseModel ? "Hide" : "Change"}</Button>
            </div>
            {chooseModel && <label id="prediction-model-picker" className="mt-3 block text-sm">Model
              <select className="gh-input mt-1 w-full" value={modelId} disabled={prediction.isPending} onChange={e => setModelId(e.target.value)}>
                <option value="">{quickModel ? `Quick selection · ${getModelLabel(quickModel)}` : "Select a model"}</option>
                {available.map(m => <option key={m.id} value={m.id}>{getModelLabel(m)} · {m.status}</option>)}
              </select>
            </label>}
          </div>
          </div>
          <div className="px-4 py-4 sm:px-6">
          <label htmlFor="analysis-text" className="mb-2 block text-sm font-medium">Text to analyse</label><Textarea id="analysis-text" ref={input} value={text} onChange={e => {setText(e.target.value); if (prediction.isError) prediction.reset();}} disabled={prediction.isPending} dir="auto" maxLength={5000} placeholder="এখানে আপনার লেখা লিখুন…" rows={2} className="min-h-20 max-h-60 resize-y [field-sizing:content] !rounded-lg !border-transparent !bg-muted/45 px-4 py-3 text-base leading-7" onKeyDown={e => {if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.nativeEvent.isComposing) {e.preventDefault(); submit();}}}/>
          <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Example text">
            <span className="mr-1 text-xs text-muted-foreground">Try an example</span>
            {examples.filter(example => example.task === task && example.banglish === banglish).map(example => (
              <Button key={example.label} size="sm" variant="outline" className="h-auto min-h-7 px-2 text-xs" disabled={prediction.isPending} onClick={() => reuse(example.text, example.task)}>{example.label}</Button>
            ))}
          </div>
          </div>
          <div className="border-t px-4 py-3 sm:px-6">

          {models.isLoading ? <p role="status" className="mt-2 text-xs text-muted-foreground">Loading available models…</p> : models.isError ? <p role="alert" className="mt-2 text-xs text-destructive">Models could not be loaded. <button className="underline" onClick={() => void models.refetch()}>Try again</button></p> : !compatible && <p role="alert" className="mt-2 text-xs text-destructive">{modelId ? "This model is no longer available. Choose another model." : banglish ? "No Banglish model is available for this task. Choose another model if you want to continue." : "There is no active model for this task. Choose an available model or contact an administrator."}</p>}
          {prediction.isError && <p role="alert" className="mt-3 text-sm text-destructive">{getApiErrorMessage(prediction.error, "Could not analyse this text. Your text is retained; try again.")}</p>}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3"><label className="flex items-center gap-2 text-sm"><Switch checked={explain} disabled={prediction.isPending} onCheckedChange={setExplain} />Include word contributions</label><span className="text-xs text-muted-foreground sm:ml-auto">{text.length.toLocaleString()} / 5,000 <span className="hidden sm:inline">· Ctrl / ⌘ + Enter to analyse</span></span><Button onClick={submit} disabled={!text.trim() || prediction.isPending || !compatible || models.isLoading || models.isError}>{prediction.isPending ? <LoaderCircle className="size-4 animate-spin"/> : <Send className="size-4"/>}{prediction.isPending ? "Analysing…" : prediction.isError ? "Retry analysis" : "Analyse text"}</Button></div>
          </div>
        </section>

          {(current || prediction.isPending) && <section ref={latest} className="min-w-0 scroll-mt-6 rounded-xl border border-t-4 border-t-primary bg-card p-4 sm:p-6" aria-labelledby="prediction-result-title">
            <h2 id="prediction-result-title" className="mb-4 text-base font-semibold">Analysis result</h2>
            {prediction.isPending ? (
              <p role="status" className="flex items-center gap-2 rounded-xl bg-muted/50 p-5 text-sm"><LoaderCircle className="size-4 animate-spin" />Analysing your text…</p>
            ) : current ? (
              <AnalysisResult
                key={current.prediction.id}
                exchange={current}
                model={models.data?.find(m => m.id === current.prediction.model_version_id)}
                canTryBanglish={availableBanglishAlternative(current.prediction)}
                onTryBanglish={(value, next) => {
                  const option = taskOptions.find(item => item.banglish && item.task === next);
                  if (!option) return;
                  selectTask(option);
                  setText(value);
                  input.current?.focus();
                }}
                onReuse={reuse}
              />
            ) : null}
            <p className="mt-4 text-xs leading-5 text-muted-foreground">Model confidence is a score, not a guarantee of correctness.</p>
          </section>}
        </div>
      )}
      {view === "history" && (
        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="font-semibold">Recent analyses</h2><p className="mt-1 text-sm text-muted-foreground">Open a past result to inspect it or reuse its text.</p></div>
            <Button size="sm" variant="outline" onClick={() => void history.refetch()} disabled={history.isFetching}>Refresh</Button>
          </div>
          {history.isLoading && <p role="status" className="text-sm">Loading saved analyses…</p>}
          {history.isError && <p role="alert" className="text-sm text-destructive">Could not load saved analyses. Try refreshing.</p>}
          {!recent.length && !history.isLoading && !history.isError && <p className="text-sm text-muted-foreground">Your completed analyses will appear here.</p>}
          <div className="divide-y">
            {recent.map(exchange => {
              const saved = exchange.prediction;
              return <button type="button" key={saved.id} className="block w-full rounded-md px-3 py-3 text-left hover:bg-muted" onClick={() => {setCurrent(exchange); setView("analysis");}}>
                <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground"><span>{formatLabel(saved.task)}</span><span>{formatDate(saved.created_at)}</span></span>
                <span className="mt-1 block truncate text-sm" dir="auto">{exchange.text}</span>
                <span className="mt-1 block text-xs font-medium">{saved.status === "failed" ? "Failed" : formatLabel(saved.predicted_label)}</span>
              </button>;
            })}
          </div>
        </section>
      )}
      {view === "tools" && <ResearchTestingWorkspace text={text} task={task} models={models.data ?? []} includeExplanation={explain} />}
    </div>
  );
}

function AnalysisResult({exchange, model, onReuse, canTryBanglish, onTryBanglish}: {
  exchange: Exchange;
  model: ModelVersionRead | undefined;
  onReuse: (text: string, task: AnalysisTask) => void;
  canTryBanglish: boolean;
  onTryBanglish: (text: string, task: AnalysisTask) => void;
}) {
  const {prediction: result} = exchange;
  const [tab, setTab] = useState<ResultTab | null>(null);
  const scores = Object.values(result.probabilities ?? {}).sort((a,b) => b-a);
  const runtime = result.explanation?.runtime as {needs_review?: boolean; explanation_requested?: boolean} | undefined;
  const needsReview = runtime?.needs_review ?? (result.confidence < .6 || scores.length < 2 || scores[0] - scores[1] < .15);
  const margin = scores.length >= 2 ? toPercentage(scores[0]) - toPercentage(scores[1]) : null;
  const score = toPercentage(result.confidence);
  const reviewReason = margin !== null && margin < 15
    ? `The top two scores are only ${margin.toFixed(1)} percentage points apart.`
    : score < 60
      ? `The highest score is below the 60% review threshold.`
      : margin === null
        ? "There are not enough class scores to compare."
        : "Check the text and context before relying on this result.";
  const storedText = result.input_text ?? exchange.text;
  const canReuse = result.input_text !== null || storedText !== "Text was not retained under your storage policy.";
  async function copy() {try {await navigator.clipboard.writeText(`${formatLabel(result.task)}: ${formatLabel(result.predicted_label)}\nModel confidence: ${toPercentage(result.confidence).toFixed(1)}%\nModel: ${getModelLabel(model)}\nPrediction ID: ${result.id}`); toast.success("Result copied.");} catch {toast.error("Could not copy the result.");}}
  const label = formatLabel(result.predicted_label);
  const failed = result.status === "failed";

  return (
    <article className="min-w-0 space-y-4">
      <div role="status" aria-live="polite" className="rounded-lg bg-primary/5 px-4 py-3">
        {failed ? (
          <p className="text-destructive">{result.error_message ?? "This analysis could not be completed."}</p>
        ) : (
          <>
            {needsReview && (
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
                <AlertTriangle className="size-3.5 shrink-0" />Needs review
              </p>
            )}
            <h3 className="text-xl font-semibold">{needsReview ? (label.toLowerCase() === "offensive" ? "Possible offensive language" : `Possible result: ${label}`) : label}</h3>
            <p className="mt-1 break-words text-xs text-muted-foreground">{formatLabel(result.task)} · {getModelLabel(model)}</p>
            <p className="mt-1 text-sm text-muted-foreground">Model score: {score.toFixed(1)}%</p>
            {needsReview && <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">{reviewReason}</p>}
          </>
        )}
      </div>

      {!failed && (
        <>
          <ResultAtAGlance result={result} storedText={storedText} />
          {canTryBanglish && canReuse && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
              <p className="text-sm text-muted-foreground">If this text is Banglish, you can try a model trained for it.</p>
              <Button size="sm" variant="outline" onClick={() => onTryBanglish(storedText, result.task)}>Try Banglish model</Button>
            </div>
          )}
          <PredictionResultTools result={result} section="feedback" />
        </>
      )}

      <details className="border-t pt-3">
        <summary className="cursor-pointer text-sm font-medium">View technical details</summary>
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap gap-2">
            {([["probabilities", "Class scores"], ["explanation", "Word contributions"], ["metadata", "Model details"]] as [ResultTab, string][]).map(([value, title]) => (
              <Button key={value} size="sm" variant={tab === value ? "secondary" : "outline"} aria-expanded={tab === value} onClick={() => setTab(tab === value ? null : value)}>{title}</Button>
            ))}
          </div>
          {tab === "probabilities" && <ProbabilityResult probabilities={result.probabilities} />}
          {tab === "explanation" && <ExplanationResult explanation={result.explanation} requested={runtime?.explanation_requested ?? exchange.explanationRequested} />}
          {tab === "metadata" && (
            <>
              <MetadataResult result={result} model={model} />
              <PredictionResultTools result={result} section="technical" />
            </>
          )}
        </div>
      </details>

      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button variant="ghost" size="sm" disabled={!canReuse} onClick={() => onReuse(storedText, result.task)}>Edit & analyse again</Button>
        <Button variant="ghost" size="sm" disabled={!canReuse} onClick={() => onReuse(storedText, result.task === "sentiment" ? "hate_speech" : "sentiment")}>{result.task === "sentiment" ? "Check hate speech" : "Check sentiment"}</Button>
        {!failed && <Button variant="ghost" size="sm" onClick={() => void copy()}><Copy className="size-3.5" />Copy result</Button>}
      </div>
    </article>
  );
}


function ResultAtAGlance({result, storedText}: {result: PredictionRead; storedText: string}) {
  const classes = Object.entries(result.probabilities ?? {})
    .filter(([, score]) => Number.isFinite(score))
    .sort((a, b) => b[1] - a[1]);
  return (
    <div className="grid gap-4 border-y py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <section aria-label="Class score overview">
        <h4 className="text-sm font-semibold">Class scores</h4>
        {classes.length ? (
          <ul className="mt-3 flex flex-wrap gap-3">
            {classes.map(([label, score]) => {
              const percentage = Math.min(100, Math.max(0, toPercentage(score)));
              const predicted = label === result.predicted_label;
              return (
                <li key={label} className="flex w-20 min-w-0 flex-col items-center gap-1 text-center text-xs">
                  <div className={"relative grid size-14 place-items-center text-primary"}>
                    <svg viewBox="0 0 40 40" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
                      <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="3" className="opacity-15" />
                      <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="3" pathLength="100" strokeDasharray={`${percentage} 100`} />
                    </svg>
                    <span className="font-semibold tabular-nums">{percentage.toFixed(1)}%</span>
                  </div>
                  <span className={cn("break-words", predicted && "font-semibold")}>{formatLabel(label)}</span>
                  {predicted && <span className="text-muted-foreground">Predicted</span>}
                </li>
              );
            })}
          </ul>
        ) : <p className="mt-2 text-xs text-muted-foreground">The model did not return class scores.</p>}
      </section>
      <div className="min-w-0 space-y-4 lg:border-l lg:pl-5">
      <section aria-label="Analysed text">
        <h4 className="text-sm font-semibold">Analysed text</h4>
        <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 text-sm leading-relaxed" dir="auto">{storedText}</p>
      </section>

      </div>
    </div>
  );
}

function ProbabilityResult({
  probabilities,
}: {
  probabilities: Record<string, number> | null;
}) {
  const entries = Object.entries(probabilities ?? {}).sort(
    (left, right) => right[1] - left[1],
  );

  if (entries.length === 0) {
    return (
      <EmptyResultMessage
        icon={BarChart3}
        title="No probability distribution"
        description="The selected model did not return class probabilities."
      />
    );
  }

  const winningEntry = entries[0];

  const winningLabel = winningEntry[0];

  const winningPercentage = toPercentage(winningEntry[1]);

  const runnerUpPercentage =
    entries.length > 1 ? toPercentage(entries[1][1]) : 0;

  const margin = Math.max(winningPercentage - runnerUpPercentage, 0);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Model confidence distribution
            </p>

            <h3 className="mt-1 text-lg font-semibold">Class probabilities</h3>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Compare the class scores returned by the selected model.
            </p>
          </div>

          <div className="rounded-lg border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-3 py-2 sm:text-right">
            <p className="text-xs text-muted-foreground">Predicted class</p>

            <p className="mt-0.5 font-semibold">{formatLabel(winningLabel)}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {entries.map(([label, value], index) => {
          const percentage = toPercentage(value);

          const isWinner = index === 0;

          return (
            <div
              key={label}
              className={cn(
                "rounded-xl border p-3.5 transition sm:p-4",
                isWinner
                  ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
                  : "border-[var(--gh-border-default)] bg-[var(--gh-canvas-default)]",
              )}
            >
              <div className="mb-3 flex items-center justify-between gap-2 sm:gap-4">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-sm font-semibold",
                      isWinner
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-foreground",
                    )}
                  >
                    {formatLabel(label)}
                  </span>

                  {isWinner ? (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300"
                    >
                      Predicted
                    </Badge>
                  ) : null}
                </div>

                <span className="shrink-0 text-lg font-bold tabular-nums">
                  {percentage.toFixed(1)}%
                </span>
              </div>

              <Progress value={Math.min(percentage, 100)} className="h-2.5" />
            </div>
          );
        })}
      </div>

      {entries.length > 1 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] p-3">
            <p className="text-xs text-muted-foreground">Highest probability</p>

            <p className="mt-1 text-lg font-semibold tabular-nums">
              {winningPercentage.toFixed(1)}%
            </p>
          </div>

          <div className="rounded-lg border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] p-3">
            <p className="text-xs text-muted-foreground">
              Lead over next class
            </p>

            <p className="mt-1 text-lg font-semibold tabular-nums">
              {margin.toFixed(1)} percentage points
            </p>
          </div>
        </div>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">
        Probability scores describe the model&apos;s output distribution for
        this prediction. They should not be interpreted as guarantees of
        correctness.
      </p>
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

  const tokens = extractExplanationTokens(explanation);
  const linearScores = explanation.score_units === "decision_score";

  const attributionMethod =
    typeof explanation.attribution_method === "string"
      ? formatLabel(explanation.attribution_method)
      : null;

  const targetLabel =
    typeof explanation.target_label === "string"
      ? formatLabel(explanation.target_label)
      : null;

  return (
    <div>
      <h3 className="font-semibold">Model explanation</h3>

      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Inspect how input words and phrases influenced the model&apos;s
        predicted class.
      </p>

      {tokens.length > 0 ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Feature contributions</Badge>

            {attributionMethod ? (
              <Badge variant="secondary">{attributionMethod}</Badge>
            ) : null}

            {targetLabel ? (
              <span className="text-xs text-muted-foreground">
                Target class:{" "}
                <span className="font-medium text-foreground">
                  {targetLabel}
                </span>
              </span>
            ) : null}
          </div>

          <div className="rounded-md border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] p-3 sm:p-4">
            <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-sm border border-rose-300 bg-rose-100" />

                <span>Supports predicted class</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="size-3 rounded-sm border border-sky-300 bg-sky-100" />

                <span>Opposes predicted class</span>
              </div>

              <span>Stronger color = larger contribution</span>
            </div>

            <div lang="bn" dir="auto" className="flex flex-wrap gap-2">
              {tokens.map((item, index) => (
                <span
                  key={`${item.token}-${index}`}
                  className={cn(
                    "group relative rounded-lg border px-2.5 py-1.5 text-xs font-medium transition sm:px-3 sm:py-2 sm:text-sm",
                    getTokenClass(item.score),
                  )}
                  title={`${getContributionLabel(item.score)} (${item.score >= 0 ? "+" : ""}${linearScores ? item.score.toFixed(3) + " score units" : (item.score * 100).toFixed(1) + "%"})`}
                >
                  {item.token}

                  <span className="ml-1.5 text-[10px] font-normal opacity-70">
                    {item.score >= 0 ? "+" : ""}
                    {linearScores ? item.score.toFixed(3) : (item.score * 100).toFixed(0)}
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-[var(--gh-border-default)] p-3 sm:p-4">
            <p className="text-sm font-medium">How to read this explanation</p>

            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Positive attribution scores indicate tokens that pushed the
              prediction toward the displayed target class. Negative scores
              indicate tokens that pushed against that class. Attribution
              magnitude represents relative influence within this prediction and
              should not be interpreted as probability.
            </p>
          </div>

          {linearScores && <div className="rounded-md border border-border p-4 text-sm space-y-2">
            <p>Values are TF-IDF × learned coefficient contributions to the target class decision score, not probability changes. Up to 50 features are shown; phrases may overlap.</p>
            <p>Baseline: {Number(explanation.intercept).toFixed(3)} · Final decision score: {Number(explanation.decision_score).toFixed(3)} · Omitted contribution: {Number(explanation.omitted_contribution).toFixed(3)}</p>
            {Array.isArray(explanation.unknown_features) && explanation.unknown_features.length > 0 && <p>Outside the learned vocabulary ({Number(explanation.unknown_feature_count)}): {explanation.unknown_features.map(String).join(" · ")}</p>}
          </div>}

          <TechnicalExplanationMetadata
            explanation={explanation}
            hasTokenAttribution={true}
          />
        </div>
      ) : (
        <TechnicalExplanationMetadata
          explanation={explanation}
          hasTokenAttribution={false}
        />
      )}
    </div>
  );
}

function TechnicalExplanationMetadata({
  explanation,
  hasTokenAttribution,
}: {
  explanation: Record<string, unknown>;
  hasTokenAttribution: boolean;
}) {
  const method =
    typeof explanation.method === "string"
      ? formatLabel(explanation.method)
      : "Unavailable";

  const normalization =
    typeof explanation.normalization === "string"
      ? explanation.normalization
      : "Unavailable";

  const device =
    typeof explanation.device === "string"
      ? explanation.device.toUpperCase()
      : "Unavailable";

  const maxSequenceLength =
    typeof explanation.max_sequence_length === "number"
      ? `${explanation.max_sequence_length} tokens`
      : "Unavailable";

  const metadata = [
    {
      label: "Inference method",
      value: method,
    },
    {
      label: "Text normalization",
      value: normalization,
    },
    {
      label: "Compute device",
      value: device,
    },
    {
      label: "Maximum sequence length",
      value: maxSequenceLength,
    },
  ];

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Technical explanation</Badge>

        <span className="text-xs text-muted-foreground">
          Inference metadata returned by the backend
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {metadata.map((item) => (
          <div
            key={item.label}
            className="rounded-md border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] p-3"
          >
            <p className="text-xs text-muted-foreground">{item.label}</p>

            <p className="mt-2 break-words font-semibold">{item.value}</p>
          </div>
        ))}
      </div>

      {!hasTokenAttribution ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />

            <div>
              <p className="text-sm font-medium">
                Token-level explanation is not available
              </p>

              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                This model currently returns technical inference metadata only.
                Individual token contributions or feature-attribution scores are
                not produced by the active model.
              </p>
            </div>
          </div>
        </div>
      ) : null}
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
      value: model?.architecture ?? "Unknown",
    },
    {
      label: "Inference latency",
      value:
        result.latency_ms === null
          ? "Unavailable"
          : `${result.latency_ms.toFixed(3)} ms`,
    },
    {
      label: "Language form",
      value: result.language_form ?? "Unavailable",
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
    <dl className="divide-y text-sm">
      {metadata.map((item) => (
        <div
          key={item.label}
          className="grid gap-1 py-2 sm:grid-cols-[8rem_minmax(0,1fr)]"
        >
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="[overflow-wrap:anywhere]">{item.value}</dd>
        </div>
      ))}
    </dl>
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
    <div className="flex min-h-52 items-center justify-center rounded-md border border-dashed border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] p-6 text-center">
      <div>
        <Icon className="mx-auto size-8 text-muted-foreground/60" />

        <p className="mt-4 font-medium">{title}</p>

        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
