import pytest
from pydantic import ValidationError

from app.domain.enums import AnalysisTask
from app.schemas.prediction import (
    BatchPredictionItem,
    BatchPredictionRequest,
)


def test_valid_batch_request() -> None:
    payload = BatchPredictionRequest(
        task=AnalysisTask.HATE_SPEECH,
        items=[
            BatchPredictionItem(
                client_reference="one",
                text="তুমি ভালো মানুষ",
            ),
            BatchPredictionItem(
                client_reference="two",
                text="তুমি খুব অসভ্য",
            ),
        ],
    )

    assert len(payload.items) == 2


def test_duplicate_references_rejected() -> None:
    with pytest.raises(ValidationError):
        BatchPredictionRequest(
            task=AnalysisTask.HATE_SPEECH,
            items=[
                BatchPredictionItem(
                    client_reference="same",
                    text="প্রথম লেখা",
                ),
                BatchPredictionItem(
                    client_reference="same",
                    text="দ্বিতীয় লেখা",
                ),
            ],
        )


def test_empty_batch_rejected() -> None:
    with pytest.raises(ValidationError):
        BatchPredictionRequest(
            task=AnalysisTask.HATE_SPEECH,
            items=[],
        )
