export type AnalysisTask = "hate_speech" | "sentiment";

export type PredictionStatus = "completed" | "failed";

export type ModelStatus = "draft" | "active" | "retired";

export type PredictionRequest = {
  text: string;
  task: AnalysisTask;
  model_version_id: string | null;
  include_explanation: boolean;
};

export type PredictionRead = {
  id: string;
  user_id: string | null;
  model_version_id: string;
  task: AnalysisTask;
  status: PredictionStatus;

  input_text: string | null;
  normalized_text: string | null;
  language_form: string | null;

  predicted_label: string;
  confidence: number;
  probabilities: Record<string, number> | null;
  explanation: Record<string, unknown> | null;
  latency_ms: number | null;
  error_message: string | null;

  created_at: string;
  updated_at: string;
};

// PHASE 22.5.5B.1: MODEL ACTIVATION READINESS
export type ModelActivationReadinessRead = {
  model_version_id: string;
  task: AnalysisTask;
  architecture: string;
  status: ModelStatus;
  ready: boolean;
  reason: string | null;
};

export type ModelVersionRead = {
  is_archived?: boolean;
  id: string;
  name: string;
  version: string;
  task: AnalysisTask;
  architecture: string;
  artifact_path: string;
  tokenizer_path: string | null;
  preprocessing_version: string | null;
  metrics: Record<string, unknown> | null;
  configuration: Record<string, unknown> | null;
  is_explainable: boolean;
  status: ModelStatus;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
};
