import { api } from "@/lib/api";

import type {
  ModelActivationReadinessRead,
  ModelVersionRead,
  PredictionRead,
  PredictionRequest,
} from "@/types/prediction";

export async function createPrediction(
  payload: PredictionRequest,
): Promise<PredictionRead> {
  const response = await api.post<PredictionRead>("/predictions", payload, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  return response.data;
}

export async function listPredictions(
  limit = 10,
  offset = 0,
): Promise<PredictionRead[]> {
  const response = await api.get<PredictionRead[]>("/predictions", {
    params: {
      limit,
      offset,
    },
  });

  return response.data;
}

export async function listModelVersions(): Promise<ModelVersionRead[]> {
  const response = await api.get<ModelVersionRead[]>("/model-versions");

  return response.data;
}

export async function getModelActivationReadiness(
  modelVersionId: string,
): Promise<ModelActivationReadinessRead> {
  const response = await api.get<ModelActivationReadinessRead>(
    `/model-versions/${modelVersionId}/activation-readiness`,
  );

  return response.data;
}

export async function activateModelVersion(
  modelVersionId: string,
): Promise<ModelVersionRead> {
  const response = await api.patch<ModelVersionRead>(
    `/model-versions/${modelVersionId}/activate`,
  );

  return response.data;
}

export async function archiveModelVersion(input: { id: string; archived: boolean }): Promise<ModelVersionRead> {
  const response = await api.patch<ModelVersionRead>(`/model-versions/${input.id}/archive`, { archived: input.archived });
  return response.data;
}
