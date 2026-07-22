import uuid
from datetime import datetime
from typing import Any

from pydantic import Field

from app.domain.enums import AnalysisTask
from app.schemas.common import ORMModel


class DatasetVersionCreate(ORMModel):
    name: str = Field(min_length=2, max_length=150)
    version: str = Field(min_length=1, max_length=50)
    description: str | None = None
    source_name: str | None = None
    source_url: str | None = None
    license_name: str | None = None
    task: AnalysisTask

    total_samples: int = Field(default=0, ge=0)
    train_samples: int = Field(default=0, ge=0)
    validation_samples: int = Field(default=0, ge=0)
    test_samples: int = Field(default=0, ge=0)

    manifest_path: str | None = None
    checksum: str | None = None
    label_schema: dict[str, Any] | None = None
    preprocessing_config: dict[str, Any] | None = None


class DatasetVersionRead(DatasetVersionCreate):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime