from app.domain.services.active_learning import (
    calculate_active_learning_priority,
    calculate_probability_margin,
)


def test_probability_margin() -> None:
    margin = calculate_probability_margin(
        {
            "hateful": 0.36,
            "offensive": 0.34,
            "non_hateful": 0.30,
        }
    )

    assert margin is not None
    assert round(margin, 2) == 0.02


def test_high_priority_disagreement() -> None:
    (
        score,
        level,
        reasons,
    ) = calculate_active_learning_priority(
        confidence=0.35,
        probabilities={
            "hateful": 0.35,
            "offensive": 0.34,
            "non_hateful": 0.31,
        },
        correct_count=0,
        incorrect_count=1,
        unsure_count=0,
        pending_count=0,
        reviewed_count=1,
        rejected_count=0,
    )

    assert score >= 60
    assert level in {
        "medium",
        "high",
    }
    assert (
        "user_disagreement"
        in reasons
    )
    assert (
        "small_label_margin"
        in reasons
    )


def test_unreviewed_prediction_reason() -> None:
    (
        score,
        level,
        reasons,
    ) = calculate_active_learning_priority(
        confidence=0.90,
        probabilities={
            "positive": 0.90,
            "neutral": 0.07,
            "negative": 0.03,
        },
        correct_count=0,
        incorrect_count=0,
        unsure_count=0,
        pending_count=0,
        reviewed_count=0,
        rejected_count=0,
    )

    assert score >= 0
    assert level == "low"
    assert (
        "not_human_reviewed"
        in reasons
    )


def test_conflicting_feedback() -> None:
    (
        _score,
        _level,
        reasons,
    ) = calculate_active_learning_priority(
        confidence=0.72,
        probabilities=None,
        correct_count=1,
        incorrect_count=1,
        unsure_count=0,
        pending_count=0,
        reviewed_count=2,
        rejected_count=0,
    )

    assert (
        "conflicting_feedback"
        in reasons
    )
