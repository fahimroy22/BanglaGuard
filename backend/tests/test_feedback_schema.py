import uuid

import pytest
from pydantic import ValidationError

from app.schemas.feedback import (
    FeedbackCreate,
    FeedbackReview,
)


def test_valid_feedback() -> None:
    payload = FeedbackCreate(
        prediction_id=uuid.uuid4(),
        feedback_type="incorrect",
        corrected_label="offensive",
        comment="The predicted label was wrong.",
    )

    assert payload.corrected_label == "offensive"


def test_invalid_feedback_type() -> None:
    with pytest.raises(ValidationError):
        FeedbackCreate(
            prediction_id=uuid.uuid4(),
            feedback_type="wrong-value",
        )


def test_valid_feedback_review() -> None:
    payload = FeedbackReview(
        status="accepted",
        reviewer_note="Approved for error analysis.",
    )

    assert payload.status == "accepted"