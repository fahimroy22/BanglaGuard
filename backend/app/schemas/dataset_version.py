import uuid
from datetime import datetime
from typing import Any

from pydantic import Field

from app.domain.enums import AnalysisTask
from app.schemas.common import ORMModel


class DatasetVersionCreate(ORMModel):
    name: str = Field(
        min_length=2,
        max_length=150,
    )

    version: str = Field(
        min_length=1,
        max_length=50,
    )

    description: str | None = None

    source_name: str | None = None
    source_url: str | None = None
    license_name: str | None = None

    task: AnalysisTask

    total_samples: int = Field(
        default=0,
        ge=0,
    )

    train_samples: int = Field(
        default=0,
        ge=0,
    )

    validation_samples: int = Field(
        default=0,
        ge=0,
    )

    test_samples: int = Field(
        default=0,
        ge=0,
    )

    manifest_path: str | None = None
    checksum: str | None = None

    label_schema: dict[str, Any] | None = None

    preprocessing_config: dict[str, Any] | None = None


class DatasetVersionRead(DatasetVersionCreate):
    id: uuid.UUID

    created_at: datetime
    updated_at: datetime


class DatasetRegistryRead(ORMModel):
    items: list[DatasetVersionRead]

    total: int
    limit: int
    offset: int

    has_previous: bool
    has_next: bool


class DatasetRegistrySummary(ORMModel):
    total_datasets: int

    hate_speech_datasets: int
    sentiment_datasets: int

    total_samples: int
    train_samples: int
    validation_samples: int
    test_samples: int

    datasets_with_manifest: int
    datasets_with_checksum: int


class DatasetManifestRead(ORMModel):
    dataset_version_id: uuid.UUID
    manifest_type: str
    manifest_path: str
    manifest: dict[str, Any]


class DatasetFileRead(ORMModel):
    key: str
    path: str
    filename: str
    exists: bool
    size_bytes: int | None
    checksum_sha256: str | None
    media_type: str


class DatasetFilesRead(ORMModel):
    dataset_version_id: uuid.UUID
    manifest_type: str

    total_files: int
    available_files: int
    missing_files: list[str]

    files: list[DatasetFileRead]


class DatasetFilePreviewRead(ORMModel):
    dataset_version_id: uuid.UUID

    file_key: str
    filename: str

    columns: list[str]
    rows: list[dict[str, Any]]

    total_rows: int
    limit: int
    offset: int

    has_previous: bool
    has_next: bool


class DatasetTextLengthStatistics(ORMModel):
    count: int

    minimum: int | None
    maximum: int | None
    average: float | None


class DatasetFileStatisticsRead(ORMModel):
    dataset_version_id: uuid.UUID

    file_key: str
    filename: str

    columns: list[str]

    total_rows: int
    total_columns: int

    text_column: str | None
    label_column: str | None

    missing_values: dict[str, int]
    unique_values: dict[str, int]

    unique_text_rows: int | None
    duplicate_text_rows: int | None
    replacement_character_rows: int | None

    label_distribution: dict[str, int]
    label_percentages: dict[str, float]

    text_length: DatasetTextLengthStatistics


class DatasetQualityCheckRead(ORMModel):
    key: str
    passed: bool
    severity: str
    message: str

    expected: Any | None = None
    actual: Any | None = None


class DatasetQualitySplitRead(ORMModel):
    file_key: str
    filename: str

    expected_rows: int
    actual_rows: int
    counts_match: bool

    columns: list[str]

    missing_text_rows: int
    missing_label_rows: int
    duplicate_text_rows: int

    replacement_character_rows: int
    replacement_character_percentage: float

    label_distribution: dict[str, int]
    label_percentages: dict[str, float]
    minimum_label_percentage: float

    text_length: DatasetTextLengthStatistics


class DatasetQualityReportRead(ORMModel):
    dataset_version_id: uuid.UUID

    dataset_name: str
    dataset_version: str
    manifest_type: str

    status: str
    training_ready: bool
    quality_score: float

    checks: list[DatasetQualityCheckRead]

    registered_counts: dict[str, int]
    manifest_counts: dict[str, int]
    actual_counts: dict[str, int]

    missing_required_files: list[str]

    checksum: dict[str, Any]
    splits: dict[str, DatasetQualitySplitRead]
    summary: dict[str, Any]

    warnings: list[str]
    errors: list[str]
    recommendations: list[str]
