import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field, model_validator

from app.schemas.common import ORMModel


FeedbackVerdictValue = Literal[
    "correct",
    "incorrect",
    "unsure",
]

FeedbackStatusValue = Literal[
    "pending",
    "reviewed",
    "rejected",
]


class FeedbackCreate(ORMModel):
    prediction_id: uuid.UUID

    verdict: FeedbackVerdictValue

    corrected_label: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    comment: str | None = Field(
        default=None,
        max_length=2000,
    )

    @model_validator(mode="after")
    def validate_corrected_label(
        self,
    ) -> "FeedbackCreate":
        if (
            self.verdict == "incorrect"
            and not self.corrected_label
        ):
            raise ValueError(
                "corrected_label is required "
                "when verdict is incorrect"
            )

        return self


class FeedbackReview(ORMModel):
    status: FeedbackStatusValue

    reviewer_note: str | None = Field(
        default=None,
        max_length=2000,
    )


class FeedbackRead(ORMModel):
    id: uuid.UUID
    prediction_id: uuid.UUID

    user_id: uuid.UUID | None
    reviewed_by_id: uuid.UUID | None

    verdict: FeedbackVerdictValue
    status: FeedbackStatusValue

    corrected_label: str | None
    comment: str | None
    reviewer_note: str | None
    reviewed_at: datetime | None

    created_at: datetime
    updated_at: datetime


class FeedbackReviewItem(ORMModel):
    id: uuid.UUID
    prediction_id: uuid.UUID

    user_id: uuid.UUID | None
    reviewed_by_id: uuid.UUID | None

    verdict: FeedbackVerdictValue
    status: FeedbackStatusValue

    corrected_label: str | None
    comment: str | None
    reviewer_note: str | None
    reviewed_at: datetime | None

    created_at: datetime
    updated_at: datetime

    prediction_text: str | None
    normalized_text: str | None

    task: str
    predicted_label: str
    confidence: float

    model_version_id: uuid.UUID
    model_name: str
    model_version: str


class ActiveLearningFeedbackSummary(
    ORMModel
):
    total: int
    correct: int
    incorrect: int
    unsure: int

    pending: int
    reviewed: int
    rejected: int


class ActiveLearningItem(ORMModel):
    prediction_id: uuid.UUID
    user_id: uuid.UUID | None

    task: str
    status: str

    prediction_text: str | None
    normalized_text: str | None

    predicted_label: str
    confidence: float
    probabilities: dict[str, float] | None

    model_version_id: uuid.UUID
    model_name: str
    model_version: str

    priority_score: float
    priority_level: Literal[
        "high",
        "medium",
        "low",
    ]

    selection_reasons: list[str]

    probability_margin: float | None

    feedback: ActiveLearningFeedbackSummary

    created_at: datetime


class DatasetBuilderItem(ORMModel):
    feedback_id: uuid.UUID
    prediction_id: uuid.UUID

    feedback_user_id: uuid.UUID | None
    reviewed_by_id: uuid.UUID | None

    reviewer_name: str | None
    reviewer_email: str | None

    verdict: FeedbackVerdictValue
    feedback_status: FeedbackStatusValue

    text: str | None
    normalized_text: str | None

    task: Literal[
        "hate_speech",
        "sentiment",
    ]

    predicted_label: str
    corrected_label: str | None
    final_label: str | None

    is_dataset_ready: bool
    readiness_reasons: list[str]

    confidence: float
    probabilities: dict[str, float] | None

    model_version_id: uuid.UUID
    model_name: str
    model_version: str

    user_comment: str | None
    reviewer_note: str | None

    feedback_created_at: datetime
    prediction_created_at: datetime
    reviewed_at: datetime | None


class DatasetBuilderSummary(ORMModel):
    total_records: int
    dataset_ready: int
    needs_review: int

    correct: int
    incorrect: int
    unsure: int

    reviewed: int
    pending: int
    rejected: int

    unique_labels: list[str]
    unique_reviewers: int

    average_confidence: float | None
    duplicate_texts: int


class DatasetBuilderResponse(ORMModel):
    items: list[DatasetBuilderItem]
    summary: DatasetBuilderSummary
