from app.domain.enums import AnalysisTask
from app.ml.baseline import (
    run_baseline_prediction,
)


def test_offensive_prediction() -> None:
    result = run_baseline_prediction(
        "তুমি একটা বোকা",
        AnalysisTask.HATE_SPEECH,
    )

    assert result.label == "offensive"


def test_positive_sentiment() -> None:
    result = run_baseline_prediction(
        "এটি খুব সুন্দর এবং চমৎকার",
        AnalysisTask.SENTIMENT,
    )

    assert result.label == "positive"


def test_neutral_sentiment() -> None:
    result = run_baseline_prediction(
        "আজ সোমবার",
        AnalysisTask.SENTIMENT,
    )

    assert result.label == "neutral"