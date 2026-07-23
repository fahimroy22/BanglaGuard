from datetime import date

from app.schemas.analytics import (
    AnalyticsDashboard,
    DailyPredictionItem,
    FeedbackSummary,
    PredictionSummary,
)


def test_analytics_dashboard_schema() -> None:
    dashboard = AnalyticsDashboard(
        summary=PredictionSummary(
            total_predictions=10,
            completed_predictions=9,
            failed_predictions=1,
            average_confidence=0.72,
            average_latency_ms=100.5,
            minimum_confidence=0.31,
            maximum_confidence=0.95,
            label_distribution=[],
            model_usage=[],
            feedback=FeedbackSummary(
                total_feedback=3,
                correct=2,
                incorrect=1,
                uncertain=0,
                pending=1,
                reviewed=0,
                accepted=2,
                rejected=0,
                agreement_rate=66.67,
            ),
        ),
        daily_predictions=[
            DailyPredictionItem(
                date=date(2026, 7, 23),
                prediction_count=10,
                average_confidence=0.72,
                average_latency_ms=100.5,
            )
        ],
    )

    assert (
        dashboard.summary.total_predictions
        == 10
    )

    assert (
        dashboard.daily_predictions[0]
        .prediction_count
        == 10
    )


def test_empty_analytics_summary() -> None:
    summary = PredictionSummary(
        total_predictions=0,
        completed_predictions=0,
        failed_predictions=0,
        average_confidence=None,
        average_latency_ms=None,
        minimum_confidence=None,
        maximum_confidence=None,
        label_distribution=[],
        model_usage=[],
        feedback=FeedbackSummary(
            total_feedback=0,
            correct=0,
            incorrect=0,
            uncertain=0,
            pending=0,
            reviewed=0,
            accepted=0,
            rejected=0,
            agreement_rate=None,
        ),
    )

    assert summary.average_confidence is None