"use client";

import {
  FileOutput,
  BrainCircuit,
  Clock3,
  Gauge,
  Save,
  ShieldAlert,
} from "lucide-react";

import { useState } from "react";

import type { TransformerTrainingRequest } from "@/types/experiment-management";

type TransformerModelKey = keyof TransformerTrainingRequest["model"];

type TransformerModelValue =
  TransformerTrainingRequest["model"][TransformerModelKey];

type TransformerOptimizationKey =
  keyof TransformerTrainingRequest["optimization"];

type TransformerOptimizationValue =
  TransformerTrainingRequest["optimization"][TransformerOptimizationKey];

type TransformerEvaluationKey = keyof TransformerTrainingRequest["evaluation"];

type TransformerEvaluationValue =
  TransformerTrainingRequest["evaluation"][TransformerEvaluationKey];

type TransformerRuntimeKey = keyof TransformerTrainingRequest["runtime"];

type TransformerRuntimeValue =
  TransformerTrainingRequest["runtime"][TransformerRuntimeKey];

type TransformerOutputKey =
  | "save_probabilities"
  | "save_classification_report"
  | "save_confusion_matrix"
  | "save_predictions";

type TransformerConfigurationFormProps = {
  form: TransformerTrainingRequest;

  onModelChange: (
    key: TransformerModelKey,
    value: TransformerModelValue,
  ) => void;

  onPreprocessingVersionChange: (value: string) => void;

  onOptimizationChange: (
    key: TransformerOptimizationKey,
    value: TransformerOptimizationValue,
  ) => void;

  onEvaluationChange: (
    key: TransformerEvaluationKey,
    value: TransformerEvaluationValue,
  ) => void;

  onRuntimeChange: (
    key: TransformerRuntimeKey,
    value: TransformerRuntimeValue,
  ) => void;

  onOutputChange: <Key extends TransformerOutputKey>(
    key: Key,
    value: TransformerTrainingRequest[Key],
  ) => void;
};

export function TransformerConfigurationForm({
  form,
  onModelChange,
  onPreprocessingVersionChange,
  onOptimizationChange,
  onEvaluationChange,
  onRuntimeChange,
  onOutputChange,
}: TransformerConfigurationFormProps) {
  const [section, setSection] = useState("model");
  const sections = [
    ["model", "Model & tokenizer"], ["optimization", "Optimization"],
    ["evaluation", "Evaluation"], ["runtime", "Runtime"], ["outputs", "Outputs"],
  ];
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          ["Epochs", form.optimization.num_train_epochs],
          ["Learning rate", form.optimization.learning_rate],
          ["Batch / device update", form.optimization.train_batch_size * form.optimization.gradient_accumulation_steps],
          ["Requested device", form.runtime.device_preference.toUpperCase()],
        ].map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-background px-3 py-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
      <nav aria-label="Transformer configuration sections" className="flex flex-wrap gap-1 border-b border-border pb-2">
        {sections.map(([id, label]) => <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)} className={`rounded-lg px-3 py-2 text-xs font-medium ${section === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>{label}</button>)}
      </nav>
      {section === "model" && <TransformerModelSection form={form} onModelChange={onModelChange} onPreprocessingVersionChange={onPreprocessingVersionChange} />}
      {section === "optimization" && <TransformerOptimizationSection form={form} onChange={onOptimizationChange} />}
      {section === "evaluation" && <TransformerEvaluationSection form={form} onChange={onEvaluationChange} />}
      {section === "runtime" && <TransformerRuntimeSection form={form} onChange={onRuntimeChange} />}
      {section === "outputs" && <TransformerOutputSection form={form} onChange={onOutputChange} />}
    </div>
  );
}

function TransformerModelSection({
  form,
  onModelChange,
  onPreprocessingVersionChange,
}: {
  form: TransformerTrainingRequest;

  onModelChange: (
    key: TransformerModelKey,
    value: TransformerModelValue,
  ) => void;

  onPreprocessingVersionChange: (value: string) => void;
}) {
  return (
    <section className="space-y-3">
      <SectionHeading
        icon={BrainCircuit}
        title="Model and tokenizer"
        description="Configure the pretrained BanglaBERT checkpoint, tokenizer and sequence preprocessing behavior."
      />

      <div className="grid items-start gap-3 md:grid-cols-2">
        <FormField
          label="Pretrained model or checkpoint"
          required
          description="A Hugging Face model identifier or an accessible local checkpoint."
        >
          <input
            type="text"
            value={form.model.pretrained_model_name_or_path}
            onChange={(event) =>
              onModelChange("pretrained_model_name_or_path", event.target.value)
            }
            placeholder="csebuetnlp/banglabert"
            className="gh-input h-9 w-full px-3"
          />
        </FormField>

        <FormField
          label="Tokenizer override"
          description="Leave blank to use the tokenizer supplied by the model checkpoint."
        >
          <input
            type="text"
            value={form.model.tokenizer_name_or_path ?? ""}
            onChange={(event) => {
              const value = event.target.value;

              onModelChange(
                "tokenizer_name_or_path",
                value.trim() ? value : null,
              );
            }}
            placeholder="Use checkpoint tokenizer"
            className="gh-input h-9 w-full px-3"
          />
        </FormField>

        <FormField
          label="Maximum sequence length"
          required
          description="Texts longer than this limit will be truncated during tokenization."
        >
          <NumberInput
            value={form.model.max_sequence_length}
            min={16}
            max={512}
            step={1}
            integer
            onChange={(value) => onModelChange("max_sequence_length", value)}
          />
        </FormField>

        <FormField
          label="Preprocessing version"
          required
          description="Identifies the reproducible text-preparation contract used by this run."
        >
          <input
            type="text"
            value={form.preprocessing_version}
            onChange={(event) =>
              onPreprocessingVersionChange(event.target.value)
            }
            placeholder="banglaguard-transformer-text-v1"
            className="gh-input h-9 w-full px-3"
          />
        </FormField>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <BooleanSetting
          label="Use fast tokenizer"
          description="Prefer the optimized Rust-backed tokenizer implementation when available."
          checked={form.model.use_fast_tokenizer}
          onChange={(checked) => onModelChange("use_fast_tokenizer", checked)}
        />

        <BooleanSetting
          label="Trust remote code"
          description="Allow custom repository code while loading the model or tokenizer."
          checked={form.model.trust_remote_code}
          onChange={(checked) => onModelChange("trust_remote_code", checked)}
        />

        <BooleanSetting
          label="Gradient checkpointing"
          description="Reduce memory usage by recomputing some activations during backpropagation."
          checked={form.model.gradient_checkpointing}
          onChange={(checked) =>
            onModelChange("gradient_checkpointing", checked)
          }
        />
      </div>

      {form.model.trust_remote_code ? (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--gh-attention-muted)] bg-[var(--gh-attention-subtle)] px-3 py-2.5">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[var(--gh-attention-fg)]" />

          <p className="text-xs leading-5 text-[var(--gh-fg-default)]">
            Only enable remote code for a checkpoint repository whose source
            code you have reviewed and trust.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function TransformerOptimizationSection({
  form,
  onChange,
}: {
  form: TransformerTrainingRequest;

  onChange: (
    key: TransformerOptimizationKey,
    value: TransformerOptimizationValue,
  ) => void;
}) {
  const effectiveBatchSize =
    form.optimization.train_batch_size *
    form.optimization.gradient_accumulation_steps;

  return (
    <section className="space-y-3">
      <SectionHeading
        icon={Gauge}
        title="Optimization"
        description="Configure training duration, batching, gradient updates and learning-rate behavior."
      />

      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        <FormField
          label="Training epochs"
          required
          description="Number of complete passes through the training split."
        >
          <NumberInput
            value={form.optimization.num_train_epochs}
            min={0.01}
            max={100}
            step={0.5}
            onChange={(value) => onChange("num_train_epochs", value)}
          />
        </FormField>

        <FormField
          label="Learning rate"
          required
          description="Initial optimizer learning rate."
        >
          <NumberInput
            value={form.optimization.learning_rate}
            min={0.00000001}
            max={1}
            step={0.000001}
            onChange={(value) => onChange("learning_rate", value)}
          />
        </FormField>

        <FormField
          label="Weight decay"
          description="Regularization applied to eligible model weights."
        >
          <NumberInput
            value={form.optimization.weight_decay}
            min={0}
            max={1}
            step={0.001}
            onChange={(value) => onChange("weight_decay", value)}
          />
        </FormField>

        <FormField
          label="Warmup ratio"
          description="Fraction of optimization steps used for learning-rate warmup."
        >
          <NumberInput
            value={form.optimization.warmup_ratio}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => onChange("warmup_ratio", value)}
          />
        </FormField>

        <FormField
          label="Training batch size"
          required
          description="Samples processed per device during each forward pass."
        >
          <NumberInput
            value={form.optimization.train_batch_size}
            min={1}
            max={512}
            step={1}
            integer
            onChange={(value) => onChange("train_batch_size", value)}
          />
        </FormField>

        <FormField
          label="Evaluation batch size"
          required
          description="Samples processed per device during validation and testing."
        >
          <NumberInput
            value={form.optimization.evaluation_batch_size}
            min={1}
            max={512}
            step={1}
            integer
            onChange={(value) => onChange("evaluation_batch_size", value)}
          />
        </FormField>

        <FormField
          label="Gradient accumulation"
          required
          description="Forward passes accumulated before one optimizer update."
        >
          <NumberInput
            value={form.optimization.gradient_accumulation_steps}
            min={1}
            max={1024}
            step={1}
            integer
            onChange={(value) => onChange("gradient_accumulation_steps", value)}
          />
        </FormField>

        <FormField
          label="Maximum gradient norm"
          required
          description="Gradient-clipping threshold used to improve training stability."
        >
          <NumberInput
            value={form.optimization.max_gradient_norm}
            min={0.0001}
            max={100}
            step={0.1}
            onChange={(value) => onChange("max_gradient_norm", value)}
          />
        </FormField>

        <FormField
          label="Optimizer"
          required
          description="Optimizer implementation used by the Hugging Face Trainer."
        >
          <select
            value={form.optimization.optimizer}
            onChange={(event) =>
              onChange(
                "optimizer",
                event.target
                  .value as TransformerTrainingRequest["optimization"]["optimizer"],
              )
            }
            className="gh-input h-9 w-full px-3"
          >
            <option value="adamw_torch">AdamW — PyTorch</option>

            <option value="adamw_hf">AdamW — Hugging Face</option>
          </select>
        </FormField>

        <FormField
          label="Scheduler"
          required
          description="Learning-rate schedule applied during training."
        >
          <select
            value={form.optimization.scheduler_type}
            onChange={(event) =>
              onChange(
                "scheduler_type",
                event.target
                  .value as TransformerTrainingRequest["optimization"]["scheduler_type"],
              )
            }
            className="gh-input h-9 w-full px-3"
          >
            <option value="linear">Linear</option>

            <option value="cosine">Cosine</option>

            <option value="cosine_with_restarts">Cosine with restarts</option>

            <option value="polynomial">Polynomial</option>

            <option value="constant">Constant</option>

            <option value="constant_with_warmup">Constant with warmup</option>
          </select>
        </FormField>
      </div>

      <div className="rounded-lg border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
        <p className="text-xs text-[var(--gh-fg-muted)]">
          Effective batch size
        </p>

        <p className="mt-1 text-sm font-semibold text-[var(--gh-fg-default)]">
          {effectiveBatchSize.toLocaleString()} samples per device update
        </p>

        <p className="mt-1 text-xs leading-5 text-[var(--gh-fg-muted)]">
          {form.optimization.train_batch_size} samples ×{" "}
          {form.optimization.gradient_accumulation_steps} accumulation steps
        </p>
      </div>
    </section>
  );
}

/* PHASE 22.4.4.2.3.4: EVALUATION AND CHECKPOINTS */

function TransformerEvaluationSection({
  form,
  onChange,
}: {
  form: TransformerTrainingRequest;

  onChange: (
    key: TransformerEvaluationKey,
    value: TransformerEvaluationValue,
  ) => void;
}) {
  const evaluationUsesSteps = form.evaluation.evaluation_strategy === "steps";

  const savingUsesSteps = form.evaluation.save_strategy === "steps";

  const earlyStoppingEnabled = form.evaluation.early_stopping_patience !== null;

  return (
    <section className="space-y-3">
      <SectionHeading
        icon={Save}
        title="Evaluation and checkpoints"
        description="Configure evaluation cadence, checkpoint persistence, best-model selection and early stopping."
      />

      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        <FormField
          label="Evaluation strategy"
          required
          description="Choose when validation runs during training."
        >
          <select
            value={form.evaluation.evaluation_strategy}
            onChange={(event) =>
              onChange(
                "evaluation_strategy",
                event.target
                  .value as TransformerTrainingRequest["evaluation"]["evaluation_strategy"],
              )
            }
            className="gh-input h-9 w-full px-3"
          >
            <option value="epoch">Every epoch</option>

            <option value="steps">Every N steps</option>

            <option value="no">Disabled</option>
          </select>
        </FormField>

        <FormField
          label="Save strategy"
          required
          description="Choose when training checkpoints are saved."
        >
          <select
            value={form.evaluation.save_strategy}
            onChange={(event) =>
              onChange(
                "save_strategy",
                event.target
                  .value as TransformerTrainingRequest["evaluation"]["save_strategy"],
              )
            }
            className="gh-input h-9 w-full px-3"
          >
            <option value="epoch">Every epoch</option>

            <option value="steps">Every N steps</option>

            <option value="no">Disabled</option>
          </select>
        </FormField>

        <FormField
          label="Logging steps"
          required
          description="Number of optimizer steps between training-log updates."
        >
          <NumberInput
            value={form.evaluation.logging_steps}
            min={1}
            max={1000000}
            step={1}
            integer
            onChange={(value) => onChange("logging_steps", value)}
          />
        </FormField>

        {evaluationUsesSteps ? (
          <FormField
            label="Evaluation steps"
            required
            description="Number of optimizer steps between validation runs."
          >
            <NullableNumberInput
              value={form.evaluation.evaluation_steps}
              min={1}
              max={1000000}
              step={1}
              integer
              placeholder="Required"
              onChange={(value) => onChange("evaluation_steps", value)}
            />
          </FormField>
        ) : null}

        {savingUsesSteps ? (
          <FormField
            label="Save steps"
            required
            description="Number of optimizer steps between checkpoint saves."
          >
            <NullableNumberInput
              value={form.evaluation.save_steps}
              min={1}
              max={1000000}
              step={1}
              integer
              placeholder="Required"
              onChange={(value) => onChange("save_steps", value)}
            />
          </FormField>
        ) : null}

        <FormField
          label="Checkpoint limit"
          description="Maximum number of recent checkpoints retained. Leave blank for no limit."
        >
          <NullableNumberInput
            value={form.evaluation.save_total_limit}
            min={1}
            max={100}
            step={1}
            integer
            placeholder="No limit"
            onChange={(value) => onChange("save_total_limit", value)}
          />
        </FormField>

        <FormField
          label="Best-model metric"
          required
          description="Metric used to compare and select checkpoints."
        >
          <input
            type="text"
            value={form.evaluation.metric_for_best_model}
            onChange={(event) =>
              onChange("metric_for_best_model", event.target.value)
            }
            placeholder="macro_f1"
            className="gh-input h-9 w-full px-3"
          />
        </FormField>

        <FormField
          label="Early-stopping threshold"
          description="Minimum metric improvement required to reset patience."
        >
          <NumberInput
            value={form.evaluation.early_stopping_threshold}
            min={0}
            max={100}
            step={0.0001}
            onChange={(value) => onChange("early_stopping_threshold", value)}
          />
        </FormField>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <BooleanSetting
          label="Load best model at end"
          description="Restore the highest-scoring checkpoint after training completes."
          checked={form.evaluation.load_best_model_at_end}
          onChange={(checked) => onChange("load_best_model_at_end", checked)}
        />

        <BooleanSetting
          label="Greater metric is better"
          description="Treat larger values of the selected metric as better."
          checked={form.evaluation.greater_is_better}
          onChange={(checked) => onChange("greater_is_better", checked)}
        />

        <BooleanSetting
          label="Enable early stopping"
          description="Stop training after the selected metric fails to improve."
          checked={earlyStoppingEnabled}
          onChange={(checked) =>
            onChange("early_stopping_patience", checked ? 2 : null)
          }
        />
      </div>

      {earlyStoppingEnabled ? (
        <div className="max-w-sm">
          <FormField
            label="Early-stopping patience"
            required
            description="Number of unsuccessful evaluations allowed before stopping."
          >
            <NullableNumberInput
              value={form.evaluation.early_stopping_patience}
              min={1}
              max={100}
              step={1}
              integer
              placeholder="2"
              onChange={(value) => onChange("early_stopping_patience", value)}
            />
          </FormField>
        </div>
      ) : null}
    </section>
  );
}

/* PHASE 22.4.4.2.3.4: RUNTIME CONFIGURATION */

function TransformerRuntimeSection({
  form,
  onChange,
}: {
  form: TransformerTrainingRequest;

  onChange: (
    key: TransformerRuntimeKey,
    value: TransformerRuntimeValue,
  ) => void;
}) {
  const mixedPrecisionEnabled = form.runtime.fp16 || form.runtime.bf16;

  return (
    <section className="space-y-3">
      <SectionHeading
        icon={Clock3}
        title="Runtime"
        description="Select the preferred compute device and configure precision and data-loader behavior."
      />

      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        <FormField
          label="Device preference"
          required
          description="The backend verifies whether the requested accelerator is available."
        >
          <select
            value={form.runtime.device_preference}
            onChange={(event) =>
              onChange(
                "device_preference",
                event.target
                  .value as TransformerTrainingRequest["runtime"]["device_preference"],
              )
            }
            className="gh-input h-9 w-full px-3"
          >
            <option value="auto">Automatic</option>

            <option value="mps">Apple Silicon MPS</option>

            <option value="cuda">NVIDIA CUDA</option>

            <option value="cpu">CPU</option>
          </select>
        </FormField>

        <FormField
          label="Data-loader workers"
          required
          description="Number of worker processes used to load training batches."
        >
          <NumberInput
            value={form.runtime.dataloader_num_workers}
            min={0}
            max={64}
            step={1}
            integer
            onChange={(value) => onChange("dataloader_num_workers", value)}
          />
        </FormField>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <BooleanSetting
          label="FP16 mixed precision"
          description="Use 16-bit floating-point operations where supported."
          checked={form.runtime.fp16}
          onChange={(checked) => onChange("fp16", checked)}
        />

        <BooleanSetting
          label="BF16 mixed precision"
          description="Use bfloat16 operations on compatible hardware."
          checked={form.runtime.bf16}
          onChange={(checked) => onChange("bf16", checked)}
        />

        <BooleanSetting
          label="Pin loader memory"
          description="Use page-locked host memory for compatible accelerators."
          checked={form.runtime.dataloader_pin_memory}
          onChange={(checked) => onChange("dataloader_pin_memory", checked)}
        />

        <BooleanSetting
          label="Disable progress output"
          description="Hide interactive Trainer progress bars and retain log records only."
          checked={form.runtime.disable_tqdm}
          onChange={(checked) => onChange("disable_tqdm", checked)}
        />
      </div>

      {mixedPrecisionEnabled ? (
        <div className="rounded-lg border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-3 py-2.5">
          <p className="text-xs leading-5 text-[var(--gh-fg-muted)]">
            Mixed-precision compatibility will be confirmed by the backend
            readiness check for the selected device.
          </p>
        </div>
      ) : null}
    </section>
  );
}

/* PHASE 22.4.4.2.3.5: OUTPUT CONFIGURATION */

function TransformerOutputSection({
  form,
  onChange,
}: {
  form: TransformerTrainingRequest;

  onChange: <Key extends TransformerOutputKey>(
    key: Key,
    value: TransformerTrainingRequest[Key],
  ) => void;
}) {
  const enabledOutputs = [
    form.save_probabilities,
    form.save_classification_report,
    form.save_confusion_matrix,
    form.save_predictions,
  ].filter(Boolean).length;

  return (
    <section className="space-y-3">
      <SectionHeading
        icon={FileOutput}
        title="Outputs and artifacts"
        description="Choose the evaluation evidence and prediction artifacts retained after Transformer training."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <BooleanSetting
          label="Prediction probabilities"
          description="Save class-probability distributions for validation and test predictions."
          checked={form.save_probabilities}
          onChange={(checked) => onChange("save_probabilities", checked)}
        />

        <BooleanSetting
          label="Classification report"
          description="Save per-label precision, recall, F1 score and support."
          checked={form.save_classification_report}
          onChange={(checked) =>
            onChange("save_classification_report", checked)
          }
        />

        <BooleanSetting
          label="Confusion matrix"
          description="Save validation and test confusion matrices with their label order."
          checked={form.save_confusion_matrix}
          onChange={(checked) => onChange("save_confusion_matrix", checked)}
        />

        <BooleanSetting
          label="Decoded predictions"
          description="Save predicted labels and supporting evaluation records."
          checked={form.save_predictions}
          onChange={(checked) => onChange("save_predictions", checked)}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)] px-4 py-3">
          <p className="text-xs text-[var(--gh-fg-muted)]">
            Enabled optional outputs
          </p>

          <p className="mt-1 text-sm font-semibold text-[var(--gh-fg-default)]">
            {enabledOutputs} of 4
          </p>

          <p className="mt-1 text-xs leading-5 text-[var(--gh-fg-muted)]">
            Core metrics, logs, model configuration, checkpoints and the final
            model artifact remain managed automatically by the backend.
          </p>
        </div>

        <div className="rounded-lg border border-[var(--gh-border-default)] px-4 py-3">
          <p className="text-xs font-medium text-[var(--gh-fg-default)]">
            Backend-managed artifact workspace
          </p>

          <p className="mt-1 text-xs leading-5 text-[var(--gh-fg-muted)]">
            BanglaGuard creates the experiment workspace, configuration,
            metadata, logs, checkpoints, predictions, metrics and final model
            directories during preparation and execution.
          </p>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof BrainCircuit;
  title: string;
  description: string;
}) {
  return (
    <header className="flex items-start gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--gh-border-default)] bg-[var(--gh-canvas-subtle)]">
        <Icon className="size-4 text-[var(--gh-accent-fg)]" />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[var(--gh-fg-default)]">
          {title}
        </h3>

        <p className="mt-1 text-xs leading-5 text-[var(--gh-fg-muted)]">
          {description}
        </p>
      </div>
    </header>
  );
}

function FormField({
  label,
  description,
  required = false,
  children,
}: {
  label: string;
  description?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[var(--gh-fg-default)]">
        {label}

        {required ? (
          <span className="ml-1 text-[var(--gh-danger-fg)]">*</span>
        ) : null}
      </span>

      <span className="mt-1.5 block">{children}</span>
      {description ? (
        <span className="mt-1 block text-xs leading-4 text-[var(--gh-fg-muted)]">{description}</span>
      ) : null}

    </label>
  );
}

function NumberInput({
  value,
  min,
  max,
  step,
  integer = false,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
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
        const parsed = event.target.valueAsNumber;

        if (!Number.isFinite(parsed)) {
          return;
        }

        onChange(integer ? Math.trunc(parsed) : parsed);
      }}
      className="gh-input h-9 w-full px-3"
    />
  );
}

function NullableNumberInput({
  value,
  min,
  max,
  step,
  integer = false,
  placeholder,
  onChange,
}: {
  value: number | null;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  placeholder?: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onChange={(event) => {
        if (!event.target.value.trim()) {
          onChange(null);

          return;
        }

        const parsed = event.target.valueAsNumber;

        if (!Number.isFinite(parsed)) {
          return;
        }

        onChange(integer ? Math.trunc(parsed) : parsed);
      }}
      className="gh-input h-9 w-full px-3"
    />
  );
}

function BooleanSetting({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-full cursor-pointer items-start gap-3 rounded-lg border border-[var(--gh-border-default)] p-3 hover:bg-[var(--gh-canvas-subtle)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 rounded border-[var(--gh-border-default)]"
      />

      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--gh-fg-default)]">
          {label}
        </span>

        <span className="mt-1 block text-xs leading-5 text-[var(--gh-fg-muted)]">
          {description}
        </span>
      </span>
    </label>
  );
}
