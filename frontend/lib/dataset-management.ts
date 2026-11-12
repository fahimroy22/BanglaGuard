import { api } from "@/lib/api";

import type {
  DatasetCleanedVersionCreate,
  DatasetCleanedVersionRead,
  DatasetDirectUploadRequest,
  DatasetFilePreviewQuery,
  DatasetFilePreviewRead,
  DatasetFileStatisticsRead,
  DatasetFilesRead,
  DatasetInspectionRead,
  DatasetManifestRead,
  DatasetMappingValidationRequest,
  DatasetMappingValidationResponse,
  DatasetQualityReportRead,
  DatasetRegistrationRequest,
  DatasetRegistryQuery,
  DatasetRegistryRead,
  DatasetRegistrySummary,
  DatasetVersionRead,
} from "@/types/dataset-management";

/* -------------------------------------------------------------------------- */
/* Inspection                                                                  */
/* -------------------------------------------------------------------------- */

export async function inspectDataset(
  file: File,
): Promise<DatasetInspectionRead> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post<DatasetInspectionRead>(
    "/datasets/inspect",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return response.data;
}

/* -------------------------------------------------------------------------- */
/* Validate mapping                                                            */
/* -------------------------------------------------------------------------- */

export async function validateDatasetMapping(
  payload: DatasetMappingValidationRequest,
): Promise<DatasetMappingValidationResponse> {
  const response =
    await api.post<DatasetMappingValidationResponse>(
      "/datasets/validate-mapping",
      payload,
    );

  return response.data;
}

/* -------------------------------------------------------------------------- */
/* Register dataset                                                            */
/* -------------------------------------------------------------------------- */

export async function registerDataset(
  payload: DatasetRegistrationRequest,
): Promise<DatasetVersionRead> {
  const response = await api.post<DatasetVersionRead>(
    "/datasets/register",
    payload,
  );

  return response.data;
}

/* -------------------------------------------------------------------------- */
/* Direct upload                                                               */
/* -------------------------------------------------------------------------- */

export async function uploadDataset(
  payload: DatasetDirectUploadRequest,
): Promise<DatasetVersionRead> {
  const formData = new FormData();

  formData.append("file", payload.file);

  formData.append("name", payload.name);
  formData.append("version", payload.version);
  formData.append("task", payload.task);

  if (payload.description) {
    formData.append("description", payload.description);
  }

  if (payload.source_name) {
    formData.append("source_name", payload.source_name);
  }

  if (payload.source_url) {
    formData.append("source_url", payload.source_url);
  }

  if (payload.license_name) {
    formData.append("license_name", payload.license_name);
  }

  const response = await api.post<DatasetVersionRead>(
    "/datasets/upload",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return response.data;
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

export async function listDatasets(
  query: DatasetRegistryQuery = {},
): Promise<DatasetRegistryRead> {
  const response = await api.get<DatasetRegistryRead>(
    "/datasets",
    {
      params: query,
    },
  );

  return response.data;
}

export async function getDatasetSummary(): Promise<DatasetRegistrySummary> {
  const response =
    await api.get<DatasetRegistrySummary>(
      "/datasets/summary",
    );

  return response.data;
}

export async function getDataset(
  datasetId: string,
): Promise<DatasetVersionRead> {
  const response =
    await api.get<DatasetVersionRead>(
      `/datasets/${datasetId}`,
    );

  return response.data;
}

/* -------------------------------------------------------------------------- */
/* Manifest                                                                     */
/* -------------------------------------------------------------------------- */

export async function getDatasetManifest(
  datasetId: string,
): Promise<DatasetManifestRead> {
  const response =
    await api.get<DatasetManifestRead>(
      `/datasets/${datasetId}/manifest`,
    );

  return response.data;
}

/* -------------------------------------------------------------------------- */
/* Files                                                                        */
/* -------------------------------------------------------------------------- */

export async function getDatasetFiles(
  datasetId: string,
): Promise<DatasetFilesRead> {
  const response =
    await api.get<DatasetFilesRead>(
      `/datasets/${datasetId}/files`,
    );

  return response.data;
}

export async function previewDatasetFile(
  datasetId: string,
  fileKey: string,
  query: DatasetFilePreviewQuery = {},
): Promise<DatasetFilePreviewRead> {
  const response =
    await api.get<DatasetFilePreviewRead>(
      `/datasets/${datasetId}/files/${fileKey}/preview`,
      {
        params: query,
      },
    );

  return response.data;
}

/* -------------------------------------------------------------------------- */
/* File statistics                                                             */
/* -------------------------------------------------------------------------- */

export async function getDatasetFileStatistics(
  datasetId: string,
  fileKey: string,
): Promise<DatasetFileStatisticsRead> {
  const response =
    await api.get<DatasetFileStatisticsRead>(
      `/datasets/${datasetId}/files/${fileKey}/statistics`,
    );

  return response.data;
}

/* -------------------------------------------------------------------------- */
/* Quality report                                                               */
/* -------------------------------------------------------------------------- */

export async function getDatasetQualityReport(
  datasetId: string,
): Promise<DatasetQualityReportRead> {
  const response =
    await api.get<DatasetQualityReportRead>(
      `/datasets/${datasetId}/quality-report`,
    );

  return response.data;
}

/* -------------------------------------------------------------------------- */
/* Clean version                                                                */
/* -------------------------------------------------------------------------- */

export async function createCleanDatasetVersion(
  datasetId: string,
  payload: DatasetCleanedVersionCreate,
): Promise<DatasetCleanedVersionRead> {
  const response =
    await api.post<DatasetCleanedVersionRead>(
      `/datasets/${datasetId}/cleaned-version`,
      payload,
    );

  return response.data;
}

/* -------------------------------------------------------------------------- */
/* File download                                                               */
/* -------------------------------------------------------------------------- */

function getDatasetDownloadFilename(
  contentDisposition: string | undefined,
  fallback: string,
): string {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(
    /filename\*=UTF-8''([^;]+)/i,
  );

  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(
        utf8Match[1].replaceAll('"', ""),
      );
    } catch {
      return utf8Match[1].replaceAll('"', "");
    }
  }

  const filenameMatch = contentDisposition.match(
    /filename="?([^";]+)"?/i,
  );

  return filenameMatch?.[1] ?? fallback;
}

export async function downloadDatasetFile(
  datasetId: string,
  fileKey: string,
  fallbackFilename: string,
): Promise<void> {
  const response = await api.get<Blob>(
    `/datasets/${datasetId}/files/${fileKey}/download`,
    {
      responseType: "blob",
      timeout: 60_000,
    },
  );

  const filename = getDatasetDownloadFilename(
    response.headers["content-disposition"],
    fallbackFilename,
  );

  const objectUrl = window.URL.createObjectURL(
    response.data,
  );

  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.URL.revokeObjectURL(objectUrl);
}
