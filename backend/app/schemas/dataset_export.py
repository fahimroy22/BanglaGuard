import uuid
from datetime import datetime
from typing import Any

from pydantic import Field, model_validator

from app.domain.enums import (
    AnalysisTask,
    DatasetExportFormat,
    DatasetExportStatus,
)
from app.schemas.common import ORMModel


class DatasetExportCreate(ORMModel):
    name: str = Field(
        min_length=2,
        max_length=150,
    )

    version: str = Field(
        min_length=1,
        max_length=50,
    )

    task: AnalysisTask

    export_format: DatasetExportFormat = (
        DatasetExportFormat.CSV
    )

    selected_feedback_ids: list[uuid.UUID] = Field(
        min_length=1,
        max_length=500,
    )

    configuration: dict[str, Any] = Field(
        default_factory=dict,
    )

    @model_validator(mode="after")
    def validate_unique_feedback_ids(
        self,
    ) -> "DatasetExportCreate":
        unique_ids = set(
            self.selected_feedback_ids
        )

        if (
            len(unique_ids)
            != len(self.selected_feedback_ids)
        ):
            raise ValueError(
                "selected_feedback_ids must not "
                "contain duplicate values"
            )

        return self


class DatasetExportRead(ORMModel):
    id: uuid.UUID

    created_by_id: uuid.UUID | None
    dataset_version_id: uuid.UUID | None

    name: str
    version: str
    task: AnalysisTask

    export_format: DatasetExportFormat
    status: DatasetExportStatus

    selected_records: int
    exported_records: int
    skipped_records: int

    selected_feedback_ids: list[str]

    artifact_path: str | None
    manifest_path: str | None
    checksum: str | None

    configuration: dict[str, Any]
    error_message: str | None

    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DatasetExportSummary(ORMModel):
    total_exports: int
    pending: int
    processing: int
    completed: int
    failed: int

    selected_records: int
    exported_records: int
    skipped_records: int
