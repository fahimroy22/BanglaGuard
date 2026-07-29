export type LabelDistributionItem = {
  label: string;
  count: number;
  percentage?: number | null;
};

export type ModelUsageItem = {
  model_version_id: string;
  model_name: string;
  model_version: string;
  architecture?: string | null;
  prediction_count: number;
  percentage?: number | null;
};

export type FeedbackSummary = {
  total_feedback?: number;
  feedback_count?: number;

  correct_feedback?: number;
  incorrect_feedback?: number;
  pending_feedback?: number;

  observed_feedback_accuracy?: number | null;
  observed_accuracy?: number | null;
};

export type PredictionSummary = {
  total_predictions: number;
  completed_predictions: number;
  failed_predictions: number;

  average_confidence: number | null;
  average_latency_ms: number | null;

  minimum_confidence: number | null;
  maximum_confidence: number | null;

  label_distribution: LabelDistributionItem[];
  model_usage: ModelUsageItem[];
  feedback: FeedbackSummary;
};

export type DailyPredictionItem = {
  date: string;

  prediction_count?: number;
  total_predictions?: number;

  completed_predictions?: number;
  failed_predictions?: number;

  average_confidence?: number | null;
  average_latency_ms?: number | null;
};

export type AnalyticsDashboard = {
  summary: PredictionSummary;
  daily_predictions: DailyPredictionItem[];
};

export type ModelComparisonItem = {
  model_version_id: string;
  model_name: string;
  model_version: string;
  architecture: string;
  status: string;

  prediction_count: number;
  average_confidence: number | null;
  average_latency_ms: number | null;

  feedback_count: number;
  correct_feedback: number;
  incorrect_feedback: number;

  observed_feedback_accuracy: number | null;

  registered_metrics: Record<
    string,
    unknown
  >;
};
