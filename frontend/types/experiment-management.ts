export type ExperimentStatus = "planned" | "running" | "completed" | "failed";

export type ExperimentJsonValue =
  | string
  | number
  | boolean
  | null
  | ExperimentJsonValue[]
  | {
      [key: string]: ExperimentJsonValue;
    };

export type ExperimentJsonObject = {
  [key: string]: ExperimentJsonValue;
};

export type ExperimentCreate = {
  name: string;
  description?: string | null;

  dataset_version_id: string;
  model_version_id?: string | null;

  random_seed?: number | null;
  code_version?: string | null;

  configuration?: ExperimentJsonObject | null;
  results?: ExperimentJsonObject | null;
};

export type ExperimentUpdate = {
  status?: ExperimentStatus | null;
  model_version_id?: string | null;

  configuration?: ExperimentJsonObject | null;
  results?: ExperimentJsonObject | null;

  started_at?: string | null;
  completed_at?: string | null;
};

export type ExperimentRead = {
  id: string;

  name: string;
  description: string | null;

  status: ExperimentStatus;

  dataset_version_id: string;
  model_version_id: string | null;

  random_seed: number | null;
  code_version: string | null;

  configuration: ExperimentJsonObject | null;
  results: ExperimentJsonObject | null;

  started_at: string | null;
  completed_at: string | null;

  created_at: string;
  updated_at: string;
};

export type ExperimentListQuery = {
  dataset_version_id?: string;
};

/* -------------------------------------------------------------------------- */
/* Classical training                                                         */
/* -------------------------------------------------------------------------- */

export type ClassicalModelFamily = "tfidf_logistic_regression";

export type TfidfAnalyzer = "word" | "char" | "char_wb";

export type TfidfNorm = "l1" | "l2" | null;

export type LogisticRegressionSolver =
  "lbfgs" | "liblinear" | "newton-cg" | "newton-cholesky" | "sag" | "saga";

export type LogisticRegressionPenalty = "l1" | "l2" | "elasticnet" | null;

export type TfidfTrainingConfiguration = {
  analyzer: TfidfAnalyzer;

  lowercase: boolean;
  strip_accents: null;

  ngram_min: number;
  ngram_max: number;

  min_df: number;
  max_df: number;
  max_features: number | null;

  sublinear_tf: boolean;
  use_idf: boolean;
  smooth_idf: boolean;

  norm: TfidfNorm;
};

export type LogisticRegressionTrainingConfiguration = {
  penalty: LogisticRegressionPenalty;
  solver: LogisticRegressionSolver;

  regularization_c: number;
  max_iter: number;

  class_weight: "balanced" | null;

  tolerance: number;
  fit_intercept: boolean;

  l1_ratio: number | null;
};

export type ClassicalTrainingRequest = {
  research_question?: string;
  research_notes?: string;
  dataset_version_id: string;

  experiment_name: string;
  experiment_description?: string | null;

  model_name: string;
  model_version: string;

  model_family: ClassicalModelFamily;

  random_seed: number;
  code_version?: string | null;

  preprocessing_version: string;

  tfidf: TfidfTrainingConfiguration;
  classifier: LogisticRegressionTrainingConfiguration;

  save_probabilities: boolean;
  save_classification_report: boolean;
  save_confusion_matrix: boolean;
};

export type TrainingArtifactPaths = {
  manifest: string;
  processed: string;
  train: string;
  validation: string;
  test: string;
};

export type TrainingReadinessRead = {
  dataset_version_id: string;

  dataset_name: string;
  dataset_version: string;
  task: string;

  training_ready: boolean;
  quality_status: string;
  quality_score: number;

  total_samples: number;
  train_samples: number;
  validation_samples: number;
  test_samples: number;

  labels: string[];
  label_distribution: Record<string, number>;

  artifact_paths: TrainingArtifactPaths;

  warnings: string[];
  errors: string[];
  recommendations: string[];

  configuration: ExperimentJsonObject;
};

export type TrainingExperimentPaths = {
  workspace: string;
  configuration: string;
  metadata: string;
  logs: string;
  artifacts: string;
  metrics: string;
};

export type PreparedClassicalExperimentRead = {
  experiment_id: string;

  name: string;
  status: string;

  dataset_version_id: string;
  model_version_id: string | null;

  task: string;
  random_seed: number;
  code_version: string | null;

  training_ready: boolean;
  quality_score: number;

  workspace_paths: TrainingExperimentPaths;

  configuration: ExperimentJsonObject;
  created_at: string;
};

export type ClassicalTrainingExecutionRead = {
  experiment_id: string;
  status: string;

  dataset_version_id: string;
  model_version_id: string | null;

  model_name: string;
  model_version: string;
  model_family: string;
  task: string;

  started_at: string;
  completed_at: string;
  duration_seconds: number;

  artifact_path: string;
  training_log_path: string;
  execution_result_path: string;

  validation_metrics: Record<string, number>;
  test_metrics: Record<string, number>;

  model_version_registered: boolean;
};

export type ClassicalModelRegistrationRead = {
  experiment_id: string;
  model_version_id: string;

  name: string;
  version: string;
  task: string;
  architecture: string;
  status: string;

  artifact_path: string;
  preprocessing_version: string | null;

  metrics: ExperimentJsonObject;
  configuration: ExperimentJsonObject;

  is_explainable: boolean;
  experiment_linked: boolean;

  created_at: string;
};

export const DEFAULT_CLASSICAL_TRAINING_REQUEST = {
  dataset_version_id: "",

  experiment_name: "",
  experiment_description: null,

  model_name: "BanglaGuard Classical Hate Speech Model",
  model_version: "1.0.0",

  model_family: "tfidf_logistic_regression",

  random_seed: 42,
  code_version: null,

  preprocessing_version: "banglaguard-text-v1",

  tfidf: {
    analyzer: "word",

    lowercase: false,
    strip_accents: null,

    ngram_min: 1,
    ngram_max: 2,

    min_df: 2,
    max_df: 0.98,
    max_features: 100000,

    sublinear_tf: true,
    use_idf: true,
    smooth_idf: true,

    norm: "l2",
  },

  classifier: {
    penalty: "l2",
    solver: "liblinear",

    regularization_c: 1,
    max_iter: 2000,

    class_weight: "balanced",

    tolerance: 0.0001,
    fit_intercept: true,

    l1_ratio: null,
  },

  save_probabilities: true,
  save_classification_report: true,
  save_confusion_matrix: true,
} satisfies ClassicalTrainingRequest;

/* TRANSFORMER TRAINING CONTRACTS: START */

/* -------------------------------------------------------------------------- */
/* Transformer training                                                       */
/* -------------------------------------------------------------------------- */

export type TransformerModelFamily = "banglabert_sequence_classification";

export type TransformerDevicePreference = "auto" | "cuda" | "mps" | "cpu";

export type TransformerEvaluationStrategy = "no" | "steps" | "epoch";

export type TransformerSaveStrategy = "no" | "steps" | "epoch";

export type TransformerSchedulerType =
  | "linear"
  | "cosine"
  | "cosine_with_restarts"
  | "polynomial"
  | "constant"
  | "constant_with_warmup";

export type TransformerOptimizerName = "adamw_torch" | "adamw_hf";

export type TransformerModelConfiguration = {
  pretrained_model_name_or_path: string;
  tokenizer_name_or_path: string | null;

  max_sequence_length: number;

  use_fast_tokenizer: boolean;
  trust_remote_code: boolean;
  gradient_checkpointing: boolean;
};

export type TransformerOptimizationConfiguration = {
  num_train_epochs: number;

  train_batch_size: number;
  evaluation_batch_size: number;

  learning_rate: number;
  weight_decay: number;
  warmup_ratio: number;

  gradient_accumulation_steps: number;
  max_gradient_norm: number;

  optimizer: TransformerOptimizerName;
  scheduler_type: TransformerSchedulerType;
};

export type TransformerEvaluationConfiguration = {
  evaluation_strategy: TransformerEvaluationStrategy;

  save_strategy: TransformerSaveStrategy;

  logging_steps: number;

  evaluation_steps: number | null;
  save_steps: number | null;
  save_total_limit: number | null;

  load_best_model_at_end: boolean;
  metric_for_best_model: string;
  greater_is_better: boolean;

  early_stopping_patience: number | null;
  early_stopping_threshold: number;
};

export type TransformerRuntimeConfiguration = {
  device_preference: TransformerDevicePreference;

  fp16: boolean;
  bf16: boolean;

  dataloader_num_workers: number;
  dataloader_pin_memory: boolean;

  disable_tqdm: boolean;
};

export type TransformerTrainingRequest = {
  research_question?: string;
  research_notes?: string;
  dataset_version_id: string;

  experiment_name: string;
  experiment_description?: string | null;

  model_name: string;
  model_version: string;

  model_family: TransformerModelFamily;

  random_seed: number;
  code_version?: string | null;

  preprocessing_version: string;

  model: TransformerModelConfiguration;

  optimization: TransformerOptimizationConfiguration;

  evaluation: TransformerEvaluationConfiguration;

  runtime: TransformerRuntimeConfiguration;

  save_probabilities: boolean;
  save_classification_report: boolean;
  save_confusion_matrix: boolean;
  save_predictions: boolean;
};

export type TransformerTrainingReadinessRead = {
  dataset_version_id: string;

  dataset_name: string;
  dataset_version: string;
  task: string;

  training_ready: boolean;
  quality_status: string;
  quality_score: number;

  total_samples: number;
  train_samples: number;
  validation_samples: number;
  test_samples: number;

  labels: string[];
  label_distribution: Record<string, number>;

  artifact_paths: TrainingArtifactPaths;

  requested_device: string;
  resolved_device: string;

  pretrained_model_name_or_path: string;
  tokenizer_name_or_path: string;

  warnings: string[];
  errors: string[];
  recommendations: string[];

  configuration: ExperimentJsonObject;
};

export type PreparedTransformerExperimentRead = {
  experiment_id: string;

  name: string;
  status: string;

  dataset_version_id: string;
  model_version_id: string | null;

  task: string;
  model_family: string;

  random_seed: number;
  code_version: string | null;

  training_ready: boolean;
  quality_score: number;

  requested_device: string;
  resolved_device: string;

  workspace_paths: TrainingExperimentPaths;

  configuration: ExperimentJsonObject;
  created_at: string;
};

export type TransformerTrainingExecutionRead = {
  experiment_id: string;
  status: string;

  dataset_version_id: string;
  model_version_id: string | null;

  model_name: string;
  model_version: string;
  model_family: string;
  task: string;

  pretrained_model_name_or_path: string;
  tokenizer_path: string;

  requested_device: string;
  resolved_device: string;

  started_at: string;
  completed_at: string;
  duration_seconds: number;

  artifact_path: string;
  best_checkpoint_path: string | null;

  training_log_path: string;
  trainer_state_path: string | null;
  execution_result_path: string;

  training_metrics: Record<string, number>;
  validation_metrics: Record<string, number>;
  test_metrics: Record<string, number>;

  checkpoint_paths: string[];

  model_version_registered: boolean;
};

export type TransformerModelRegistrationRead = {
  experiment_id: string;
  model_version_id: string;

  name: string;
  version: string;
  task: string;
  architecture: string;
  status: string;

  artifact_path: string;
  tokenizer_path: string;
  preprocessing_version: string | null;

  metrics: ExperimentJsonObject;
  configuration: ExperimentJsonObject;

  is_explainable: boolean;
  experiment_linked: boolean;

  created_at: string;
};

export const DEFAULT_TRANSFORMER_TRAINING_REQUEST = {
  dataset_version_id: "",

  experiment_name: "",
  experiment_description: null,

  model_name: "BanglaGuard BanglaBERT Model",

  model_version: "1.0.0",

  model_family: "banglabert_sequence_classification",

  random_seed: 42,
  code_version: null,

  preprocessing_version: "banglaguard-transformer-text-v1",

  model: {
    pretrained_model_name_or_path: "csebuetnlp/banglabert",

    tokenizer_name_or_path: null,

    max_sequence_length: 256,

    use_fast_tokenizer: true,
    trust_remote_code: false,
    gradient_checkpointing: false,
  },

  optimization: {
    num_train_epochs: 3,

    train_batch_size: 8,
    evaluation_batch_size: 16,

    learning_rate: 0.00002,
    weight_decay: 0.01,
    warmup_ratio: 0.1,

    gradient_accumulation_steps: 1,
    max_gradient_norm: 1,

    optimizer: "adamw_torch",
    scheduler_type: "linear",
  },

  evaluation: {
    evaluation_strategy: "epoch",
    save_strategy: "epoch",

    logging_steps: 50,

    evaluation_steps: null,
    save_steps: null,
    save_total_limit: 2,

    load_best_model_at_end: true,

    metric_for_best_model: "macro_f1",

    greater_is_better: true,

    early_stopping_patience: 2,
    early_stopping_threshold: 0,
  },

  runtime: {
    device_preference: "auto",

    fp16: false,
    bf16: false,

    dataloader_num_workers: 0,
    dataloader_pin_memory: false,

    disable_tqdm: true,
  },

  save_probabilities: true,
  save_classification_report: true,
  save_confusion_matrix: true,
  save_predictions: true,
} satisfies TransformerTrainingRequest;

/* TRANSFORMER TRAINING CONTRACTS: END */
