"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Beaker,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  CircleCheck,
  Database,
  FlaskConical,
  Info,
  LoaderCircle,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { ExperimentSetupTools, type Preflight } from "./experiment-setup-tools";
import { TransformerConfigurationForm } from "@/components/experiments/transformer-configuration-form";
import { listDatasets } from "@/lib/dataset-management";
import {
  prepareClassicalExperiment,
  prepareTransformerExperiment,
} from "@/lib/experiment-management";

import type {
  ClassicalTrainingRequest,
  LogisticRegressionPenalty,
  LogisticRegressionSolver,
  TfidfAnalyzer,
  TfidfNorm,
  TrainingReadinessRead,
  TransformerTrainingReadinessRead,
  TransformerTrainingRequest,
} from "@/types/experiment-management";

import {
  DEFAULT_CLASSICAL_TRAINING_REQUEST,
  DEFAULT_TRANSFORMER_TRAINING_REQUEST,
} from "@/types/experiment-management";

/* PHASE 22.4.4.2.2: TRAINING WORKFLOW SELECTOR */

type ExperimentTrainingMode = "classical" | "transformer";

type ExperimentTrainingReadiness =
  TrainingReadinessRead | TransformerTrainingReadinessRead;

type SharedExperimentField =
  | "dataset_version_id"
  | "experiment_name"
  | "experiment_description"
  | "model_name"
  | "model_version"
  | "random_seed"
  | "code_version";

type WorkflowStep = "configuration" | "readiness" | "prepared";

const steps: {
  value: WorkflowStep;
  label: string;
}[] = [
  {
    value: "configuration",
    label: "Configure",
  },
  {
    value: "readiness",
    label: "Readiness",
  },
  {
    value: "prepared",
    label: "Prepare",
  },
];

export function NewExperimentWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedDatasetId = searchParams.get("datasetId") ?? "";

  const [trainingMode, setTrainingMode] =
    useState<ExperimentTrainingMode>("classical");

  const [form, setForm] = useState<ClassicalTrainingRequest>(() => ({
    ...DEFAULT_CLASSICAL_TRAINING_REQUEST,
    dataset_version_id: requestedDatasetId,
    tfidf: {
      ...DEFAULT_CLASSICAL_TRAINING_REQUEST.tfidf,
    },
    classifier: {
      ...DEFAULT_CLASSICAL_TRAINING_REQUEST.classifier,
    },
  }));

  const [transformerForm, setTransformerForm] =
    useState<TransformerTrainingRequest>(() => ({
      ...DEFAULT_TRANSFORMER_TRAINING_REQUEST,
      dataset_version_id: requestedDatasetId,
      model: {
        ...DEFAULT_TRANSFORMER_TRAINING_REQUEST.model,
      },
      optimization: {
        ...DEFAULT_TRANSFORMER_TRAINING_REQUEST.optimization,
      },
      evaluation: {
        ...DEFAULT_TRANSFORMER_TRAINING_REQUEST.evaluation,
      },
      runtime: {
        ...DEFAULT_TRANSFORMER_TRAINING_REQUEST.runtime,
      },
    }));

  const activeForm = trainingMode === "classical" ? form : transformerForm;

  const [readiness, setReadiness] =
    useState<ExperimentTrainingReadiness | null>(null);

  const [preflight, setPreflight] = useState<Preflight|null>(null);
  const [checkedConfiguration, setCheckedConfiguration] = useState("");

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const datasetsQuery = useQuery({
    queryKey: ["datasets", "new-experiment"],
    queryFn: () =>
      listDatasets({
        limit: 100,
        offset: 0,
      }),
  });

  const datasets = useMemo(
    () => datasetsQuery.data?.items ?? [],
    [datasetsQuery.data],
  );

  const selectedDataset = useMemo(
    () =>
      datasets.find(
        (dataset) => dataset.id === activeForm.dataset_version_id,
      ) ?? null,
    [activeForm.dataset_version_id, datasets],
  );

  /* PHASE 22.4.4.2.4: TRANSFORMER READINESS INTEGRATION */

  const readinessMutation = useMutation({
    mutationFn: async (): Promise<ExperimentTrainingReadiness> => {
      const checked = JSON.stringify(activeForm);
      const response = await api.post<Preflight>("/experiment-research/preflight", {configuration: activeForm}, {timeout:120000});
      setPreflight(response.data);
      setCheckedConfiguration(checked);
      if (!response.data.readiness) throw new Error(response.data.checks.filter(c=>c.status==='blocked').map(c=>c.detail).join(' '));
      return {...response.data.readiness, training_ready:response.data.ready, resolved_device:response.data.device} as ExperimentTrainingReadiness;
    },
    onSuccess: (result) => {
      setReadiness(result);

      if (result.training_ready) {
        toast.success(
          trainingMode === "transformer"
            ? "Transformer training is ready."
            : "Dataset is ready for training.",
        );
      } else {
        toast.error(
          trainingMode === "transformer"
            ? "Transformer training is not ready."
            : "Dataset is not ready for training.",
        );
      }
    },
    onError: (error) => {
      setReadiness(null);

      toast.error(
        getApiErrorMessage(
          error,
          trainingMode === "transformer"
            ? "Transformer readiness could not be evaluated."
            : "Training readiness could not be evaluated.",
        ),
      );
    },
  });

  /* PHASE 22.4.4.2.5: TRANSFORMER PREPARATION INTEGRATION */

  const preparationMutation = useMutation({
    mutationFn: async () => {
      if (trainingMode === "transformer") {
        return prepareTransformerExperiment(transformerForm);
      }

      return prepareClassicalExperiment(form);
    },
    onSuccess: (result) => {
      toast.success(
        trainingMode === "transformer"
          ? "Transformer experiment workspace prepared."
          : "Experiment workspace prepared.",
      );

      router.push(`/experiments/${result.experiment_id}`);
    },
    onError: (error) => {
      toast.error(
        getApiErrorMessage(
          error,
          trainingMode === "transformer"
            ? "Transformer experiment could not be prepared."
            : "Experiment could not be prepared.",
        ),
      );
    },
  });

  const currentStep: WorkflowStep = preparationMutation.isSuccess
    ? "prepared"
    : readiness
      ? "readiness"
      : "configuration";

  const validationErrors =
    trainingMode === "classical"
      ? validateConfiguration(form)
      : validateTransformerConfiguration(transformerForm);

  const canCheckReadiness =
    validationErrors.length === 0 &&
    !readinessMutation.isPending &&
    !preparationMutation.isPending;

  const canPrepare =
    Boolean(readiness?.training_ready) &&
    checkedConfiguration === JSON.stringify(activeForm) &&
    validationErrors.length === 0 &&
    !readinessMutation.isPending &&
    !preparationMutation.isPending;

  function selectTrainingMode(mode: ExperimentTrainingMode) {
    setTrainingMode(mode);
    setReadiness(null);

    readinessMutation.reset();
    preparationMutation.reset();
  }

  function updateSharedField(
    key: SharedExperimentField,
    value: string | number | null,
  ) {
    if (trainingMode === "classical") {
      setForm((current) => ({
        ...current,
        [key]: value,
      }));

      setTransformerForm((current) => ({
        ...current,
        [key]: value,
      }));
    } else {
      setTransformerForm((current) => ({
        ...current,
        [key]: value,
      }));

      setForm((current) => ({
        ...current,
        [key]: value,
      }));
    }

    setReadiness(null);
  }

  function updateRootField<Key extends keyof ClassicalTrainingRequest>(
    key: Key,
    value: ClassicalTrainingRequest[Key],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));

    setReadiness(null);
  }

  /* PHASE 22.4.4.2.3.2: TRANSFORMER MODEL CALLBACKS */

  function updateTransformerModel(
    key: keyof TransformerTrainingRequest["model"],
    value: TransformerTrainingRequest["model"][keyof TransformerTrainingRequest["model"]],
  ) {
    setTransformerForm((current) => ({
      ...current,
      model: {
        ...current.model,
        [key]: value,
      },
    }));

    setReadiness(null);
  }

  /* PHASE 22.4.4.2.3.3: TRANSFORMER OPTIMIZATION CALLBACK */

  function updateTransformerOptimization(
    key: keyof TransformerTrainingRequest["optimization"],
    value: TransformerTrainingRequest["optimization"][keyof TransformerTrainingRequest["optimization"]],
  ) {
    setTransformerForm((current) => ({
      ...current,
      optimization: {
        ...current.optimization,
        [key]: value,
      },
    }));

    setReadiness(null);
  }

  /* PHASE 22.4.4.2.3.4: TRANSFORMER EVALUATION AND RUNTIME CALLBACKS */

  function updateTransformerEvaluation(
    key: keyof TransformerTrainingRequest["evaluation"],
    value: TransformerTrainingRequest["evaluation"][keyof TransformerTrainingRequest["evaluation"]],
  ) {
    setTransformerForm((current) => ({
      ...current,
      evaluation: {
        ...current.evaluation,
        [key]: value,
      },
    }));

    setReadiness(null);
  }

  function updateTransformerRuntime(
    key: keyof TransformerTrainingRequest["runtime"],
    value: TransformerTrainingRequest["runtime"][keyof TransformerTrainingRequest["runtime"]],
  ) {
    setTransformerForm((current) => ({
      ...current,
      runtime: {
        ...current.runtime,
        [key]: value,
      },
    }));

    setReadiness(null);
  }

  /* PHASE 22.4.4.2.3.5: TRANSFORMER OUTPUT CALLBACK */

  function updateTransformerOutput<
    Key extends
      | "save_probabilities"
      | "save_classification_report"
      | "save_confusion_matrix"
      | "save_predictions",
  >(key: Key, value: TransformerTrainingRequest[Key]) {
    setTransformerForm((current) => ({
      ...current,
      [key]: value,
    }));

    setReadiness(null);
  }

  function updateTransformerPreprocessingVersion(value: string) {
    setTransformerForm((current) => ({
      ...current,
      preprocessing_version: value,
    }));

    setReadiness(null);
  }

  function updateTfidf(
    key: keyof ClassicalTrainingRequest["tfidf"],
    value: ClassicalTrainingRequest["tfidf"][keyof ClassicalTrainingRequest["tfidf"]],
  ) {
    setForm((current) => ({
      ...current,
      tfidf: {
        ...current.tfidf,
        [key]: value,
      },
    }));

    setReadiness(null);
  }

  function updateClassifier(
    key: keyof ClassicalTrainingRequest["classifier"],
    value: ClassicalTrainingRequest["classifier"][keyof ClassicalTrainingRequest["classifier"]],
  ) {
    setForm((current) => ({
      ...current,
      classifier: {
        ...current.classifier,
        [key]: value,
      },
    }));

    setReadiness(null);
  }

  function checkReadiness() {
    if (!canCheckReadiness) {
      toast.error(validationErrors[0] ?? "Complete the required fields.");

      return;
    }

    readinessMutation.mutate();
  }

  function prepareExperiment() {
    if (!readiness?.training_ready) {
      toast.error("Check training readiness first.");

      return;
    }

    if (validationErrors.length > 0) {
      toast.error(validationErrors[0] ?? "Complete the required fields.");

      return;
    }

    preparationMutation.mutate();
  }

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-6">
        <header className="border-b border-[var(--gh-border-default)] pb-4">
          <Link
            href="/experiments"
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--gh-fg-muted)] hover:text-[var(--gh-accent-fg)]"
          >
            <ArrowLeft className="size-4" />
            Experiment manager
          </Link>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--gh-fg-default)]">
                New experiment
              </h1>

              <p className="mt-1 text-sm text-[var(--gh-fg-muted)]">
                Configure and prepare a reproducible{" "}
                {trainingMode === "classical"
                  ? "classical"
                  : "BanglaBERT Transformer"}{" "}
                training run.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={checkReadiness}
                disabled={!canCheckReadiness}
                className="gh-button"
              >
                {readinessMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Check readiness
              </button>

              <button
                type="button"
                onClick={prepareExperiment}
                disabled={!canPrepare}
                className="gh-button gh-button-primary"
              >
                {preparationMutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <FlaskConical className="size-4" />
                )}
                Prepare experiment
              </button>
            </div>
          </div>
        </header>

        <ExperimentSetupTools configuration={activeForm} duplicateId={searchParams.get("duplicate")} datasetName={selectedDataset?`${selectedDataset.name} v${selectedDataset.version}`:""} preflight={checkedConfiguration===JSON.stringify(activeForm)?preflight:null} onApply={value=>{
          if(value.model_family==="banglabert_sequence_classification"){setTransformerForm(value as TransformerTrainingRequest);setTrainingMode("transformer");}
          else {setForm(value as ClassicalTrainingRequest);setTrainingMode("classical");}
          setReadiness(null);setPreflight(null);setCheckedConfiguration("");
        }}/>
        <WorkflowSteps currentStep={currentStep} />
        {datasetsQuery.isError ? <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm"><span>Datasets could not be loaded.</span><button type="button" className="gh-button" onClick={() => void datasetsQuery.refetch()}>Retry</button></div> : null}
        {datasetsQuery.data?.has_next ? <p className="mt-2 text-xs text-muted-foreground">Showing the first 100 dataset versions.</p> : null}

        <div className="mt-4 grid items-start gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <main className="space-y-3">
            <TrainingWorkflowSelector
              value={trainingMode}
              onChange={selectTrainingMode}
            />

            <Section
              title="Experiment"
              description="Name the run and select its dataset."
              icon={Beaker}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Experiment name" required>
                  <input
                    value={activeForm.experiment_name}
                    onChange={(event) =>
                      updateSharedField("experiment_name", event.target.value)
                    }
                    className="gh-input h-9 w-full px-3"
                    placeholder="BD-SHS TF-IDF baseline"
                  />
                </Field>

                <Field label="Dataset" required>
                  <select
                    value={activeForm.dataset_version_id}
                    onChange={(event) =>
                      updateSharedField(
                        "dataset_version_id",
                        event.target.value,
                      )
                    }
                    className="gh-input h-9 w-full px-3"
                    disabled={datasetsQuery.isLoading}
                  >
                    <option value="">Select dataset</option>

                    {datasets.map((dataset) => (
                      <option key={dataset.id} value={dataset.id}>
                        {dataset.name} · v{dataset.version}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="md:col-span-2">
                  <Field label="Description">
                    <textarea
                      value={activeForm.experiment_description ?? ""}
                      onChange={(event) =>
                        updateSharedField(
                          "experiment_description",
                          event.target.value || null,
                        )
                      }
                      className="gh-input min-h-20 w-full resize-y px-3 py-2"
                      placeholder="Optional experiment notes"
                    />
                  </Field>
                </div>
              </div>
            </Section>

            <Section
              title="Model"
              description={
                trainingMode === "classical"
                  ? "TF-IDF feature extraction with logistic regression."
                  : "BanglaBERT sequence classification from a pretrained checkpoint."
              }
              icon={trainingMode === "classical" ? Settings2 : BrainCircuit}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Model family">
                  <div className="flex h-9 items-center rounded-md border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-3 text-sm text-[var(--gh-fg-default)]">
                    {trainingMode === "classical"
                      ? "TF-IDF + Logistic Regression"
                      : "BanglaBERT Sequence Classification"}
                  </div>
                </Field>

                <Field label="Model version" required>
                  <input
                    value={activeForm.model_version}
                    onChange={(event) =>
                      updateSharedField("model_version", event.target.value)
                    }
                    className="gh-input h-9 w-full px-3"
                  />
                </Field>

                <div className="md:col-span-2">
                  <Field label="Model name" required>
                    <input
                      value={activeForm.model_name}
                      onChange={(event) =>
                        updateSharedField("model_name", event.target.value)
                      }
                      className="gh-input h-9 w-full px-3"
                    />
                  </Field>
                </div>

                <Field label="Random seed">
                  <NumberInput
                    value={activeForm.random_seed}
                    min={0}
                    step={1}
                    onChange={(value) =>
                      updateSharedField("random_seed", value)
                    }
                  />
                </Field>

                <Field label="Code version">
                  <input
                    value={activeForm.code_version ?? ""}
                    onChange={(event) =>
                      updateSharedField(
                        "code_version",
                        event.target.value || null,
                      )
                    }
                    className="gh-input h-9 w-full px-3"
                    placeholder="Git commit or release"
                  />
                </Field>
              </div>
            </Section>

            <section className="overflow-hidden rounded-xl bg-card border border-[var(--gh-border-default)]">
              <button
                type="button"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((current) => !current)}
                className="flex w-full items-center justify-between bg-[var(--gh-canvas-subtle)] px-4 py-3 text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SlidersHorizontal className="size-4 text-[var(--gh-fg-muted)]" />

                  <div>
                    <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
                      Advanced configuration
                    </h2>

                    <p className="mt-0.5 text-xs text-[var(--gh-fg-muted)]">
                      {trainingMode === "classical"
                        ? "TF-IDF, classifier and output settings."
                        : "Checkpoint, optimization, evaluation and runtime settings."}
                    </p>
                  </div>
                </div>

                <ChevronDown
                  className={[
                    "size-4 transition-transform",
                    advancedOpen ? "rotate-180" : "",
                  ].join(" ")}
                />
              </button>

              {advancedOpen ? (
                <div className="space-y-6 border-t border-[var(--gh-border-default)] p-4">
                  {trainingMode === "classical" ? (
                    <>
                      <TfidfConfiguration form={form} onChange={updateTfidf} />

                      <div className="border-t border-[var(--gh-border-muted)]" />

                      <ClassifierConfiguration
                        form={form}
                        onChange={updateClassifier}
                      />

                      <div className="border-t border-[var(--gh-border-muted)]" />

                      <OutputConfiguration
                        form={form}
                        onChange={updateRootField}
                      />
                    </>
                  ) : (
                    <TransformerConfigurationForm
                      form={transformerForm}
                      onModelChange={updateTransformerModel}
                      onPreprocessingVersionChange={
                        updateTransformerPreprocessingVersion
                      }
                      onOptimizationChange={updateTransformerOptimization}
                      onEvaluationChange={updateTransformerEvaluation}
                      onRuntimeChange={updateTransformerRuntime}
                      onOutputChange={updateTransformerOutput}
                    />
                  )}
                </div>
              ) : null}
            </section>
          </main>

          <aside className="space-y-3">
            <SelectedDatasetPanel
              dataset={selectedDataset}
              loading={datasetsQuery.isLoading}
            />

            {trainingMode === "transformer" ? (
              <section className="rounded-md border border-[var(--gh-accent-muted)] bg-[var(--gh-accent-muted)] p-4">
                <div className="flex items-start gap-2">
                  <BrainCircuit className="mt-0.5 size-4 shrink-0 text-[var(--gh-accent-fg)]" />

                  <div>
                    <p className="text-sm font-medium text-[var(--gh-fg-default)]">
                      Transformer workflow selected
                    </p>

                    <p className="mt-1 text-xs leading-5 text-[var(--gh-fg-muted)]">
                      BanglaBERT form controls and endpoint dispatch will be
                      connected in the next workflow phases.
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            <ReadinessPanel
              readiness={readiness}
              loading={readinessMutation.isPending}
              error={readinessMutation.isError}
              onCheck={checkReadiness}
              disabled={!canCheckReadiness}
            />

            {validationErrors.length > 0 ? (
              <section className="rounded-md border border-[var(--gh-attention-muted)] bg-[var(--gh-attention-subtle)] p-4">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--gh-attention-fg)]" />

                  <div>
                    <p className="text-sm font-medium text-[var(--gh-fg-default)]">
                      Configuration required
                    </p>

                    <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--gh-fg-muted)]">
                      {validationErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            ) : null}
          </aside>
        </div>

        <footer className="mt-4 flex flex-col gap-3 border-t border-[var(--gh-border-default)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/experiments" className="gh-button">
            Cancel
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={checkReadiness}
              disabled={!canCheckReadiness}
              className="gh-button"
            >
              <ShieldCheck className="size-4" />
              Check readiness
            </button>

            <button
              type="button"
              onClick={prepareExperiment}
              disabled={!canPrepare}
              className="gh-button gh-button-primary"
            >
              Prepare experiment
              <ArrowRight className="size-4" />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function TrainingWorkflowSelector({
  value,
  onChange,
}: {
  value: ExperimentTrainingMode;
  onChange: (mode: ExperimentTrainingMode) => void;
}) {
  const options: {
    value: ExperimentTrainingMode;
    title: string;
    description: string;
    icon: typeof Beaker;
    badge: string;
  }[] = [
    {
      value: "classical",
      title: "Classical training",
      description:
        "Fast TF-IDF features with logistic regression for reproducible baselines.",
      icon: Settings2,
      badge: "TF-IDF",
    },
    {
      value: "transformer",
      title: "BanglaBERT Transformer",
      description:
        "Fine-tune a pretrained Bangla language model for sequence classification.",
      icon: BrainCircuit,
      badge: "BanglaBERT",
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl bg-card border border-[var(--gh-border-default)]">
      <header className="border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
          Training workflow
        </h2>

        <p className="mt-0.5 text-xs text-[var(--gh-fg-muted)]">
          Choose the model family used by this experiment.
        </p>
      </header>

      <div className="grid gap-3 p-4 md:grid-cols-2">
        {options.map((option) => {
          const selected = value === option.value;

          const Icon = option.icon;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={[
                "rounded-xl border p-3 text-left transition-colors",
                selected
                  ? "border-[var(--gh-accent-emphasis)] bg-[var(--gh-accent-muted)]"
                  : "border-[var(--gh-border-default)] hover:bg-[var(--gh-canvas-subtle)]",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--gh-border-default)] bg-background">
                  <Icon
                    className={[
                      "size-4",
                      selected
                        ? "text-[var(--gh-accent-fg)]"
                        : "text-[var(--gh-fg-muted)]",
                    ].join(" ")}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--gh-fg-default)]">
                      {option.title}
                    </p>

                    <span className="gh-badge">{option.badge}</span>
                  </div>

                  <p className="mt-1 text-xs leading-5 text-[var(--gh-fg-muted)]">
                    {option.description}
                  </p>
                </div>

                <span
                  className={[
                    "mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border",
                    selected
                      ? "border-[var(--gh-accent-emphasis)]"
                      : "border-[var(--gh-border-default)]",
                  ].join(" ")}
                >
                  {selected ? (
                    <span className="size-2 rounded-full bg-[var(--gh-accent-emphasis)]" />
                  ) : null}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function WorkflowSteps({ currentStep }: { currentStep: WorkflowStep }) {
  const currentIndex = steps.findIndex((step) => step.value === currentStep);

  return (
    <section className="mt-4 grid overflow-hidden rounded-xl bg-card border border-[var(--gh-border-default)] sm:grid-cols-3">
      {steps.map((step, index) => {
        const complete = index < currentIndex;

        const active = index === currentIndex;

        return (
          <div
            key={step.value}
            className={[
              "flex min-h-11 items-center gap-2 px-4",
              index !== steps.length - 1
                ? "border-b border-[var(--gh-border-default)] sm:border-b-0 sm:border-r"
                : "",
              active
                ? "bg-[var(--gh-accent-muted)] text-[var(--gh-accent-fg)]"
                : "",
            ].join(" ")}
          >
            <span
              className={[
                "flex size-5 items-center justify-center rounded-full border text-[11px]",
                complete
                  ? "border-[var(--gh-success-emphasis)] bg-[var(--gh-success-emphasis)] text-white"
                  : active
                    ? "border-[var(--gh-accent-emphasis)]"
                    : "border-[var(--gh-border-default)] text-[var(--gh-fg-muted)]",
              ].join(" ")}
            >
              {complete ? <CircleCheck className="size-3.5" /> : index + 1}
            </span>

            <span className="text-sm font-medium">{step.label}</span>
          </div>
        );
      })}
    </section>
  );
}

function Section({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: typeof Database;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl bg-card border border-[var(--gh-border-default)]">
      <header className="flex items-start gap-2 border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <Icon className="mt-0.5 size-4 text-[var(--gh-fg-muted)]" />

        <div>
          <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
            {title}
          </h2>

          <p className="mt-0.5 text-xs text-[var(--gh-fg-muted)]">
            {description}
          </p>
        </div>
      </header>

      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[var(--gh-fg-default)]">
        {label}

        {required ? (
          <span className="ml-1 text-[var(--gh-danger-fg)]">*</span>
        ) : null}
      </span>

      {children}
    </label>
  );
}

function NumberInput({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => {
        const nextValue = event.target.valueAsNumber;

        if (Number.isFinite(nextValue)) {
          onChange(nextValue);
        }
      }}
      className="gh-input h-9 w-full px-3"
    />
  );
}

function TfidfConfiguration({
  form,
  onChange,
}: {
  form: ClassicalTrainingRequest;
  onChange: (
    key: keyof ClassicalTrainingRequest["tfidf"],
    value: ClassicalTrainingRequest["tfidf"][keyof ClassicalTrainingRequest["tfidf"]],
  ) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--gh-fg-default)]">
        TF-IDF
      </h3>

      <div className="mt-3 grid gap-4 md:grid-cols-3">
        <Field label="Analyzer">
          <select
            value={form.tfidf.analyzer}
            onChange={(event) =>
              onChange("analyzer", event.target.value as TfidfAnalyzer)
            }
            className="gh-input h-9 w-full px-3"
          >
            <option value="word">Word</option>
            <option value="char">Character</option>
            <option value="char_wb">Character within words</option>
          </select>
        </Field>

        <Field label="N-gram minimum">
          <NumberInput
            value={form.tfidf.ngram_min}
            min={1}
            max={5}
            step={1}
            onChange={(value) => onChange("ngram_min", value)}
          />
        </Field>

        <Field label="N-gram maximum">
          <NumberInput
            value={form.tfidf.ngram_max}
            min={1}
            max={6}
            step={1}
            onChange={(value) => onChange("ngram_max", value)}
          />
        </Field>

        <Field label="Minimum document frequency">
          <NumberInput
            value={form.tfidf.min_df}
            min={1}
            max={10000}
            step={1}
            onChange={(value) => onChange("min_df", value)}
          />
        </Field>

        <Field label="Maximum document frequency">
          <NumberInput
            value={form.tfidf.max_df}
            min={0.01}
            max={1}
            step={0.01}
            onChange={(value) => onChange("max_df", value)}
          />
        </Field>

        <Field label="Maximum features">
          <NumberInput
            value={form.tfidf.max_features ?? 100000}
            min={1000}
            max={1000000}
            step={1000}
            onChange={(value) => onChange("max_features", value)}
          />
        </Field>

        <Field label="Norm">
          <select
            value={form.tfidf.norm ?? "none"}
            onChange={(event) =>
              onChange(
                "norm",
                event.target.value === "none"
                  ? null
                  : (event.target.value as TfidfNorm),
              )
            }
            className="gh-input h-9 w-full px-3"
          >
            <option value="l2">L2</option>
            <option value="l1">L1</option>
            <option value="none">None</option>
          </select>
        </Field>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BooleanOption
          label="Lowercase"
          checked={form.tfidf.lowercase}
          onChange={(checked) => onChange("lowercase", checked)}
        />

        <BooleanOption
          label="Sublinear TF"
          checked={form.tfidf.sublinear_tf}
          onChange={(checked) => onChange("sublinear_tf", checked)}
        />

        <BooleanOption
          label="Use IDF"
          checked={form.tfidf.use_idf}
          onChange={(checked) => onChange("use_idf", checked)}
        />

        <BooleanOption
          label="Smooth IDF"
          checked={form.tfidf.smooth_idf}
          onChange={(checked) => onChange("smooth_idf", checked)}
        />
      </div>
    </div>
  );
}

function ClassifierConfiguration({
  form,
  onChange,
}: {
  form: ClassicalTrainingRequest;
  onChange: (
    key: keyof ClassicalTrainingRequest["classifier"],
    value: ClassicalTrainingRequest["classifier"][keyof ClassicalTrainingRequest["classifier"]],
  ) => void;
}) {
  const elasticNet = form.classifier.penalty === "elasticnet";

  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--gh-fg-default)]">
        Logistic regression
      </h3>

      <div className="mt-3 grid gap-4 md:grid-cols-3">
        <Field label="Solver">
          <select
            value={form.classifier.solver}
            onChange={(event) =>
              onChange("solver", event.target.value as LogisticRegressionSolver)
            }
            className="gh-input h-9 w-full px-3"
          >
            <option value="liblinear">Liblinear</option>
            <option value="lbfgs">LBFGS</option>
            <option value="newton-cg">Newton-CG</option>
            <option value="newton-cholesky">Newton-Cholesky</option>
            <option value="sag">SAG</option>
            <option value="saga">SAGA</option>
          </select>
        </Field>

        <Field label="Penalty">
          <select
            value={form.classifier.penalty ?? "none"}
            onChange={(event) =>
              onChange(
                "penalty",
                event.target.value === "none"
                  ? null
                  : (event.target.value as LogisticRegressionPenalty),
              )
            }
            className="gh-input h-9 w-full px-3"
          >
            <option value="l2">L2</option>
            <option value="l1">L1</option>
            <option value="elasticnet">Elastic net</option>
            <option value="none">None</option>
          </select>
        </Field>

        <Field label="Regularization C">
          <NumberInput
            value={form.classifier.regularization_c}
            min={0.0001}
            max={1000}
            step={0.1}
            onChange={(value) => onChange("regularization_c", value)}
          />
        </Field>

        <Field label="Maximum iterations">
          <NumberInput
            value={form.classifier.max_iter}
            min={100}
            max={100000}
            step={100}
            onChange={(value) => onChange("max_iter", value)}
          />
        </Field>

        <Field label="Tolerance">
          <NumberInput
            value={form.classifier.tolerance}
            min={0.000001}
            max={0.1}
            step={0.0001}
            onChange={(value) => onChange("tolerance", value)}
          />
        </Field>

        {elasticNet ? (
          <Field label="L1 ratio">
            <NumberInput
              value={form.classifier.l1_ratio ?? 0.5}
              min={0}
              max={1}
              step={0.05}
              onChange={(value) => onChange("l1_ratio", value)}
            />
          </Field>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <BooleanOption
          label="Balanced class weight"
          checked={form.classifier.class_weight === "balanced"}
          onChange={(checked) =>
            onChange("class_weight", checked ? "balanced" : null)
          }
        />

        <BooleanOption
          label="Fit intercept"
          checked={form.classifier.fit_intercept}
          onChange={(checked) => onChange("fit_intercept", checked)}
        />
      </div>
    </div>
  );
}

function OutputConfiguration({
  form,
  onChange,
}: {
  form: ClassicalTrainingRequest;
  onChange: <Key extends keyof ClassicalTrainingRequest>(
    key: Key,
    value: ClassicalTrainingRequest[Key],
  ) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--gh-fg-default)]">
        Saved outputs
      </h3>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <BooleanOption
          label="Probabilities"
          checked={form.save_probabilities}
          onChange={(checked) => onChange("save_probabilities", checked)}
        />

        <BooleanOption
          label="Classification report"
          checked={form.save_classification_report}
          onChange={(checked) =>
            onChange("save_classification_report", checked)
          }
        />

        <BooleanOption
          label="Confusion matrix"
          checked={form.save_confusion_matrix}
          onChange={(checked) => onChange("save_confusion_matrix", checked)}
        />
      </div>
    </div>
  );
}

function BooleanOption({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-[var(--gh-border-default)] px-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4"
      />

      <span className="text-sm text-[var(--gh-fg-default)]">{label}</span>
    </label>
  );
}

function SelectedDatasetPanel({
  dataset,
  loading,
}: {
  dataset: Awaited<ReturnType<typeof listDatasets>>["items"][number] | null;
  loading: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl bg-card border border-[var(--gh-border-default)]">
      <header className="border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
          Selected dataset
        </h2>
      </header>

      {loading ? (
        <div className="flex items-center p-4 text-sm text-[var(--gh-fg-muted)]">
          <LoaderCircle className="mr-2 size-4 animate-spin" />
          Loading datasets…
        </div>
      ) : !dataset ? (
        <div className="p-4 text-sm text-[var(--gh-fg-muted)]">
          Select a dataset to continue.
        </div>
      ) : (
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)]">
              <Database className="size-4 text-[var(--gh-fg-muted)]" />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--gh-fg-default)]">
                {dataset.name}
              </p>

              <p className="mt-1 text-xs text-[var(--gh-fg-muted)]">
                v{dataset.version} · {formatTask(dataset.task)}
              </p>
            </div>
          </div>

          <DatasetSplitFigure train={dataset.train_samples} validation={dataset.validation_samples} test={dataset.test_samples} />

          <dl className="mt-4 divide-y divide-[var(--gh-border-muted)] rounded-md border border-[var(--gh-border-default)]">
            <CompactRow
              label="Samples"
              value={dataset.total_samples.toLocaleString()}
            />

            <CompactRow
              label="Training"
              value={dataset.train_samples.toLocaleString()}
            />

            <CompactRow
              label="Validation"
              value={dataset.validation_samples.toLocaleString()}
            />

            <CompactRow
              label="Test"
              value={dataset.test_samples.toLocaleString()}
            />
          </dl>

          <Link
            href={`/datasets/${dataset.id}`}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--gh-accent-fg)]"
          >
            Open dataset
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}
    </section>
  );
}

function ReadinessPanel({
  readiness,
  loading,
  error,
  onCheck,
  disabled,
}: {
  readiness: ExperimentTrainingReadiness | null;
  loading: boolean;
  error: boolean;
  onCheck: () => void;
  disabled: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl bg-card border border-[var(--gh-border-default)]">
      <header className="border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
          Training readiness
        </h2>
      </header>

      {loading ? (
        <div className="flex min-h-32 flex-col items-center justify-center p-4 text-center">
          <LoaderCircle className="size-5 animate-spin text-[var(--gh-accent-fg)]" />

          <p className="mt-3 text-sm text-[var(--gh-fg-muted)]">
            Evaluating dataset and artifacts…
          </p>
        </div>
      ) : error ? (
        <div className="p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 text-[var(--gh-danger-fg)]" />

            <p className="text-sm text-[var(--gh-fg-muted)]">
              Readiness evaluation failed.
            </p>
          </div>

          <button
            type="button"
            onClick={onCheck}
            disabled={disabled}
            className="gh-button mt-3 w-full"
          >
            Try again
          </button>
        </div>
      ) : readiness ? (
        <div className="p-4">
          <div className="flex items-start gap-3">
            {readiness.training_ready ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--gh-success-fg)]" />
            ) : (
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-[var(--gh-danger-fg)]" />
            )}

            <div>
              <p className="text-sm font-semibold text-[var(--gh-fg-default)]">
                {readiness.training_ready
                  ? "Ready for training"
                  : "Training blocked"}
              </p>

              <p className="mt-1 text-xs text-[var(--gh-fg-muted)]">
                Quality score: {formatQualityScore(readiness.quality_score)}
              </p>
            </div>
          </div>

          <dl className="mt-4 divide-y divide-[var(--gh-border-muted)] rounded-md border border-[var(--gh-border-default)]">
            <CompactRow
              label="Labels"
              value={String(readiness.labels.length)}
            />

            <CompactRow
              label="Training"
              value={readiness.train_samples.toLocaleString()}
            />

            <CompactRow
              label="Warnings"
              value={String(readiness.warnings.length)}
            />

            <CompactRow
              label="Errors"
              value={String(readiness.errors.length)}
            />

            {isTransformerReadiness(readiness) ? (
              <>
                <CompactRow
                  label="Requested device"
                  value={formatDeviceName(readiness.requested_device)}
                />

                <CompactRow
                  label="Resolved device"
                  value={formatDeviceName(readiness.resolved_device)}
                />
              </>
            ) : null}
          </dl>

          {isTransformerReadiness(readiness) ? (
            <div className="mt-4 rounded-md border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-3 py-3">
              <p className="text-xs font-medium text-[var(--gh-fg-default)]">
                Transformer environment
              </p>

              <dl className="mt-2 space-y-2">
                <EnvironmentRow
                  label="Checkpoint"
                  value={readiness.pretrained_model_name_or_path}
                />

                <EnvironmentRow
                  label="Tokenizer"
                  value={readiness.tokenizer_name_or_path}
                />
              </dl>
            </div>
          ) : null}

          {readiness.warnings.length > 0 ? (
            <MessageList
              title="Warnings"
              messages={readiness.warnings}
              warning
            />
          ) : null}

          {readiness.errors.length > 0 ? (
            <MessageList title="Errors" messages={readiness.errors} />
          ) : null}

          {readiness.recommendations.length > 0 ? (
            <MessageList
              title="Recommendations"
              messages={readiness.recommendations}
              information
            />
          ) : null}
        </div>
      ) : (
        <div className="p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-[var(--gh-fg-muted)]" />

            <p className="text-sm leading-5 text-[var(--gh-fg-muted)]">
              Check readiness before preparing the experiment.
            </p>
          </div>

          <button
            type="button"
            onClick={onCheck}
            disabled={disabled}
            className="gh-button mt-4 w-full"
          >
            <ShieldCheck className="size-4" />
            Check readiness
          </button>
        </div>
      )}
    </section>
  );
}

function isTransformerReadiness(
  readiness: ExperimentTrainingReadiness,
): readiness is TransformerTrainingReadinessRead {
  return "resolved_device" in readiness;
}

function formatDeviceName(device: string): string {
  const labels: Record<string, string> = {
    auto: "Automatic",
    cpu: "CPU",
    cuda: "NVIDIA CUDA",
    mps: "Apple Silicon MPS",
  };

  return labels[device] ?? device;
}

function EnvironmentRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[90px_minmax(0,1fr)]">
      <dt className="text-xs text-[var(--gh-fg-muted)]">{label}</dt>

      <dd className="break-all text-xs font-medium text-[var(--gh-fg-default)]">
        {value}
      </dd>
    </div>
  );
}

function CompactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="text-xs text-[var(--gh-fg-muted)]">{label}</dt>

      <dd className="text-sm font-medium text-[var(--gh-fg-default)]">
        {value}
      </dd>
    </div>
  );
}

function MessageList({
  title,
  messages,
  warning = false,
  information = false,
}: {
  title: string;
  messages: string[];
  warning?: boolean;
  information?: boolean;
}) {
  return (
    <div className="mt-4">
      <p className="text-xs font-medium text-[var(--gh-fg-default)]">{title}</p>

      <ul className="mt-2 space-y-2">
        {messages.map((message) => (
          <li
            key={message}
            className={[
              "rounded-md border px-3 py-2 text-xs leading-5",
              warning
                ? "border-[var(--gh-attention-muted)] bg-[var(--gh-attention-subtle)]"
                : information
                  ? "border-[var(--gh-accent-muted)] bg-[var(--gh-accent-subtle)]"
                  : "border-[var(--gh-danger-muted)] bg-[var(--gh-danger-subtle)]",
            ].join(" ")}
          >
            {message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function validateConfiguration(form: ClassicalTrainingRequest): string[] {
  const errors: string[] = [];

  if (!form.dataset_version_id) {
    errors.push("Select a dataset.");
  }

  if (form.experiment_name.trim().length < 2) {
    errors.push("Enter an experiment name.");
  }

  if (form.model_name.trim().length < 2) {
    errors.push("Enter a model name.");
  }

  if (!form.model_version.trim()) {
    errors.push("Enter a model version.");
  }

  if (form.tfidf.ngram_min > form.tfidf.ngram_max) {
    errors.push("N-gram minimum cannot exceed the maximum.");
  }

  const supportedPenalties: Record<
    LogisticRegressionSolver,
    LogisticRegressionPenalty[]
  > = {
    liblinear: ["l1", "l2"],
    lbfgs: ["l2", null],
    "newton-cg": ["l2", null],
    "newton-cholesky": ["l2", null],
    sag: ["l2", null],
    saga: ["l1", "l2", "elasticnet", null],
  };

  if (
    !supportedPenalties[form.classifier.solver].includes(
      form.classifier.penalty,
    )
  ) {
    errors.push("The selected solver and penalty are incompatible.");
  }

  if (
    form.classifier.penalty === "elasticnet" &&
    form.classifier.solver !== "saga"
  ) {
    errors.push("Elastic-net requires the SAGA solver.");
  }

  if (
    form.classifier.penalty === "elasticnet" &&
    form.classifier.l1_ratio === null
  ) {
    errors.push("Elastic-net requires an L1 ratio.");
  }

  return errors;
}

/* PHASE 22.4.4.2.3.6: TRANSFORMER FRONTEND VALIDATION */

function validateTransformerConfiguration(
  form: TransformerTrainingRequest,
): string[] {
  const errors: string[] = [];

  if (!form.dataset_version_id) {
    errors.push("Select a dataset.");
  }

  if (form.experiment_name.trim().length < 2) {
    errors.push("Enter an experiment name.");
  }

  if (form.model_name.trim().length < 2) {
    errors.push("Enter a model name.");
  }

  if (!form.model_version.trim()) {
    errors.push("Enter a model version.");
  }

  if (!form.preprocessing_version.trim()) {
    errors.push("Enter a preprocessing version.");
  }

  if (form.model.pretrained_model_name_or_path.trim().length < 2) {
    errors.push("Enter a pretrained model or checkpoint.");
  }

  const tokenizerOverride = form.model.tokenizer_name_or_path;

  if (tokenizerOverride !== null && tokenizerOverride.trim().length < 2) {
    errors.push("Tokenizer override must contain at least two characters.");
  }

  if (
    form.model.max_sequence_length < 16 ||
    form.model.max_sequence_length > 512
  ) {
    errors.push("Maximum sequence length must be between 16 and 512.");
  }

  if (
    form.optimization.num_train_epochs <= 0 ||
    form.optimization.num_train_epochs > 100
  ) {
    errors.push("Training epochs must be greater than 0 and no more than 100.");
  }

  if (
    form.optimization.learning_rate <= 0 ||
    form.optimization.learning_rate > 1
  ) {
    errors.push("Learning rate must be greater than 0 and no more than 1.");
  }

  if (
    form.optimization.weight_decay < 0 ||
    form.optimization.weight_decay > 1
  ) {
    errors.push("Weight decay must be between 0 and 1.");
  }

  if (
    form.optimization.warmup_ratio < 0 ||
    form.optimization.warmup_ratio > 1
  ) {
    errors.push("Warmup ratio must be between 0 and 1.");
  }

  if (
    form.optimization.train_batch_size < 1 ||
    form.optimization.train_batch_size > 512
  ) {
    errors.push("Training batch size must be between 1 and 512.");
  }

  if (
    form.optimization.evaluation_batch_size < 1 ||
    form.optimization.evaluation_batch_size > 512
  ) {
    errors.push("Evaluation batch size must be between 1 and 512.");
  }

  if (
    form.optimization.gradient_accumulation_steps < 1 ||
    form.optimization.gradient_accumulation_steps > 1024
  ) {
    errors.push("Gradient accumulation must be between 1 and 1,024.");
  }

  if (
    form.optimization.max_gradient_norm <= 0 ||
    form.optimization.max_gradient_norm > 100
  ) {
    errors.push(
      "Maximum gradient norm must be greater than 0 and no more than 100.",
    );
  }

  if (form.evaluation.logging_steps < 1) {
    errors.push("Logging steps must be at least 1.");
  }

  if (
    form.evaluation.evaluation_strategy === "steps" &&
    (form.evaluation.evaluation_steps === null ||
      form.evaluation.evaluation_steps < 1)
  ) {
    errors.push("Evaluation steps are required for step-based evaluation.");
  }

  if (
    form.evaluation.save_strategy === "steps" &&
    (form.evaluation.save_steps === null || form.evaluation.save_steps < 1)
  ) {
    errors.push("Save steps are required for step-based checkpoint saving.");
  }

  if (
    form.evaluation.save_total_limit !== null &&
    form.evaluation.save_total_limit < 1
  ) {
    errors.push("Checkpoint limit must be at least 1.");
  }

  if (!form.evaluation.metric_for_best_model.trim()) {
    errors.push("Enter the metric used to select the best model.");
  }

  if (form.evaluation.early_stopping_threshold < 0) {
    errors.push("Early-stopping threshold cannot be negative.");
  }

  const loadBestModel = form.evaluation.load_best_model_at_end;

  const evaluationStrategy = form.evaluation.evaluation_strategy;

  const saveStrategy = form.evaluation.save_strategy;

  if (loadBestModel) {
    if (evaluationStrategy === "no") {
      errors.push("Loading the best model requires evaluation.");
    }

    if (saveStrategy === "no") {
      errors.push("Loading the best model requires checkpoint saving.");
    }

    if (evaluationStrategy !== saveStrategy) {
      errors.push(
        "Evaluation and save strategies must match when loading the best model.",
      );
    }

    if (
      evaluationStrategy === "steps" &&
      saveStrategy === "steps" &&
      form.evaluation.evaluation_steps !== null &&
      form.evaluation.save_steps !== null &&
      form.evaluation.save_steps % form.evaluation.evaluation_steps !== 0
    ) {
      errors.push("Save steps must be a multiple of evaluation steps.");
    }
  }

  const earlyStoppingPatience = form.evaluation.early_stopping_patience;

  if (earlyStoppingPatience !== null) {
    if (earlyStoppingPatience < 1) {
      errors.push("Early-stopping patience must be at least 1.");
    }

    if (!loadBestModel) {
      errors.push("Early stopping requires loading the best model at the end.");
    }

    if (evaluationStrategy === "no") {
      errors.push("Early stopping requires an evaluation strategy.");
    }
  }

  if (form.runtime.fp16 && form.runtime.bf16) {
    errors.push("FP16 and BF16 cannot both be enabled.");
  }

  if (
    form.runtime.device_preference === "cpu" &&
    (form.runtime.fp16 || form.runtime.bf16)
  ) {
    errors.push(
      "Mixed precision cannot be used with the CPU device preference.",
    );
  }

  if (
    form.runtime.dataloader_num_workers < 0 ||
    form.runtime.dataloader_num_workers > 64
  ) {
    errors.push("Data-loader workers must be between 0 and 64.");
  }

  return [...new Set(errors)];
}

function formatTask(task: string) {
  if (task === "hate_speech") {
    return "Hate speech";
  }

  if (task === "sentiment") {
    return "Sentiment";
  }

  return task.replaceAll("_", " ");
}

function formatQualityScore(value: number) {
  if (value <= 1) {
    return `${Math.round(value * 100)}%`;
  }

  return `${Math.round(value)}%`;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as {
        response?: {
          data?: {
            detail?: unknown;
          };
        };
      }
    ).response;

    const detail = response?.data?.detail;

    if (typeof detail === "string") {
      return detail;
    }

    if (Array.isArray(detail)) {
      const firstMessage = detail.find(
        (item) => typeof item === "object" && item !== null && "msg" in item,
      );

      if (
        firstMessage &&
        typeof firstMessage === "object" &&
        "msg" in firstMessage &&
        typeof firstMessage.msg === "string"
      ) {
        return firstMessage.msg;
      }
    }
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}


function DatasetSplitFigure({ train, validation, test }: { train: number; validation: number; test: number }) {
  const [percent, setPercent] = useState(false);
  const values = [
    { label: "Train", count: train, color: "var(--chart-1)" },
    { label: "Validation", count: validation, color: "var(--chart-2)" },
    { label: "Test", count: test, color: "var(--chart-4)" },
  ];
  const total = train + validation + test;
  const max = percent ? 100 : Math.max(1, train, validation, test);
  return <figure className="mt-3 border-t border-border pt-3">
    <div className="flex items-center justify-between gap-2"><figcaption className="text-xs font-medium">Registered dataset splits</figcaption><label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={percent} onChange={(e) => setPercent(e.target.checked)} />Percent</label></div>
    <svg viewBox="0 0 320 150" className="mt-2 h-36 w-full" role="img" aria-label={`Registered splits: train ${train}, validation ${validation}, test ${test}`}>
      {[0, 0.5, 1].map((tick) => <g key={tick}><line x1="45" x2="312" y1={117 - tick * 90} y2={117 - tick * 90} stroke="var(--border)" strokeDasharray="3 4" /><text x="40" y={121 - tick * 90} textAnchor="end" fontSize="9" fill="var(--muted-foreground)">{percent ? `${tick * 100}%` : Math.round(tick * max).toLocaleString()}</text></g>)}
      {values.map((item, i) => {
        const value = percent ? (total > 0 ? item.count / total * 100 : 0) : item.count;
        const height = value / max * 90;
        return <g key={item.label}><rect x={63 + i * 85} y={117 - height} width="40" height={height} rx="3" fill={item.color}><title>{item.label}: {item.count.toLocaleString()} rows</title></rect><text x={83 + i * 85} y={111 - height} textAnchor="middle" fontSize="10" fill="var(--foreground)">{percent ? `${value.toFixed(1)}%` : item.count.toLocaleString()}</text><text x={83 + i * 85} y="136" textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">{item.label}</text></g>;
      })}
    </svg>
    {total === 0 ? <p className="text-xs text-muted-foreground">No split rows registered.</p> : null}
  </figure>;
}
