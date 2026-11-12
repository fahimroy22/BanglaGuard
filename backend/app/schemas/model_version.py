import uuid
from datetime import datetime
from typing import Any

from pydantic import Field

from app.domain.enums import AnalysisTask, ModelStatus
from app.schemas.common import ORMModel


class ModelVersionCreate(ORMModel):
    name: str = Field(min_length=2, max_length=150)
    version: str = Field(min_length=1, max_length=50)
    task: AnalysisTask
    architecture: str = Field(min_length=2, max_length=150)
    artifact_path: str
    tokenizer_path: str | None = None
    preprocessing_version: str | None = None
    metrics: dict[str, Any] | None = None
    configuration: dict[str, Any] | None = None
    is_explainable: bool = False


class ModelVersionRead(ModelVersionCreate):
    is_archived: bool = False
    id: uuid.UUID
    status: ModelStatus
    activated_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ModelActivationReadinessRead(ORMModel):
    model_version_id: uuid.UUID
    task: AnalysisTask
    architecture: str
    status: ModelStatus
    ready: bool
    reason: str | None = None
