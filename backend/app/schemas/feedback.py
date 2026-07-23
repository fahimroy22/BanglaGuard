import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import ORMModel


ALLOWED_FEEDBACK_TYPES = {
    "correct",
    "incorrect",
    "uncertain",
}

ALLOWED_FEEDBACK_STATUSES = {
    "pending",
    "reviewed",
    "accepted",
    "rejected",
}


class FeedbackCreate(ORMModel):
    prediction_id: uuid.UUID

    feedback_type: str = Field(
        pattern="^(correct|incorrect|uncertain)$"
    )

    corrected_label: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    comment: str | None = Field(
        default=None,
        max_length=2000,
    )


class FeedbackReview(ORMModel):
    status: str = Field(
        pattern="^(pending|reviewed|accepted|rejected)$"
    )

    reviewer_note: str | None = Field(
        default=None,
        max_length=2000,
    )


class FeedbackRead(ORMModel):
    id: uuid.UUID
    prediction_id: uuid.UUID
    user_id: uuid.UUID

    feedback_type: str
    corrected_label: str | None
    comment: str | None

    status: str
    reviewer_note: str | None

    created_at: datetime
    updated_at: datetime