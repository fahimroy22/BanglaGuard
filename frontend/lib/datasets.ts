import { api } from "@/lib/api";

import type {
  DatasetExportCreate,
  DatasetExportRead,
} from "@/types/dataset-export";

function getDownloadFilename(
  contentDisposition: string | undefined,
  fallback: string,
): string {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);

  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replaceAll('"', ""));
    } catch {
      return utf8Match[1].replaceAll('"', "");
    }
  }

  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);

  return filenameMatch?.[1] ?? fallback;
}

export async function createDatasetExport(
  payload: DatasetExportCreate,
): Promise<DatasetExportRead> {
  const response = await api.post<DatasetExportRead>(
    "/datasets/exports",
    payload,
  );

  return response.data;
}

export async function listDatasetExports(
  limit = 100,
  offset = 0,
): Promise<DatasetExportRead[]> {
  const response = await api.get<DatasetExportRead[]>("/datasets/exports", {
    params: {
      limit,
      offset,
    },
  });

  return response.data;
}

export async function getDatasetExport(
  exportId: string,
): Promise<DatasetExportRead> {
  const response = await api.get<DatasetExportRead>(
    `/datasets/exports/${exportId}`,
  );

  return response.data;
}

export async function downloadDatasetExport(
  exportRecord: DatasetExportRead,
): Promise<void> {
  const response = await api.get<Blob>(
    `/datasets/exports/${exportRecord.id}/download`,
    {
      responseType: "blob",
      timeout: 60_000,
    },
  );

  const fallbackFilename =
    `${exportRecord.name}-${exportRecord.version}.` +
    exportRecord.export_format;

  const filename = getDownloadFilename(
    response.headers["content-disposition"],
    fallbackFilename,
  );

  const objectUrl = window.URL.createObjectURL(response.data);

  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;

  document.body.appendChild(anchor);

  anchor.click();
  anchor.remove();

  window.URL.revokeObjectURL(objectUrl);
}

export async function downloadDatasetExportManifest(
  exportRecord: DatasetExportRead,
): Promise<void> {
  const response = await api.get<Blob>(
    `/datasets/exports/${exportRecord.id}/manifest`,
    {
      responseType: "blob",
    },
  );

  const fallbackFilename = `${exportRecord.name}-${exportRecord.version}-manifest.json`;

  const filename = getDownloadFilename(
    response.headers["content-disposition"],
    fallbackFilename,
  );

  const objectUrl = window.URL.createObjectURL(response.data);

  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;

  document.body.appendChild(anchor);

  anchor.click();
  anchor.remove();

  window.URL.revokeObjectURL(objectUrl);
}

export async function deleteDatasetExport(exportId: string): Promise<void> {
  await api.delete(`/datasets/exports/${exportId}`);
}
