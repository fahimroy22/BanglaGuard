from datetime import date
from typing import Any

from pydantic import Field

from app.schemas.common import ORMModel


class LabelCount(ORMModel):
    label: str
    count: int
    percentage: float


class ModelUsageItem(ORMModel):
    model_version_id: str
    model_name: str
    architecture: str
    prediction_count: int
    average_confidence: float | None
    average_latency_ms: float | None


class DailyPredictionItem(ORMModel):
    date: date
    prediction_count: int
    average_confidence: float | None
    average_latency_ms: float | None


class FeedbackSummary(ORMModel):
    total_feedback: int
    correct: int
    incorrect: int
    uncertain: int

    pending: int
    reviewed: int
    accepted: int
    rejected: int

    agreement_rate: float | None


class PredictionSummary(ORMModel):
    total_predictions: int
    completed_predictions: int
    failed_predictions: int

    average_confidence: float | None
    average_latency_ms: float | None

    minimum_confidence: float | None
    maximum_confidence: float | None

    label_distribution: list[LabelCount]
    model_usage: list[ModelUsageItem]
    feedback: FeedbackSummary


class AnalyticsDashboard(ORMModel):
    summary: PredictionSummary
    daily_predictions: list[DailyPredictionItem]


class ModelComparisonItem(ORMModel):
    model_version_id: str
    model_name: str
    model_version: str
    architecture: str
    status: str

    prediction_count: int
    average_confidence: float | None
    average_latency_ms: float | None

    feedback_count: int
    correct_feedback: int
    incorrect_feedback: int

    observed_feedback_accuracy: float | None

    registered_metrics: dict[str, Any] = Field(
        default_factory=dict
    )