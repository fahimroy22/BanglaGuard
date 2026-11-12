export type DatasetExportTask = "hate_speech" | "sentiment";

export type DatasetExportFormat = "csv" | "jsonl";

export type DatasetExportStatus =
  "pending" | "processing" | "completed" | "failed";

export type DatasetExportCreate = {
  name: string;
  version: string;
  task: DatasetExportTask;
  export_format: DatasetExportFormat;
  selected_feedback_ids: string[];
  configuration: Record<string, unknown>;
};

export type DatasetExportRead = {
  id: string;

  created_by_id: string | null;
  dataset_version_id: string | null;

  name: string;
  version: string;
  task: DatasetExportTask;

  export_format: DatasetExportFormat;
  status: DatasetExportStatus;

  selected_records: number;
  exported_records: number;
  skipped_records: number;

  selected_feedback_ids: string[];

  artifact_path: string | null;
  manifest_path: string | null;
  checksum: string | null;

  configuration: Record<string, unknown>;
  error_message: string | null;

  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DatasetExportSummary = {
  total_exports: number;

  pending: number;
  processing: number;
  completed: number;
  failed: number;

  selected_records: number;
  exported_records: number;
  skipped_records: number;
};
