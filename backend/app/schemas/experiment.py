import uuid
from datetime import datetime
from typing import Any

from pydantic import Field

from app.domain.enums import ExperimentStatus
from app.schemas.common import ORMModel


class ExperimentCreate(ORMModel):
    name: str = Field(
        min_length=2,
        max_length=200,
    )

    description: str | None = None

    dataset_version_id: uuid.UUID
    model_version_id: uuid.UUID | None = None

    random_seed: int | None = 42
    code_version: str | None = None

    configuration: dict[str, Any] | None = None
    results: dict[str, Any] | None = None


class ExperimentUpdate(ORMModel):
    status: ExperimentStatus | None = None
    model_version_id: uuid.UUID | None = None

    configuration: dict[str, Any] | None = None
    results: dict[str, Any] | None = None

    started_at: datetime | None = None
    completed_at: datetime | None = None


class ExperimentRead(ORMModel):
    id: uuid.UUID
    name: str
    description: str | None

    status: ExperimentStatus

    dataset_version_id: uuid.UUID
    model_version_id: uuid.UUID | None

    random_seed: int | None
    code_version: str | None

    configuration: dict[str, Any] | None
    results: dict[str, Any] | None

    started_at: datetime | None
    completed_at: datetime | None

    created_at: datetime
    updated_at: datetime