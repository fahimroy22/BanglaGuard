import uuid
from datetime import datetime

from pydantic import Field, model_validator

from app.domain.enums import FeedbackStatus, FeedbackVerdict
from app.schemas.common import ORMModel


class FeedbackCreate(ORMModel):
    prediction_id: uuid.UUID
    verdict: FeedbackVerdict
    corrected_label: str | None = Field(
        default=None,
        max_length=100,
    )
    comment: str | None = Field(
        default=None,
        max_length=1000,
    )

    @model_validator(mode="after")
    def validate_incorrect_feedback(self):
        if (
            self.verdict == FeedbackVerdict.INCORRECT
            and not self.corrected_label
        ):
            raise ValueError(
                "corrected_label is required when verdict is incorrect"
            )

        return self


class FeedbackRead(FeedbackCreate):
    id: uuid.UUID
    user_id: uuid.UUID | None
    status: FeedbackStatus
    reviewed_by_id: uuid.UUID | None
    reviewer_note: str | None
    reviewed_at: datetime | None
    created_at: datetime