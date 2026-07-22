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