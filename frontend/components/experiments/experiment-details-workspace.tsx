"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Clock3,
  Code2,
  Database,
  FlaskConical,
  PackagePlus,
  Play,
  RefreshCw,
  Settings2,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState, useRef } from "react";
import { toast } from "sonner";

import { EvaluationWorkspace } from "./evaluation-workspace";
import { TrainingProgress } from "./training-progress";
import { getDataset } from "@/lib/dataset-management";
import {
  getExperiment,
  registerClassicalModel,
  registerTransformerModel,
} from "@/lib/experiment-management";

import type {
  ExperimentJsonObject,
  ExperimentRead,
  ExperimentStatus,
} from "@/types/experiment-management";

type ExperimentDetailsWorkspaceProps = {
  experimentId: string;
};

export function ExperimentDetailsWorkspace({
  experimentId,
}: ExperimentDetailsWorkspaceProps) {
  /* PHASE 22.4.4.2.8.1: EXPERIMENT STATUS SYNCHRONIZATION */

  const experimentQuery = useQuery({
    queryKey: ["experiments", "details", experimentId],
    queryFn: () => getExperiment(experimentId),
    refetchInterval: (query) =>
      getExperimentStatusPollInterval(query.state.data?.status),
    refetchIntervalInBackground: false,
  });

  const datasetId = experimentQuery.data?.dataset_version_id;

  const datasetQuery = useQuery({
    queryKey: ["datasets", "experiment-details", datasetId],
    queryFn: () => {
      if (!datasetId) {
        throw new Error("Dataset version is unavailable.");
      }

      return getDataset(datasetId);
    },
    enabled: Boolean(datasetId),
  });

  /* PHASE 22.4.4.2.6: TRANSFORMER EXECUTION INTEGRATION */

  /* PHASE 22.4.4.2.7: TRANSFORMER REGISTRATION INTEGRATION */

  const registrationDialog = useRef<HTMLDialogElement>(null);
  const [registrationName, setRegistrationName] = useState("");
  const [registrationVersion, setRegistrationVersion] = useState("");
  const [registrationError, setRegistrationError] = useState("");

  const registerMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const experiment = experimentQuery.data;

      if (!experiment) {
        throw new Error("Experiment details are unavailable.");
      }

      if (isTransformerExperiment(experiment)) {
        return registerTransformerModel(experimentId, { name: registrationName.trim(), version: registrationVersion.trim() });
      }

      return registerClassicalModel(experimentId, { name: registrationName.trim(), version: registrationVersion.trim() });
    },
    onSuccess: async (result) => {
      registrationDialog.current?.close();
      toast.success(
        isTransformerExperiment(experimentQuery.data)
          ? "Transformer model registered successfully."
          : "Model registered successfully.",
        {
          description: `${result.name} v${result.version}`,
        },
      );

      await experimentQuery.refetch();
    },
    onError: (error) => {
      setRegistrationError(getApiErrorMessage(error));
      toast.error(
        isTransformerExperiment(experimentQuery.data)
          ? "Transformer model registration failed."
          : "Model registration failed.",
        {
          description: getApiErrorMessage(error),
        },
      );

      void experimentQuery.refetch();
    },
  });

  const isRefreshing = experimentQuery.isFetching || datasetQuery.isFetching;

  function refreshDetails() {
    void experimentQuery.refetch();

    if (datasetId) {
      void datasetQuery.refetch();
    }
  }

  if (experimentQuery.isLoading) {
    return <ExperimentDetailsLoading />;
  }

  if (experimentQuery.isError) {
    return (
      <ExperimentDetailsError
        onRetry={() => {
          void experimentQuery.refetch();
        }}
      />
    );
  }

  const experiment = experimentQuery.data;

  if (!experiment) {
    return <ExperimentNotFound />;
  }

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-6">
        <header className="border-b border-[var(--gh-border-default)] pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <Link
                href="/experiments"
                className="mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--gh-fg-muted)] hover:text-[var(--gh-accent-fg)]"
              >
                <ArrowLeft className="size-4" />
                Experiment manager
              </Link>

              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)]">
                  <FlaskConical className="size-5 text-[var(--gh-fg-muted)]" />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="break-words text-2xl font-semibold tracking-tight text-[var(--gh-fg-default)]">
                      {experiment.name}
                    </h1>

                    <StatusBadge status={experiment.status} />

                    <StatusSyncBadge
                      status={experiment.status}
                      fetching={experimentQuery.isFetching}
                    />
                  </div>

                  <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--gh-fg-muted)]">
                    {experiment.description ??
                      "No experiment description was provided."}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={refreshDetails}
                disabled={isRefreshing}
                className="gh-button"
              >
                <RefreshCw
                  className={[
                    "size-4",
                    isRefreshing ? "animate-spin" : "",
                  ].join(" ")}
                />
                Refresh
              </button>
            </div>
          </div>
        </header>

        <ExperimentSummary experiment={experiment} />
        <TrainingProgress experimentId={experimentId} status={experiment.status}/>
        {experiment.status === "completed" && <EvaluationWorkspace experimentId={experimentId}/>}
        {(experiment.configuration?.research_question || experiment.configuration?.research_notes) ? <section className="my-4 rounded-xl border border-border bg-card p-4"><h2 className="font-semibold">Research question</h2><p className="mt-2 whitespace-pre-wrap text-sm">{String(experiment.configuration?.research_question ?? "")}</p><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{String(experiment.configuration?.research_notes ?? "")}</p></section> : null}

        {/* PHASE 22.4.4.2.8.2: TRAINING METRICS DASHBOARD */}
        <TrainingMetricsDashboard experiment={experiment} />

        {/* PHASE 22.4.4.2.8.4: FINAL EXPERIMENT UX */}
        <ExperimentTerminalStatePanel experiment={experiment} />

        <main className="mt-4 grid gap-4 items-start xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
          <div className="space-y-4">
            <ExperimentOverview experiment={experiment} />

            <ConfigurationOverview configuration={experiment.configuration} />

            {/* PHASE 22.4.4.2.8.3: ARTIFACT AND CHECKPOINT PANEL */}
            <ArtifactCheckpointPanel experiment={experiment} />
          </div>

          <aside className="space-y-4">
            <DatasetPanel
              experiment={experiment}
              dataset={datasetQuery.data}
              loading={datasetQuery.isLoading}
              error={datasetQuery.isError}
              onRetry={() => {
                void datasetQuery.refetch();
              }}
            />

            <ExecutionPanel
              experiment={experiment}
              executing={false}
              registering={registerMutation.isPending}
              onExecute={() => {
                document.getElementById("training-progress")?.scrollIntoView({behavior:"smooth",block:"start"});
              }}
              onRegister={() => {
                setRegistrationName(String(experiment.configuration?.model_name ?? ""));
                setRegistrationVersion(String(experiment.configuration?.model_version ?? "1.0.0"));
                setRegistrationError("");
                registrationDialog.current?.showModal();
              }}
            />

            <WorkspacePanel experiment={experiment} />
          </aside>
        </main>
        <dialog ref={registrationDialog} aria-labelledby="register-model-title" className="m-auto w-[min(92vw,480px)] rounded-2xl border border-border bg-card p-6 text-foreground backdrop:bg-black/50" onCancel={(event) => { if (registerMutation.isPending) event.preventDefault(); }}>
          <form onSubmit={(event) => { event.preventDefault(); if (!registerMutation.isPending) registerMutation.mutate(); }} className="space-y-4">
            <h2 id="register-model-title" className="text-xl font-semibold">Register trained model</h2>
            <p className="text-sm text-muted-foreground">Choose a unique name and version for this trained model. Existing models and training results are preserved.</p>
            <label className="block text-sm">Model name<input autoFocus required maxLength={150} className="gh-input mt-1" value={registrationName} disabled={registerMutation.isPending} onChange={(event) => setRegistrationName(event.target.value)} /></label>
            <label className="block text-sm">Version<input required maxLength={50} className="gh-input mt-1" value={registrationVersion} disabled={registerMutation.isPending} onChange={(event) => setRegistrationVersion(event.target.value)} /></label>
            {registrationError && <p role="alert" className="text-sm text-destructive">{registrationError}</p>}
            <div className="flex justify-end gap-2"><button type="button" className="gh-button" disabled={registerMutation.isPending} onClick={() => registrationDialog.current?.close()}>Cancel</button><button type="submit" className="gh-button gh-button-primary" disabled={registerMutation.isPending || !registrationName.trim() || !registrationVersion.trim()}>{registerMutation.isPending ? "Registering…" : "Register"}</button></div>
          </form>
        </dialog>
      </div>
    </div>
  );
}

function isTransformerExperiment(
  experiment: ExperimentRead | undefined,
): boolean {
  if (!experiment) {
    return false;
  }

  const experimentType = readString(experiment.results, "experiment_type");

  const modelFamily = readString(experiment.configuration, "model_family");

  return (
    experimentType === "transformer" ||
    modelFamily === "banglabert_sequence_classification"
  );
}

function ExperimentTerminalStatePanel({
  experiment,
}: {
  experiment: ExperimentRead;
}) {
  const errorMessage = readString(experiment.results, "error_message");

  const registrationComplete =
    Boolean(experiment.model_version_id) ||
    readBoolean(experiment.results, "model_version_registered");

  if (experiment.status === "failed") {
    return (
      <section className="mt-4 overflow-hidden rounded-xl bg-card border border-[var(--gh-danger-muted)] bg-[var(--gh-danger-subtle)]">
        <div className="flex items-start gap-3 px-4 py-4">
          <XCircle className="mt-0.5 size-5 shrink-0 text-[var(--gh-danger-fg)]" />

          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
              Training failed
            </h2>

            <p className="mt-1 text-xs leading-5 text-[var(--gh-fg-muted)]">
              The experiment did not complete successfully. Review the persisted
              error and training log before preparing another run.
            </p>

            {errorMessage ? (
              <pre className="mt-3 whitespace-pre-wrap break-words rounded-md border border-[var(--gh-danger-muted)] bg-card px-3 py-2 font-mono text-xs leading-5 text-[var(--gh-danger-fg)]">
                {errorMessage}
              </pre>
            ) : (
              <p className="mt-3 text-xs text-[var(--gh-fg-muted)]">
                No detailed error message was persisted.
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (experiment.status !== "completed") {
    return null;
  }

  return (
    <section className="mt-4 overflow-hidden rounded-xl bg-card border border-[var(--gh-success-muted)] bg-[var(--gh-success-subtle)]">
      <div className="flex items-start gap-3 px-4 py-4">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--gh-success-fg)]" />

        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
            Training completed
          </h2>

          <p className="mt-1 text-xs leading-5 text-[var(--gh-fg-muted)]">
            The experiment finished successfully. Metrics and persisted
            artifacts are available on this page.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="gh-badge">
              {registrationComplete
                ? "Model registered"
                : "Ready for registration"}
            </span>

            {experiment.model_version_id ? (
              <span className="gh-badge font-mono">
                {experiment.model_version_id}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function TrainingMetricsDashboard({
  experiment,
}: {
  experiment: ExperimentRead;
}) {
  const trainingMetrics =
    readObject(experiment.results, "training_metrics") ?? {};

  const validationMetrics =
    readObject(experiment.results, "validation_metrics") ?? {};

  const testMetrics = readObject(experiment.results, "test_metrics") ?? {};

  const durationSeconds = readNumber(experiment.results, "duration_seconds");

  const hasMetrics =
    Object.keys(trainingMetrics).length > 0 ||
    Object.keys(validationMetrics).length > 0 ||
    Object.keys(testMetrics).length > 0;

  if (experiment.status !== "completed" && !hasMetrics) {
    return null;
  }

  return (
    <section className="mt-4 overflow-hidden rounded-xl bg-card border border-[var(--gh-border-default)] bg-card">
      <header className="border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
          Training metrics
        </h2>

        <p className="mt-1 text-xs text-[var(--gh-fg-muted)]">
          Training, validation and test performance recorded for this
          experiment.
        </p>
      </header>

      <EvaluationFigure key={experiment.id} validation={validationMetrics} test={testMetrics} />
      <details className="border-t border-border">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary">All recorded metrics · training, validation and test</summary>
      <div className="grid items-start gap-3 px-4 pb-4 md:grid-cols-3">
        <MetricGroup
          title="Training"
          metrics={trainingMetrics}
          preferredKeys={[
            "train_loss",
            "loss",
            "train_runtime",
            "train_samples_per_second",
            "train_steps_per_second",
            "epoch",
          ]}
        />

        <MetricGroup
          title="Validation"
          metrics={validationMetrics}
          preferredKeys={[
            "accuracy",
            "macro_f1",
            "weighted_f1",
            "precision",
            "recall",
            "loss",
          ]}
        />

        <MetricGroup
          title="Test"
          metrics={testMetrics}
          preferredKeys={[
            "accuracy",
            "macro_f1",
            "weighted_f1",
            "precision",
            "recall",
            "loss",
          ]}
        />
      </div>

      </details>

      {durationSeconds !== null ? (
        <div className="border-t border-[var(--gh-border-muted)] px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-[var(--gh-fg-muted)]">
              Training duration
            </span>

            <span className="text-sm font-medium tabular-nums text-[var(--gh-fg-default)]">
              {formatDuration(durationSeconds)}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MetricGroup({
  title,
  metrics,
  preferredKeys,
}: {
  title: string;
  metrics: ExperimentJsonObject;
  preferredKeys: string[];
}) {
  const entries = preferredKeys
    .map((key) => {
      const value = readNumber(metrics, key);

      return [key, value] as const;
    })
    .filter((entry): entry is readonly [string, number] => entry[1] !== null);

  return (
    <div className="overflow-hidden rounded-xl bg-card border border-[var(--gh-border-default)]">
      <div className="bg-[var(--gh-canvas-subtle)] px-3 py-2">
        <h3 className="text-xs font-semibold text-[var(--gh-fg-default)]">
          {title}
        </h3>
      </div>

      {entries.length > 0 ? (
        <dl className="divide-y divide-[var(--gh-border-muted)]">
          {entries.map(([key, value]) => (
            <MetricRow
              key={key}
              label={formatMetricLabel(key)}
              value={formatMetricValue(key, value)}
            />
          ))}
        </dl>
      ) : (
        <p className="px-3 py-4 text-xs text-[var(--gh-fg-muted)]">
          No metrics recorded.
        </p>
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="text-xs text-[var(--gh-fg-muted)]">{label}</dt>

      <dd className="text-sm font-medium tabular-nums text-[var(--gh-fg-default)]">
        {value}
      </dd>
    </div>
  );
}

function formatMetricLabel(key: string): string {
  const labels: Record<string, string> = {
    accuracy: "Accuracy",
    macro_f1: "Macro F1",
    weighted_f1: "Weighted F1",
    precision: "Precision",
    recall: "Recall",
    loss: "Loss",
    train_loss: "Training loss",
    train_runtime: "Runtime",
    train_samples_per_second: "Samples / second",
    train_steps_per_second: "Steps / second",
    epoch: "Epoch",
  };

  return (
    labels[key] ??
    key
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

function formatMetricValue(key: string, value: number): string {
  if (
    ["accuracy", "precision", "recall", "macro_f1", "weighted_f1"].includes(key)
  ) {
    return value.toFixed(4);
  }

  if (key === "train_runtime") {
    return formatDuration(value);
  }

  if (key === "epoch") {
    return value.toFixed(2);
  }

  return value.toFixed(4);
}

function ExperimentSummary({ experiment }: { experiment: ExperimentRead }) {
  const duration = calculateDurationSeconds(experiment);

  const metrics = getMetricsSummary(experiment.results);

  const items = [
    {
      label: "Status",
      value: capitalize(experiment.status),
    },
    {
      label: "Random seed",
      value:
        experiment.random_seed === null
          ? "—"
          : experiment.random_seed.toLocaleString(),
    },
    {
      label: "Duration",
      value: duration === null ? "Not run" : formatDuration(duration),
    },
    {
      label: "Validation macro F1",
      value: formatMetric(metrics.validationMacroF1),
    },
    {
      label: "Test macro F1",
      value: formatMetric(metrics.testMacroF1),
    },
  ];

  return (
    <section className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-border bg-card px-4 py-3"
        >
          <p className="text-xs text-[var(--gh-fg-muted)]">{item.label}</p>

          <p className="mt-1 truncate text-lg font-semibold text-[var(--gh-fg-default)]">
            {item.value}
          </p>
        </div>
      ))}
    </section>
  );
}

function ArtifactCheckpointPanel({
  experiment,
}: {
  experiment: ExperimentRead;
}) {
  const results = experiment.results;

  const artifactPath = readString(results, "artifact_path");

  const bestCheckpointPath = readString(results, "best_checkpoint_path");

  const trainingLogPath = readString(results, "training_log_path");

  const trainerStatePath = readString(results, "trainer_state_path");

  const executionResultPath = readString(results, "execution_result_path");

  const requestedDevice = readString(results, "requested_device");

  const resolvedDevice = readString(results, "resolved_device");

  const checkpointPaths = readStringArray(results, "checkpoint_paths");

  const modelVersionRegistered = readBoolean(
    results,
    "model_version_registered",
  );

  const hasArtifactData =
    artifactPath !== null ||
    bestCheckpointPath !== null ||
    trainingLogPath !== null ||
    trainerStatePath !== null ||
    executionResultPath !== null ||
    checkpointPaths.length > 0 ||
    requestedDevice !== null ||
    resolvedDevice !== null;

  if (!hasArtifactData) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-xl bg-card border border-[var(--gh-border-default)]">
      <header className="border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
            Artifacts and checkpoints
          </h2>

          <p className="mt-1 text-xs text-[var(--gh-fg-muted)]">
            Persisted model files, logs, checkpoints and execution metadata.
          </p>
        </div>
      </header>

      <dl className="divide-y divide-[var(--gh-border-muted)]">
        <ArtifactRow
          label="Final model artifact"
          value={artifactPath ?? "Not available"}
        />

        <ArtifactRow
          label="Best checkpoint"
          value={bestCheckpointPath ?? "Not available"}
        />

        <ArtifactRow
          label="Training log"
          value={trainingLogPath ?? "Not available"}
        />

        <ArtifactRow
          label="Trainer state"
          value={trainerStatePath ?? "Not available"}
        />

        <ArtifactRow
          label="Execution result"
          value={executionResultPath ?? "Not available"}
        />

        <ArtifactRow
          label="Requested device"
          value={requestedDevice ?? "Unknown"}
          monospace={false}
        />

        <ArtifactRow
          label="Resolved device"
          value={resolvedDevice ?? "Unknown"}
          monospace={false}
        />

        <ArtifactRow
          label="Model registration"
          value={modelVersionRegistered ? "Registered" : "Not registered"}
          monospace={false}
        />
      </dl>

      <div className="border-t border-[var(--gh-border-default)] px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-semibold text-[var(--gh-fg-default)]">
              Saved checkpoints
            </h3>

            <p className="mt-1 text-xs text-[var(--gh-fg-muted)]">
              {checkpointPaths.length.toLocaleString()} checkpoint
              {checkpointPaths.length === 1 ? "" : "s"} recorded.
            </p>
          </div>
        </div>

        {checkpointPaths.length > 0 ? (
          <div className="mt-3 space-y-2">
            {checkpointPaths.map((checkpoint, index) => (
              <div
                key={`${checkpoint}-${index}`}
                className="rounded-md border border-[var(--gh-border-muted)] bg-[var(--gh-canvas-subtle)] px-3 py-2"
              >
                <p className="break-all font-mono text-xs text-[var(--gh-fg-default)]">
                  {checkpoint}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-[var(--gh-fg-muted)]">
            No checkpoints recorded.
          </p>
        )}
      </div>
    </section>
  );
}

function ArtifactRow({
  label,
  value,
  monospace = true,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)]">
      <dt className="text-xs text-[var(--gh-fg-muted)]">{label}</dt>

      <dd
        className={[
          "break-all text-xs text-[var(--gh-fg-default)]",
          monospace ? "font-mono" : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function readStringArray(
  source: ExperimentJsonObject | null,
  key: string,
): string[] {
  if (!source) {
    return [];
  }

  const value = source[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function ExperimentOverview({ experiment }: { experiment: ExperimentRead }) {
  return (
    <section className="overflow-hidden rounded-xl bg-card border border-[var(--gh-border-default)]">
      <header className="border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="size-4 text-[var(--gh-fg-muted)]" />

          <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
            Experiment overview
          </h2>
        </div>
      </header>

      <dl className="divide-y divide-[var(--gh-border-muted)]">
        <DetailRow label="Experiment ID" value={experiment.id} monospace />

        <DetailRow
          label="Dataset ID"
          value={experiment.dataset_version_id}
          monospace
        />

        <DetailRow
          label="Model version ID"
          value={experiment.model_version_id ?? "Not registered"}
          monospace={Boolean(experiment.model_version_id)}
        />

        <DetailRow
          label="Code version"
          value={experiment.code_version ?? "Not provided"}
        />

        <DetailRow
          label="Created"
          value={formatDateTime(experiment.created_at)}
        />

        <DetailRow
          label="Updated"
          value={formatDateTime(experiment.updated_at)}
        />

        <DetailRow
          label="Started"
          value={
            experiment.started_at
              ? formatDateTime(experiment.started_at)
              : "Not started"
          }
        />

        <DetailRow
          label="Completed"
          value={
            experiment.completed_at
              ? formatDateTime(experiment.completed_at)
              : "Not completed"
          }
        />
      </dl>
    </section>
  );
}

function ConfigurationOverview({
  configuration,
}: {
  configuration: ExperimentJsonObject | null;
}) {
  const modelFamily = readString(configuration, "model_family");

  const modelName = readString(configuration, "model_name");

  const modelVersion = readString(configuration, "model_version");

  const preprocessingVersion = readString(
    configuration,
    "preprocessing_version",
  );

  const task = readString(configuration, "task");

  const tfidf = readObject(configuration, "tfidf");

  const classifier = readObject(configuration, "classifier");

  return (
    <section className="overflow-hidden rounded-xl bg-card border border-[var(--gh-border-default)]">
      <header className="border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Settings2 className="size-4 text-[var(--gh-fg-muted)]" />

          <div>
            <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
              Configuration summary
            </h2>

            <p className="mt-0.5 text-xs text-[var(--gh-fg-muted)]">
              Saved reproducible training parameters.
            </p>
          </div>
        </div>
      </header>

      {!configuration ? (
        <div className="p-4 text-sm text-[var(--gh-fg-muted)]">
          No saved configuration is available.
        </div>
      ) : (
        <>
          <dl className="grid sm:grid-cols-2">
            <ConfigurationCell
              label="Task"
              value={task ? formatTask(task) : "Unknown"}
            />

            <ConfigurationCell
              label="Model family"
              value={modelFamily ? formatIdentifier(modelFamily) : "Unknown"}
            />

            <ConfigurationCell
              label="Model name"
              value={modelName ?? "Not provided"}
            />

            <ConfigurationCell
              label="Model version"
              value={modelVersion ?? "Not provided"}
            />

            <ConfigurationCell
              label="Preprocessing"
              value={preprocessingVersion ?? "Not provided"}
            />

            <ConfigurationCell
              label="TF-IDF analyzer"
              value={readString(tfidf, "analyzer") ?? "Unknown"}
            />

            <ConfigurationCell
              label="N-gram range"
              value={formatNgramRange(tfidf)}
            />

            <ConfigurationCell
              label="Classifier solver"
              value={readString(classifier, "solver") ?? "Unknown"}
            />

            <ConfigurationCell
              label="Penalty"
              value={readString(classifier, "penalty") ?? "None"}
            />

            <ConfigurationCell
              label="Regularization C"
              value={formatJsonValue(classifier?.regularization_c)}
            />
          </dl>

          <details className="border-t border-[var(--gh-border-default)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--gh-accent-fg)] hover:bg-[var(--gh-canvas-subtle)]">
              View complete configuration
            </summary>

            <pre className="max-h-96 overflow-auto border-t border-[var(--gh-border-muted)] bg-[var(--gh-canvas-subtle)] p-4 font-mono text-[11px] leading-5 text-[var(--gh-fg-muted)]">
              {JSON.stringify(configuration, null, 2)}
            </pre>
          </details>
        </>
      )}
    </section>
  );
}

function DatasetPanel({
  experiment,
  dataset,
  loading,
  error,
  onRetry,
}: {
  experiment: ExperimentRead;
  dataset: Awaited<ReturnType<typeof getDataset>> | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl bg-card border border-[var(--gh-border-default)]">
      <header className="border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-[var(--gh-fg-muted)]" />

          <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
            Dataset
          </h2>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center p-4 text-sm text-[var(--gh-fg-muted)]">
          <RefreshCw className="mr-2 size-4 animate-spin" />
          Loading dataset…
        </div>
      ) : error ? (
        <div className="p-4">
          <p className="text-sm text-[var(--gh-danger-fg)]">
            Dataset information could not be loaded.
          </p>

          <button type="button" onClick={onRetry} className="gh-button mt-3">
            Try again
          </button>
        </div>
      ) : dataset ? (
        <div>
          <div className="p-4">
            <p className="font-medium text-[var(--gh-fg-default)]">
              {dataset.name}
            </p>

            <p className="mt-1 text-xs text-[var(--gh-fg-muted)]">
              v{dataset.version} · {formatTask(dataset.task)}
            </p>
          </div>

          <dl className="divide-y divide-[var(--gh-border-muted)] border-t border-[var(--gh-border-default)]">
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

          <div className="border-t border-[var(--gh-border-default)] p-3">
            <Link
              href={`/datasets/${experiment.dataset_version_id}`}
              className="text-sm font-medium text-[var(--gh-accent-fg)] hover:underline"
            >
              Open dataset →
            </Link>
          </div>
        </div>
      ) : (
        <div className="p-4 text-sm text-[var(--gh-fg-muted)]">
          Dataset information is unavailable.
        </div>
      )}
    </section>
  );
}

function ExecutionPanel({
  experiment,
  executing,
  registering,
  onExecute,
  onRegister,
}: {
  experiment: ExperimentRead;
  executing: boolean;
  registering: boolean;
  onExecute: () => void;
  onRegister: () => void;
}) {
  const state = getExecutionState(experiment.status);

  const Icon = state.icon;

  const metrics = getMetricsSummary(experiment.results);

  const registrationComplete =
    Boolean(experiment.model_version_id) ||
    readBoolean(experiment.results, "model_version_registered");

  const canExecute =
    experiment.status === "planned" && !executing && !registering;

  const canRegister =
    experiment.status === "completed" &&
    !registrationComplete &&
    !executing &&
    !registering;

  return (
    <section className="overflow-hidden rounded-xl bg-card border border-[var(--gh-border-default)]">
      <header className="border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-[var(--gh-fg-muted)]" />

          <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
            Execution
          </h2>
        </div>
      </header>

      <div className="p-4">
        <div className="flex items-start gap-3">
          <Icon
            className={[
              "mt-0.5 size-5 shrink-0",
              state.colorClass,
              experiment.status === "running" ? "animate-pulse" : "",
            ].join(" ")}
          />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--gh-fg-default)]">
              {executing
                ? "Training in progress"
                : registering
                  ? "Registering model"
                  : state.title}
            </p>

            <p className="mt-1 text-xs leading-5 text-[var(--gh-fg-muted)]">
              {executing
                ? isTransformerExperiment(experiment)
                  ? "The backend is fine-tuning and evaluating the Transformer model."
                  : "The backend is training and evaluating the classical model."
                : registering
                  ? "The trained artifact is being added to the model registry."
                  : state.description}
            </p>
          </div>
        </div>

        {experiment.status === "completed" ? (
          <dl className="mt-4 divide-y divide-[var(--gh-border-muted)] rounded-md border border-[var(--gh-border-default)]">
            <CompactRow
              label="Validation macro F1"
              value={formatMetric(metrics.validationMacroF1)}
            />

            <CompactRow
              label="Test macro F1"
              value={formatMetric(metrics.testMacroF1)}
            />

            <CompactRow
              label="Model registry"
              value={registrationComplete ? "Registered" : "Not registered"}
            />
          </dl>
        ) : null}

        {experiment.status === "failed" ? (
          <div className="mt-4 rounded-md border border-[var(--gh-danger-muted)] bg-[var(--gh-danger-subtle)] p-3">
            <p className="text-xs leading-5 text-[var(--gh-danger-fg)]">
              {readString(experiment.results, "error_message") ??
                "Review the backend training log for the failure details."}
            </p>
          </div>
        ) : null}

        {registrationComplete ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-[var(--gh-success-muted)] bg-[var(--gh-success-subtle)] p-3">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--gh-success-fg)]" />

            <div>
              <p className="text-sm font-medium text-[var(--gh-success-fg)]">
                Model registered
              </p>

              <p className="mt-1 text-xs leading-5 text-[var(--gh-fg-muted)]">
                This trained model is connected to the BanglaGuard model
                registry.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {experiment.status === "planned" ? (
            <button
              type="button"
              onClick={onExecute}
              disabled={!canExecute}
              className="gh-button gh-button-primary w-full justify-center"
            >
              {executing ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}

              {executing
                ? isTransformerExperiment(experiment)
                  ? "Running Transformer training…"
                  : "Running training…"
                : isTransformerExperiment(experiment)
                  ? "Open training controls"
                  : "Open training controls"}
            </button>
          ) : null}

          {experiment.status === "running" ? (
            <button
              type="button"
              disabled
              className="gh-button w-full justify-center"
            >
              <RefreshCw className="size-4 animate-spin" />
              Training in progress
            </button>
          ) : null}

          {experiment.status === "completed" && !registrationComplete ? (
            <button
              type="button"
              onClick={onRegister}
              disabled={!canRegister}
              className="gh-button gh-button-primary w-full justify-center"
            >
              {registering ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <PackagePlus className="size-4" />
              )}

              {registering
                ? isTransformerExperiment(experiment)
                  ? "Registering Transformer model…"
                  : "Registering model…"
                : isTransformerExperiment(experiment)
                  ? "Register Transformer model"
                  : "Register model"}
            </button>
          ) : null}

          {registrationComplete && experiment.model_version_id ? (
            <Link href="/models" className="gh-button w-full justify-center">
              Open model registry
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function WorkspacePanel({ experiment }: { experiment: ExperimentRead }) {
  const workspace = readString(experiment.results, "workspace");

  const configurationPath = readString(
    experiment.results,
    "configuration_path",
  );

  const metadataPath = readString(experiment.results, "metadata_path");

  return (
    <section className="overflow-hidden rounded-xl bg-card border border-[var(--gh-border-default)]">
      <header className="border-b border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Code2 className="size-4 text-[var(--gh-fg-muted)]" />

          <h2 className="text-sm font-semibold text-[var(--gh-fg-default)]">
            Workspace
          </h2>
        </div>
      </header>

      <dl className="divide-y divide-[var(--gh-border-muted)]">
        <PathRow label="Root" value={workspace} />

        <PathRow label="Configuration" value={configurationPath} />

        <PathRow label="Metadata" value={metadataPath} />
      </dl>
    </section>
  );
}

function DetailRow({
  label,
  value,
  monospace = false,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs text-[var(--gh-fg-muted)]">{label}</dt>

      <dd
        className={[
          "min-w-0 break-words text-sm text-[var(--gh-fg-default)]",
          monospace ? "font-mono text-xs" : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function ConfigurationCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[var(--gh-border-muted)] px-4 py-3 odd:sm:border-r">
      <p className="text-xs text-[var(--gh-fg-muted)]">{label}</p>

      <p className="mt-1 break-words text-sm font-medium text-[var(--gh-fg-default)]">
        {value}
      </p>
    </div>
  );
}

function CompactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-xs text-[var(--gh-fg-muted)]">{label}</dt>

      <dd className="text-sm font-medium text-[var(--gh-fg-default)]">
        {value}
      </dd>
    </div>
  );
}

function PathRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-xs text-[var(--gh-fg-muted)]">{label}</dt>

      <dd className="mt-1 break-all font-mono text-[11px] leading-5 text-[var(--gh-fg-default)]">
        {value ?? "Unavailable"}
      </dd>
    </div>
  );
}

function getExperimentStatusPollInterval(
  status: ExperimentStatus | undefined,
): number | false {
  if (status === "running") {
    return 2_000;
  }

  if (status === "planned") {
    return 8_000;
  }

  return false;
}

function StatusSyncBadge({
  status,
  fetching,
}: {
  status: ExperimentStatus;
  fetching: boolean;
}) {
  const syncing = status === "planned" || status === "running";

  if (!syncing) {
    return null;
  }

  return (
    <span className="gh-badge inline-flex items-center gap-1.5 text-[var(--gh-fg-muted)]">
      <RefreshCw
        className={["size-3", fetching ? "animate-spin" : ""].join(" ")}
      />

      {fetching ? "Syncing" : "Auto-sync"}
    </span>
  );
}

function StatusBadge({ status }: { status: ExperimentStatus }) {
  const styleMap: Record<ExperimentStatus, string> = {
    planned: "text-[var(--gh-fg-muted)]",
    running: "text-[var(--gh-accent-fg)]",
    completed: "text-[var(--gh-success-fg)]",
    failed: "text-[var(--gh-danger-fg)]",
  };

  return (
    <span className={["gh-badge capitalize", styleMap[status]].join(" ")}>
      {status}
    </span>
  );
}

function ExperimentDetailsLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-sm text-[var(--gh-fg-muted)]">
      <RefreshCw className="mr-2 size-4 animate-spin" />
      Loading experiment…
    </div>
  );
}

function ExperimentDetailsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <TriangleAlert className="size-7 text-[var(--gh-danger-fg)]" />

      <h1 className="mt-3 text-lg font-semibold text-[var(--gh-fg-default)]">
        Experiment unavailable
      </h1>

      <p className="mt-1 max-w-md text-sm text-[var(--gh-fg-muted)]">
        The experiment could not be loaded from the backend.
      </p>

      <button type="button" onClick={onRetry} className="gh-button mt-4">
        <RefreshCw className="size-4" />
        Try again
      </button>
    </div>
  );
}

function ExperimentNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <FlaskConical className="size-7 text-[var(--gh-fg-subtle)]" />

      <h1 className="mt-3 text-lg font-semibold text-[var(--gh-fg-default)]">
        Experiment not found
      </h1>

      <Link href="/experiments" className="gh-button mt-4">
        Return to experiments
      </Link>
    </div>
  );
}

function getExecutionState(status: ExperimentStatus) {
  if (status === "completed") {
    return {
      title: "Training completed",
      description:
        "The experiment finished and its saved metrics can be reviewed.",
      icon: CheckCircle2,
      colorClass: "text-[var(--gh-success-fg)]",
    };
  }

  if (status === "running") {
    return {
      title: "Training in progress",
      description: "The experiment is currently marked as running.",
      icon: Clock3,
      colorClass: "text-[var(--gh-accent-fg)]",
    };
  }

  if (status === "failed") {
    return {
      title: "Training failed",
      description:
        "The saved execution results indicate that training did not complete.",
      icon: XCircle,
      colorClass: "text-[var(--gh-danger-fg)]",
    };
  }

  return {
    title: "Ready to execute",
    description: "The experiment is prepared and has not yet been executed.",
    icon: CircleDot,
    colorClass: "text-[var(--gh-fg-muted)]",
  };
}

function getMetricsSummary(results: ExperimentJsonObject | null) {
  const validationMetrics = readObject(results, "validation_metrics");

  const testMetrics = readObject(results, "test_metrics");

  return {
    validationMacroF1: readNumber(validationMetrics, "macro_f1"),
    testMacroF1: readNumber(testMetrics, "macro_f1"),
  };
}

function calculateDurationSeconds(experiment: ExperimentRead): number | null {
  const savedDuration = readNumber(experiment.results, "duration_seconds");

  if (savedDuration !== null) {
    return savedDuration;
  }

  if (!experiment.started_at || !experiment.completed_at) {
    return null;
  }

  const started = new Date(experiment.started_at).getTime();

  const completed = new Date(experiment.completed_at).getTime();

  if (Number.isNaN(started) || Number.isNaN(completed)) {
    return null;
  }

  return Math.max(0, (completed - started) / 1000);
}

function readObject(
  source: ExperimentJsonObject | null,
  key: string,
): ExperimentJsonObject | null {
  if (!source) {
    return null;
  }

  const value = source[key];

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }

  return null;
}

function readString(
  source: ExperimentJsonObject | null,
  key: string,
): string | null {
  if (!source) {
    return null;
  }

  const value = source[key];

  return typeof value === "string" ? value : null;
}

function readBoolean(
  source: ExperimentJsonObject | null,
  key: string,
): boolean {
  if (!source) {
    return false;
  }

  return source[key] === true;
}

function readNumber(
  source: ExperimentJsonObject | null,
  key: string,
): number | null {
  if (!source) {
    return null;
  }

  const value = source[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatNgramRange(tfidf: ExperimentJsonObject | null) {
  const minimum = readNumber(tfidf, "ngram_min");

  const maximum = readNumber(tfidf, "ngram_max");

  if (minimum === null || maximum === null) {
    return "Unknown";
  }

  return `${minimum}–${maximum}`;
}

function formatJsonValue(value: unknown) {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return "Unknown";
}

function formatMetric(value: number | null) {
  if (value === null) {
    return "—";
  }

  return value.toFixed(4);
}

function formatDuration(seconds: number) {
  if (seconds < 1) {
    return `${Math.round(seconds * 1000)} ms`;
  }

  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }

  const minutes = Math.floor(seconds / 60);

  const remainingSeconds = Math.round(seconds % 60);

  return `${minutes}m ${remainingSeconds}s`;
}

function formatTask(value: string) {
  return formatIdentifier(value);
}

function formatIdentifier(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function getApiErrorMessage(error: unknown): string {
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
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected backend error occurred.";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}


function EvaluationFigure({ validation, test }: {
  validation: ExperimentJsonObject; test: ExperimentJsonObject;
}) {
  const [visible, setVisible] = useState<"both" | "validation" | "test">("both");
  const [selected, setSelected] = useState("");
  const metricKeys = ["accuracy", "macro_f1", "weighted_f1", "precision", "recall"];
  const score = (metrics: ExperimentJsonObject, key: string) => {
    const value = readNumber(metrics, key);
    return value !== null && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
  };
  const keys = metricKeys.filter((key) => score(validation, key) !== null || score(test, key) !== null);
  const activeKey = keys.includes(selected) ? selected : keys[0];
  const series = [
    {id: "validation", label: "Validation", color: "var(--chart-1)", metrics: validation},
    {id: "test", label: "Test", color: "var(--chart-2)", metrics: test},
  ].filter((item) => visible === "both" || item.id === visible);
  if (!keys.length) return <p className="px-4 py-5 text-sm text-muted-foreground">No evaluation scores recorded yet. Charts will appear when validation or test results are available.</p>;
  const validationScore = score(validation, activeKey);
  const testScore = score(test, activeKey);
  const gap = validationScore !== null && testScore !== null ? testScore - validationScore : null;
  return <div className="grid items-start gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Validation and test comparison</h3>
        <div className="flex flex-wrap gap-1">{(["both", "validation", "test"] as const).map((id) => <button key={id} type="button" aria-pressed={visible === id} onClick={() => setVisible(id)} className={`rounded-md border px-2 py-1 text-xs capitalize ${visible === id ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{id === "both" ? "Both splits" : id}</button>)}</div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Recorded scores · 0–1 scale. Hover a column for its exact value.</p>
      <div className="overflow-x-auto">
        <svg viewBox="0 0 680 230" className="mt-2 h-56 w-full min-w-[480px]" role="img" aria-label="Grouped validation and test scores; exact values are available in the metric inspector">
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => <g key={tick}>
            <line x1="40" x2="670" y1={192 - tick * 160} y2={192 - tick * 160} stroke="var(--border)" strokeDasharray="3 4" />
            <text x="32" y={196 - tick * 160} fill="var(--muted-foreground)" fontSize="11" textAnchor="end">{tick}</text>
          </g>)}
          {keys.map((key, index) => {
            const step = 620 / keys.length;
            const center = 45 + step * (index + 0.5);
            return <g key={key}>
              {series.map((item, i) => {
                const value = score(item.metrics, key);
                if (value === null) return null;
                const x = center + (i - (series.length - 1) / 2) * 28 - 12;
                return <rect key={item.id} x={x} y={192 - value * 160} width="24" height={value * 160} rx="3" fill={item.color}><title>{formatMetricLabel(key)} · {item.label}: {value.toFixed(4)}</title></rect>;
              })}
              <text x={center} y="213" fill="var(--muted-foreground)" fontSize="11" textAnchor="middle">{formatMetricLabel(key)}</text>
            </g>;
          })}
        </svg>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">{series.map((item) => <span key={item.id}><span style={{color: item.color}}>●</span> {item.label}</span>)}</div>
    </div>
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <h3 className="text-sm font-medium">Inspect a metric</h3>
      <select aria-label="Metric to inspect" className="gh-input mt-2" value={activeKey} onChange={(e) => setSelected(e.target.value)}>{keys.map((key) => <option key={key} value={key}>{formatMetricLabel(key)}</option>)}</select>
      <dl className="mt-3 space-y-3 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Validation</dt><dd className="font-semibold tabular-nums">{validationScore?.toFixed(4) ?? "Unavailable"}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Test</dt><dd className="font-semibold tabular-nums">{testScore?.toFixed(4) ?? "Unavailable"}</dd></div>
        <div className="flex justify-between gap-3 border-t border-border pt-3"><dt className="text-muted-foreground">Test − validation</dt><dd className="font-semibold tabular-nums">{gap === null ? "Unavailable" : `${gap > 0 ? "+" : ""}${gap.toFixed(4)}`}</dd></div>
      </dl>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">The difference describes these two splits; it does not establish statistical significance. Missing scores are omitted from the chart.</p>
    </div>
  </div>;
}
