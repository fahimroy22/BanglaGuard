export type FeedbackVerdict = "correct" | "incorrect" | "unsure";

export type FeedbackStatus = "pending" | "reviewed" | "rejected";

export type FeedbackCreate = {
  prediction_id: string;
  verdict: FeedbackVerdict;
  corrected_label: string | null;
  comment: string | null;
};

export type FeedbackReview = {
  status: FeedbackStatus;
  reviewer_note: string | null;
};

export type FeedbackRead = {
  id: string;
  prediction_id: string;

  user_id: string | null;
  reviewed_by_id: string | null;

  verdict: FeedbackVerdict;
  status: FeedbackStatus;

  corrected_label: string | null;
  comment: string | null;
  reviewer_note: string | null;
  reviewed_at: string | null;

  created_at: string;
  updated_at: string;
};

export type FeedbackReviewItem = FeedbackRead & {
  prediction_text: string | null;
  normalized_text: string | null;

  task: "hate_speech" | "sentiment";

  predicted_label: string;
  confidence: number;

  model_version_id: string;
  model_name: string;
  model_version: string;
};

export type ActiveLearningPriority = "high" | "medium" | "low";

export type ActiveLearningFeedbackSummary = {
  total: number;
  correct: number;
  incorrect: number;
  unsure: number;

  pending: number;
  reviewed: number;
  rejected: number;
};

export type ActiveLearningItem = {
  prediction_id: string;
  user_id: string | null;

  task: "hate_speech" | "sentiment";

  status: string;

  prediction_text: string | null;
  normalized_text: string | null;

  predicted_label: string;
  confidence: number;
  probabilities: Record<string, number> | null;

  model_version_id: string;
  model_name: string;
  model_version: string;

  priority_score: number;
  priority_level: ActiveLearningPriority;

  selection_reasons: string[];

  probability_margin: number | null;

  feedback: ActiveLearningFeedbackSummary;

  created_at: string;
};

export type DatasetBuilderItem = {
  feedback_id: string;
  prediction_id: string;

  feedback_user_id: string | null;
  reviewed_by_id: string | null;

  reviewer_name: string | null;
  reviewer_email: string | null;

  verdict: FeedbackVerdict;
  feedback_status: FeedbackStatus;

  text: string | null;
  normalized_text: string | null;

  task: "hate_speech" | "sentiment";

  predicted_label: string;
  corrected_label: string | null;
  final_label: string | null;

  is_dataset_ready: boolean;
  readiness_reasons: string[];

  confidence: number;
  probabilities: Record<string, number> | null;

  model_version_id: string;
  model_name: string;
  model_version: string;

  user_comment: string | null;
  reviewer_note: string | null;

  feedback_created_at: string;
  prediction_created_at: string;
  reviewed_at: string | null;
};

export type DatasetBuilderSummary = {
  total_records: number;
  dataset_ready: number;
  needs_review: number;

  correct: number;
  incorrect: number;
  unsure: number;

  reviewed: number;
  pending: number;
  rejected: number;

  unique_labels: string[];
  unique_reviewers: number;

  average_confidence: number | null;
  duplicate_texts: number;
};

export type DatasetBuilderResponse = {
  items: DatasetBuilderItem[];
  summary: DatasetBuilderSummary;
};
