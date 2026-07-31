import { api } from "@/lib/api";

import type {
  ModelVersionRead,
  PredictionRead,
  PredictionRequest,
} from "@/types/prediction";

export async function createPrediction(
  payload: PredictionRequest,
): Promise<PredictionRead> {
  const response = await api.post<PredictionRead>(
    "/predictions",
    payload,
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  return response.data;
}

export async function listPredictions(
  limit = 10,
  offset = 0,
): Promise<PredictionRead[]> {
  const response = await api.get<PredictionRead[]>(
    "/predictions",
    {
      params: {
        limit,
        offset,
      },
    },
  );

  return response.data;
}

export async function listModelVersions(): Promise<
  ModelVersionRead[]
> {
  const response = await api.get<ModelVersionRead[]>(
    "/model-versions",
  );

  return response.data;
}
