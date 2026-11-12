import { api } from "@/lib/api";

import type {
  ActiveLearningItem,
  ActiveLearningPriority,
  DatasetBuilderResponse,
  FeedbackCreate,
  FeedbackRead,
  FeedbackReview,
  FeedbackReviewItem,
  FeedbackStatus,
} from "@/types/feedback";

export async function listMyFeedback(
  limit = 100,
  offset = 0,
): Promise<FeedbackRead[]> {
  const response = await api.get<FeedbackRead[]>("/feedback/me", {
    params: {
      limit,
      offset,
    },
  });

  return response.data;
}

export async function listFeedbackForReview(
  status: FeedbackStatus | null = null,
  limit = 100,
  offset = 0,
): Promise<FeedbackReviewItem[]> {
  const response = await api.get<FeedbackReviewItem[]>("/feedback/review", {
    params: {
      status: status ?? undefined,
      limit,
      offset,
    },
  });

  return response.data;
}

export async function createFeedback(
  payload: FeedbackCreate,
): Promise<FeedbackRead> {
  const response = await api.post<FeedbackRead>("/feedback", payload);

  return response.data;
}

export async function reviewFeedback(
  feedbackId: string,
  payload: FeedbackReview,
): Promise<FeedbackRead> {
  const response = await api.patch<FeedbackRead>(
    `/feedback/${feedbackId}/review`,
    payload,
  );

  return response.data;
}

export async function listActiveLearningCandidates(
  task: "hate_speech" | "sentiment" | null = null,
  priority: ActiveLearningPriority | null = null,
  limit = 100,
  offset = 0,
): Promise<ActiveLearningItem[]> {
  const response = await api.get<ActiveLearningItem[]>(
    "/feedback/active-learning",
    {
      params: {
        task: task ?? undefined,
        priority: priority ?? undefined,
        limit,
        offset,
      },
    },
  );

  return response.data;
}

export type DatasetBuilderQuery = {
  task: "hate_speech" | "sentiment" | null;

  status: FeedbackStatus | null;

  final_label: string | null;
  reviewer_id: string | null;
  model_version_id: string | null;

  reviewed_from: string | null;
  reviewed_to: string | null;

  ready_only: boolean;

  limit: number;
  offset: number;
};

export async function listDatasetBuilderItems(
  query: Partial<DatasetBuilderQuery> = {},
): Promise<DatasetBuilderResponse> {
  const response = await api.get<DatasetBuilderResponse>(
    "/feedback/dataset-builder",
    {
      params: {
        task: query.task ?? undefined,
        status: query.status ?? undefined,
        final_label: query.final_label ?? undefined,
        reviewer_id: query.reviewer_id ?? undefined,
        model_version_id: query.model_version_id ?? undefined,
        reviewed_from: query.reviewed_from ?? undefined,
        reviewed_to: query.reviewed_to ?? undefined,
        ready_only: query.ready_only ?? false,
        limit: query.limit ?? 500,
        offset: query.offset ?? 0,
      },
    },
  );

  return response.data;
}
