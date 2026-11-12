import type { TrainingJob } from "@/components/experiments/training-progress";
import { api } from "@/lib/api";

import type {
  ExperimentCreate,
  ExperimentListQuery,
  ExperimentRead,
  ExperimentUpdate,
} from "@/types/experiment-management";

export async function listExperiments(
  query: ExperimentListQuery = {},
): Promise<ExperimentRead[]> {
  const response = await api.get<ExperimentRead[]>("/experiments", {
    params: query,
  });

  return response.data;
}

export async function getExperiment(
  experimentId: string,
): Promise<ExperimentRead> {
  const response = await api.get<ExperimentRead>(
    `/experiments/${experimentId}`,
  );

  return response.data;
}

export async function createExperiment(
  payload: ExperimentCreate,
): Promise<ExperimentRead> {
  const response = await api.post<ExperimentRead>("/experiments", payload);

  return response.data;
}

export async function updateExperiment(
  experimentId: string,
  payload: ExperimentUpdate,
): Promise<ExperimentRead> {
  const response = await api.patch<ExperimentRead>(
    `/experiments/${experimentId}`,
    payload,
  );

  return response.data;
}

/* -------------------------------------------------------------------------- */
/* Classical training workflow                                                */
/* -------------------------------------------------------------------------- */

import type {
  ClassicalModelRegistrationRead,
  ClassicalTrainingRequest,
  PreparedClassicalExperimentRead,
  TrainingReadinessRead,
} from "@/types/experiment-management";

export async function evaluateTrainingReadiness(
  payload: ClassicalTrainingRequest,
): Promise<TrainingReadinessRead> {
  const response = await api.post<TrainingReadinessRead>(
    "/experiments/training-readiness",
    payload,
  );

  return response.data;
}

export async function prepareClassicalExperiment(
  payload: ClassicalTrainingRequest,
): Promise<PreparedClassicalExperimentRead> {
  const response = await api.post<PreparedClassicalExperimentRead>(
    "/experiments/prepare-classical",
    payload,
  );

  return response.data;
}

export async function executeClassicalExperiment(
  experimentId: string,
): Promise<TrainingJob> {
  const response = await api.post<TrainingJob>(
    `/experiments/${experimentId}/execute-classical`,
    undefined,
    { timeout: 30000 }, // Returns immediately after durable queue submission.
  );

  return response.data;
}

export async function registerClassicalModel(
  experimentId: string,
  identity?: { name: string; version: string },
): Promise<ClassicalModelRegistrationRead> {
  const response = await api.post<ClassicalModelRegistrationRead>(
    `/experiments/${experimentId}/register-classical-model`,
    identity,
  );

  return response.data;
}

/* -------------------------------------------------------------------------- */
/* Transformer training workflow                                              */
/* -------------------------------------------------------------------------- */

import type {
  PreparedTransformerExperimentRead,
  TransformerModelRegistrationRead,
  TransformerTrainingReadinessRead,
  TransformerTrainingRequest,
} from "@/types/experiment-management";

/**
 * Evaluate whether a registered dataset and Transformer configuration
 * are ready for BanglaBERT sequence-classification training.
 */
export async function evaluateTransformerTrainingReadiness(
  payload: TransformerTrainingRequest,
): Promise<TransformerTrainingReadinessRead> {
  const response = await api.post<TransformerTrainingReadinessRead>(
    "/experiments/transformer-training-readiness",
    payload,
  );

  return response.data;
}

/**
 * Create the reproducible workspace and planned experiment record
 * required before Transformer training can begin.
 */
export async function prepareTransformerExperiment(
  payload: TransformerTrainingRequest,
): Promise<PreparedTransformerExperimentRead> {
  const response = await api.post<PreparedTransformerExperimentRead>(
    "/experiments/prepare-transformer",
    payload,
  );

  return response.data;
}

/**
 * Execute a previously prepared Transformer experiment.
 */
export async function executeTransformerExperiment(
  experimentId: string,
): Promise<TrainingJob> {
  const response = await api.post<TrainingJob>(
    `/experiments/${experimentId}/execute-transformer`,
    undefined,
    { timeout: 30000 }, // Returns immediately after durable queue submission.
  );

  return response.data;
}

/**
 * Register the trained Transformer artifact as a BanglaGuard
 * model version after successful experiment execution.
 */
export async function registerTransformerModel(
  experimentId: string,
  identity?: { name: string; version: string },
): Promise<TransformerModelRegistrationRead> {
  const response = await api.post<TransformerModelRegistrationRead>(
    `/experiments/${experimentId}/register-transformer-model`,
    identity,
  );

  return response.data;
}
