from collections.abc import Mapping
from typing import Any


def _clamp(
    value: float,
    minimum: float = 0.0,
    maximum: float = 1.0,
) -> float:
    return max(
        minimum,
        min(maximum, value),
    )


def calculate_probability_margin(
    probabilities: Mapping[
        str,
        Any,
    ]
    | None,
) -> float | None:
    if not probabilities:
        return None

    numeric_values: list[float] = []

    for value in probabilities.values():
        try:
            numeric_values.append(
                float(value)
            )
        except (
            TypeError,
            ValueError,
        ):
            continue

    if len(numeric_values) < 2:
        return None

    ordered = sorted(
        numeric_values,
        reverse=True,
    )

    return _clamp(
        ordered[0] - ordered[1]
    )


def calculate_active_learning_priority(
    *,
    confidence: float,
    probabilities: Mapping[
        str,
        Any,
    ]
    | None,
    correct_count: int,
    incorrect_count: int,
    unsure_count: int,
    pending_count: int,
    reviewed_count: int,
    rejected_count: int,
) -> tuple[
    float,
    str,
    list[str],
]:
    normalized_confidence = _clamp(
        float(confidence)
    )

    reasons: list[str] = []

    # Maximum contribution: 40 points.
    confidence_score = (
        1.0 - normalized_confidence
    ) * 40.0

    if normalized_confidence < 0.40:
        reasons.append(
            "very_low_confidence"
        )
    elif normalized_confidence < 0.70:
        reasons.append(
            "low_confidence"
        )

    # Maximum contribution: 20 points.
    probability_margin = (
        calculate_probability_margin(
            probabilities
        )
    )

    margin_score = 0.0

    if probability_margin is not None:
        margin_score = (
            1.0 - probability_margin
        ) * 20.0

        if probability_margin < 0.15:
            reasons.append(
                "small_label_margin"
            )

    feedback_score = 0.0

    if incorrect_count > 0:
        feedback_score += 20.0
        reasons.append(
            "user_disagreement"
        )

    if unsure_count > 0:
        feedback_score += 12.0
        reasons.append(
            "uncertain_feedback"
        )

    if rejected_count > 0:
        feedback_score += 12.0
        reasons.append(
            "rejected_validation"
        )

    if (
        correct_count > 0
        and incorrect_count > 0
    ):
        feedback_score += 16.0
        reasons.append(
            "conflicting_feedback"
        )

    total_feedback = (
        correct_count
        + incorrect_count
        + unsure_count
    )

    if total_feedback == 0:
        feedback_score += 5.0
        reasons.append(
            "not_human_reviewed"
        )

    if (
        pending_count > 0
        and reviewed_count == 0
    ):
        feedback_score += 4.0
        reasons.append(
            "pending_validation"
        )

    score = min(
        100.0,
        confidence_score
        + margin_score
        + feedback_score,
    )

    if score >= 70.0:
        priority_level = "high"
    elif score >= 40.0:
        priority_level = "medium"
    else:
        priority_level = "low"

    if not reasons:
        reasons.append(
            "routine_sampling"
        )

    return (
        round(score, 2),
        priority_level,
        list(dict.fromkeys(reasons)),
    )
