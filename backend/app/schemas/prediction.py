import uuid
from datetime import datetime
from typing import Any

from pydantic import Field

from app.domain.enums import (
    AnalysisTask,
    PredictionStatus,
)
from app.schemas.common import ORMModel


class PredictionRequest(ORMModel):
    text: str = Field(
        min_length=1,
        max_length=5000,
        examples=[
            "এই লেখাটি বিশ্লেষণ করুন"
        ],
    )

    task: AnalysisTask
    model_version_id: uuid.UUID | None = None
    include_explanation: bool = True


class PredictionRead(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    model_version_id: uuid.UUID
    task: AnalysisTask
    status: PredictionStatus

    input_text: str | None
    normalized_text: str | None
    language_form: str | None

    predicted_label: str
    confidence: float
    probabilities: dict[str, float] | None
    explanation: dict[str, Any] | None
    latency_ms: float | None
    error_message: str | None

    created_at: datetime
    updated_at: datetime

from pydantic import Field, model_validator


class BatchPredictionItem(ORMModel):
    client_reference: str | None = Field(
        default=None,
        max_length=100,
    )

    text: str = Field(
        min_length=1,
        max_length=5000,
    )


class BatchPredictionRequest(ORMModel):
    task: AnalysisTask

    items: list[BatchPredictionItem] = Field(
        min_length=1,
        max_length=50,
    )

    model_version_id: uuid.UUID | None = None
    include_explanation: bool = True

    @model_validator(mode="after")
    def reject_duplicate_references(
        self,
    ) -> "BatchPredictionRequest":
        references = [
            item.client_reference
            for item in self.items
            if item.client_reference is not None
        ]

        if len(references) != len(set(references)):
            raise ValueError(
                "client_reference values must be unique"
            )

        return self


class BatchPredictionResultItem(ORMModel):
    client_reference: str | None
    prediction: PredictionRead


class BatchPredictionResponse(ORMModel):
    task: AnalysisTask
    model_version_id: uuid.UUID
    total_items: int
    completed_items: int
    failed_items: int
    processing_time_ms: float

    results: list[BatchPredictionResultItem]
    errors: list[dict[str, Any]]    