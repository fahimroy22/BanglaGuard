import uuid

import pytest
from pydantic import ValidationError

from app.schemas.feedback import (
    FeedbackCreate,
    FeedbackReview,
)


def test_valid_incorrect_feedback() -> None:
    payload = FeedbackCreate(
        prediction_id=uuid.uuid4(),
        verdict="incorrect",
        corrected_label="offensive",
        comment=(
            "The predicted label was wrong."
        ),
    )

    assert payload.verdict == "incorrect"
    assert (
        payload.corrected_label
        == "offensive"
    )


def test_valid_correct_feedback() -> None:
    payload = FeedbackCreate(
        prediction_id=uuid.uuid4(),
        verdict="correct",
    )

    assert payload.corrected_label is None


def test_invalid_feedback_verdict() -> None:
    with pytest.raises(
        ValidationError
    ):
        FeedbackCreate(
            prediction_id=uuid.uuid4(),
            verdict="wrong-value",
        )


def test_incorrect_requires_label() -> None:
    with pytest.raises(
        ValidationError
    ):
        FeedbackCreate(
            prediction_id=uuid.uuid4(),
            verdict="incorrect",
        )


def test_valid_feedback_review() -> None:
    payload = FeedbackReview(
        status="reviewed",
        reviewer_note=(
            "Reviewed for error analysis."
        ),
    )

    assert payload.status == "reviewed"


def test_invalid_accepted_status() -> None:
    with pytest.raises(
        ValidationError
    ):
        FeedbackReview(
            status="accepted",
        )


def test_feedback_review_item_schema() -> None:
    from datetime import (
        datetime,
        timezone,
    )

    from app.schemas.feedback import (
        FeedbackReviewItem,
    )

    now = datetime.now(timezone.utc)

    item = FeedbackReviewItem(
        id=uuid.uuid4(),
        prediction_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        reviewed_by_id=None,
        verdict="correct",
        status="pending",
        corrected_label=None,
        comment="The prediction is accurate.",
        reviewer_note=None,
        reviewed_at=None,
        created_at=now,
        updated_at=now,
        prediction_text="তুমি একটা বোকা মানুষ",
        normalized_text="তুমি একটা বোকা মানুষ",
        task="hate_speech",
        predicted_label="offensive",
        confidence=0.656517,
        model_version_id=uuid.uuid4(),
        model_name="TF-IDF Logistic Regression",
        model_version="0.1.0",
    )

    assert item.status == "pending"
    assert item.predicted_label == "offensive"
    assert item.model_name == (
        "TF-IDF Logistic Regression"
    )


def test_dataset_builder_response_schema() -> None:
    from datetime import (
        datetime,
        timezone,
    )

    from app.schemas.feedback import (
        DatasetBuilderItem,
        DatasetBuilderResponse,
        DatasetBuilderSummary,
    )

    now = datetime.now(timezone.utc)

    item = DatasetBuilderItem(
        feedback_id=uuid.uuid4(),
        prediction_id=uuid.uuid4(),
        feedback_user_id=uuid.uuid4(),
        reviewed_by_id=uuid.uuid4(),
        reviewer_name="MD. Fahim Ahmed",
        reviewer_email="fahim@example.com",
        verdict="correct",
        feedback_status="reviewed",
        text="তুমি একটা বোকা মানুষ",
        normalized_text="তুমি একটা বোকা মানুষ",
        task="hate_speech",
        predicted_label="offensive",
        corrected_label=None,
        final_label="offensive",
        is_dataset_ready=True,
        readiness_reasons=[],
        confidence=0.656517,
        probabilities={
            "offensive": 0.656517,
            "hateful": 0.20,
            "non_hateful": 0.143483,
        },
        model_version_id=uuid.uuid4(),
        model_name="TF-IDF Logistic Regression",
        model_version="0.1.0",
        user_comment="The result is accurate.",
        reviewer_note="Approved.",
        feedback_created_at=now,
        prediction_created_at=now,
        reviewed_at=now,
    )

    response = DatasetBuilderResponse(
        items=[item],
        summary=DatasetBuilderSummary(
            total_records=1,
            dataset_ready=1,
            needs_review=0,
            correct=1,
            incorrect=0,
            unsure=0,
            reviewed=1,
            pending=0,
            rejected=0,
            unique_labels=[
                "offensive",
            ],
            unique_reviewers=1,
            average_confidence=(
                0.656517
            ),
            duplicate_texts=0,
        ),
    )

    assert (
        response.items[0]
        .final_label
        == "offensive"
    )

    assert (
        response.summary
        .dataset_ready
        == 1
    )
