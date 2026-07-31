import { api } from "@/lib/api";

import type {
  AnalyticsDashboard,
  ModelComparisonItem,
} from "@/types/analytics";

export type AnalyticsFilters = {
  startAt?: string | null;
  endAt?: string | null;
  task?: string | null;
  dailyLimit?: number;
};

export async function getAnalyticsDashboard(
  filters: AnalyticsFilters = {},
): Promise<AnalyticsDashboard> {
  const response =
    await api.get<AnalyticsDashboard>(
      "/analytics/dashboard",
      {
        params: {
          start_at:
            filters.startAt || undefined,
          end_at:
            filters.endAt || undefined,
          task: filters.task || undefined,
          daily_limit:
            filters.dailyLimit ?? 30,
        },
      },
    );

  return response.data;
}

export async function getModelComparison(): Promise<
  ModelComparisonItem[]
> {
  const response = await api.get<
    ModelComparisonItem[]
  >("/analytics/models/compare");

  return response.data;
}

function getFilename(
  contentDisposition:
    | string
    | undefined,
): string {
  if (!contentDisposition) {
    return "model-comparison.csv";
  }

  const filenameMatch =
    contentDisposition.match(
      /filename="?([^"]+)"?/i,
    );

  return (
    filenameMatch?.[1] ??
    "model-comparison.csv"
  );
}

export async function downloadModelComparisonCsv(): Promise<void> {
  const response = await api.get<Blob>(
    "/analytics/reports/model-comparison.csv",
    {
      responseType: "blob",
    },
  );

  const filename = getFilename(
    response.headers[
      "content-disposition"
    ],
  );

  const downloadUrl =
    window.URL.createObjectURL(
      response.data,
    );

  const anchor =
    document.createElement("a");

  anchor.href = downloadUrl;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.URL.revokeObjectURL(
    downloadUrl,
  );
}
