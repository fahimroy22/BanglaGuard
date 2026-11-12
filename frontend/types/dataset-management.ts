export type DatasetTask = "hate_speech" | "sentiment";

export type DatasetJsonValue =
  | string
  | number
  | boolean
  | null
  | DatasetJsonValue[]
  | {
      [key: string]: DatasetJsonValue;
    };

export type DatasetJsonObject = {
  [key: string]: DatasetJsonValue;
};

/* -------------------------------------------------------------------------- */
/* Dataset inspection                                                         */
/* -------------------------------------------------------------------------- */

export type DatasetColumnProfile = {
  name: string;
  inferred_dtype: string;
  non_null_count: number;
  null_count: number;
  unique_count: number;
  sample_values: unknown[];
};

export type DatasetInspectionRead = {
  upload_id: string;

  filename: string;
  content_type: string | null;
  file_size_bytes: number;

  encoding: string;
  delimiter: string;

  total_rows: number;
  total_columns: number;
  columns: string[];

  sample_rows: Record<string, unknown>[];
  column_profiles: DatasetColumnProfile[];

  suggested_text_column: string | null;
  suggested_label_columns: string[];

  temporary_path: string;
  temporary_file_expires_at: string;
};

/* -------------------------------------------------------------------------- */
/* Column mapping and validation                                              */
/* -------------------------------------------------------------------------- */

export type DatasetLabelMapping = Record<string, string>;

export type DatasetMappingValidationRequest = {
  upload_id: string;

  text_column: string;
  label_column: string;

  label_mapping: DatasetLabelMapping;

  drop_empty_text: boolean;
  drop_empty_label: boolean;
  drop_duplicates: boolean;
  exclude_replacement_character_rows: boolean;

  preview_rows: number;
};

export type DatasetMappingPreviewRow = {
  source_row_number: number;
  text: string;
  source_label: string;
  label: string;
  contains_replacement_character: boolean;
};

export type DatasetMappingValidationConfiguration = {
  drop_empty_text: boolean;
  drop_empty_label: boolean;
  drop_duplicates: boolean;
  exclude_replacement_character_rows: boolean;

  minimum_valid_rows: number;
  minimum_distinct_labels: number;
};

export type DatasetMappingValidationResponse = {
  upload_id: string;

  filename: string;
  encoding: string;
  delimiter: string;

  text_column: string;
  label_column: string;

  total_rows: number;
  valid_rows: number;
  invalid_rows: number;

  empty_text_rows: number;
  empty_label_rows: number;
  unmapped_label_rows: number;
  duplicate_text_rows: number;
  replacement_character_rows: number;

  source_label_distribution: Record<string, number>;
  mapped_label_distribution: Record<string, number>;

  label_mapping: DatasetLabelMapping;

  preview_rows: DatasetMappingPreviewRow[];

  warnings: string[];
  can_register: boolean;

  validation_configuration: DatasetMappingValidationConfiguration;
};

/* -------------------------------------------------------------------------- */
/* Dataset registration                                                       */
/* -------------------------------------------------------------------------- */

export type DatasetRegistrationRequest = DatasetMappingValidationRequest & {
  name: string;
  version: string;
  task: DatasetTask;

  description: string | null;

  source_name: string | null;
  source_url: string | null;
  license_name: string | null;
};

export type DatasetDirectUploadRequest = {
  file: File;

  name: string;
  version: string;
  task: DatasetTask;

  description?: string | null;

  source_name?: string | null;
  source_url?: string | null;
  license_name?: string | null;
};

/* -------------------------------------------------------------------------- */
/* Dataset registry                                                           */
/* -------------------------------------------------------------------------- */

export type DatasetVersionCreate = {
  name: string;
  version: string;

  description: string | null;

  source_name: string | null;
  source_url: string | null;
  license_name: string | null;

  task: DatasetTask;

  total_samples: number;
  train_samples: number;
  validation_samples: number;
  test_samples: number;

  manifest_path: string | null;
  checksum: string | null;

  label_schema: DatasetJsonObject | null;
  preprocessing_config: DatasetJsonObject | null;
};

export type DatasetVersionRead = DatasetVersionCreate & {
  id: string;
  created_at: string;
  updated_at: string;
};

export type DatasetRegistryRead = {
  items: DatasetVersionRead[];

  total: number;
  limit: number;
  offset: number;

  has_previous: boolean;
  has_next: boolean;
};

export type DatasetRegistrySummary = {
  total_datasets: number;

  hate_speech_datasets: number;
  sentiment_datasets: number;

  total_samples: number;
  train_samples: number;
  validation_samples: number;
  test_samples: number;

  datasets_with_manifest: number;
  datasets_with_checksum: number;
};

export type DatasetRegistryQuery = {
  task?: DatasetTask;
  search?: string;

  limit?: number;
  offset?: number;
};

/* -------------------------------------------------------------------------- */
/* Dataset manifest and files                                                 */
/* -------------------------------------------------------------------------- */

export type DatasetManifestRead = {
  dataset_version_id: string;
  manifest_type: string;
  manifest_path: string;
  manifest: DatasetJsonObject;
};

export type DatasetFileRead = {
  key: string;
  path: string;
  filename: string;

  exists: boolean;
  size_bytes: number | null;
  checksum_sha256: string | null;

  media_type: string;
};

export type DatasetFilesRead = {
  dataset_version_id: string;
  manifest_type: string;

  total_files: number;
  available_files: number;

  missing_files: string[];
  files: DatasetFileRead[];
};

export type DatasetFilePreviewRead = {
  dataset_version_id: string;

  file_key: string;
  filename: string;

  columns: string[];
  rows: Record<string, unknown>[];

  total_rows: number;
  limit: number;
  offset: number;

  has_previous: boolean;
  has_next: boolean;
};

export type DatasetFilePreviewQuery = {
  limit?: number;
  offset?: number;
};

/* -------------------------------------------------------------------------- */
/* Dataset statistics                                                         */
/* -------------------------------------------------------------------------- */

export type DatasetTextLengthStatistics = {
  count: number;

  minimum: number | null;
  maximum: number | null;
  average: number | null;
};

export type DatasetFileStatisticsRead = {
  dataset_version_id: string;

  file_key: string;
  filename: string;

  columns: string[];

  total_rows: number;
  total_columns: number;

  text_column: string | null;
  label_column: string | null;

  missing_values: Record<string, number>;
  unique_values: Record<string, number>;

  unique_text_rows: number | null;
  duplicate_text_rows: number | null;
  replacement_character_rows: number | null;

  label_distribution: Record<string, number>;
  label_percentages: Record<string, number>;

  text_length: DatasetTextLengthStatistics;
};

/* -------------------------------------------------------------------------- */
/* Dataset quality report                                                     */
/* -------------------------------------------------------------------------- */

export type DatasetQualityCheckRead = {
  key: string;
  passed: boolean;
  severity: string;
  message: string;

  expected: unknown | null;
  actual: unknown | null;
};

export type DatasetQualitySplitRead = {
  file_key: string;
  filename: string;

  expected_rows: number;
  actual_rows: number;
  counts_match: boolean;

  columns: string[];

  missing_text_rows: number;
  missing_label_rows: number;
  duplicate_text_rows: number;

  replacement_character_rows: number;
  replacement_character_percentage: number;

  label_distribution: Record<string, number>;
  label_percentages: Record<string, number>;
  minimum_label_percentage: number;

  text_length: DatasetTextLengthStatistics;
};

export type DatasetQualityReportRead = {
  dataset_version_id: string;

  dataset_name: string;
  dataset_version: string;
  manifest_type: string;

  status: string;
  training_ready: boolean;
  quality_score: number;

  checks: DatasetQualityCheckRead[];

  registered_counts: Record<string, number>;
  manifest_counts: Record<string, number>;
  actual_counts: Record<string, number>;

  missing_required_files: string[];

  checksum: DatasetJsonObject;
  splits: Record<string, DatasetQualitySplitRead>;
  summary: DatasetJsonObject;

  warnings: string[];
  errors: string[];
  recommendations: string[];
};

/* -------------------------------------------------------------------------- */
/* Dataset cleaning                                                           */
/* -------------------------------------------------------------------------- */

export type DatasetCleanedVersionCreate = {
  version: string;

  name?: string | null;
  description?: string | null;

  remove_replacement_character_rows: boolean;
  drop_empty_text: boolean;
  drop_empty_label: boolean;
  drop_duplicates: boolean;

  random_seed: number;
};

export type DatasetCleaningCounts = {
  source_rows: number;
  cleaned_rows: number;
  removed_rows: number;

  removed_replacement_character_rows: number;
  removed_empty_text_rows: number;
  removed_empty_label_rows: number;
  removed_duplicate_text_rows: number;
};

export type DatasetCleanedVersionRead = {
  source_dataset_version_id: string;

  cleaned_dataset: DatasetVersionRead;
  cleaning_counts: DatasetCleaningCounts;

  source_version_preserved: true;
};

/* -------------------------------------------------------------------------- */
/* UI state                                                                   */
/* -------------------------------------------------------------------------- */

export type DatasetWorkspaceTab =
  | "registry"
  | "upload"
  | "inspection"
  | "details"
  | "quality"
  | "cleaning";

export type DatasetInspectionDraft = {
  file: File | null;
  inspection: DatasetInspectionRead | null;

  text_column: string;
  label_column: string;

  label_mapping: DatasetLabelMapping;

  drop_empty_text: boolean;
  drop_empty_label: boolean;
  drop_duplicates: boolean;
  exclude_replacement_character_rows: boolean;

  validation: DatasetMappingValidationResponse | null;
};

export const DEFAULT_DATASET_MAPPING_OPTIONS = {
  drop_empty_text: true,
  drop_empty_label: true,
  drop_duplicates: true,
  exclude_replacement_character_rows: true,
  preview_rows: 10,
} satisfies Pick<
  DatasetMappingValidationRequest,
  | "drop_empty_text"
  | "drop_empty_label"
  | "drop_duplicates"
  | "exclude_replacement_character_rows"
  | "preview_rows"
>;

export const DEFAULT_DATASET_CLEANING_OPTIONS = {
  remove_replacement_character_rows: true,
  drop_empty_text: true,
  drop_empty_label: true,
  drop_duplicates: true,
  random_seed: 42,
} satisfies Omit<
  DatasetCleanedVersionCreate,
  "version" | "name" | "description"
>;