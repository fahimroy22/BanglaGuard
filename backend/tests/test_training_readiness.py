import uuid
from types import SimpleNamespace

import pytest

from app.domain.enums import AnalysisTask
from app.domain.services.training_readiness import (
    DatasetNotTrainingReadyError,
    TrainingReadinessError,
    TrainingReadinessService,
)
from app.schemas.training import (
    ClassicalTrainingRequest,
)


class FakeArtifactService:
    def __init__(
        self,
        *,
        training_ready: bool = True,
    ) -> None:
        self.training_ready = training_ready

    def get_quality_report(
        self,
        *,
        dataset_version,
    ):
        return {
            "status": ("ready" if self.training_ready else "not_ready"),
            "training_ready": self.training_ready,
            "quality_score": (100.0 if self.training_ready else 60.0),
            "warnings": [],
            "errors": (
                []
                if self.training_ready
                else ["Unicode replacement-character damage is too high."]
            ),
            "recommendations": ["The dataset may proceed to experiment configuration."],
        }

    def get_download_file(
        self,
        *,
        dataset_version,
        file_key: str,
    ):
        return {
            "key": file_key,
            "path": (
                f"/tmp/example/{file_key}.csv"
                if file_key != "manifest"
                else "/tmp/example/manifest.json"
            ),
        }


def create_dataset():
    return SimpleNamespace(
        id=uuid.uuid4(),
        name="BD-SHS Hate Speech Dataset",
        version="1.0.1-cleaned",
        task=AnalysisTask.HATE_SPEECH,
        total_samples=38_163,
        train_samples=30_530,
        validation_samples=3_816,
        test_samples=3_817,
        label_schema={
            "labels": [
                "non_hateful",
                "hateful",
            ],
            "distribution": {
                "non_hateful": 19_635,
                "hateful": 18_528,
            },
        },
    )


def create_payload(
    dataset_id: uuid.UUID,
) -> ClassicalTrainingRequest:
    return ClassicalTrainingRequest(
        dataset_version_id=dataset_id,
        experiment_name="TF-IDF baseline",
        model_name="BD-SHS Classical Model",
        model_version="1.0.0",
    )


def test_training_readiness_returns_artifacts() -> None:
    dataset = create_dataset()

    service = TrainingReadinessService(
        artifact_service=FakeArtifactService(),
    )

    result = service.evaluate(
        dataset_version=dataset,
        payload=create_payload(dataset.id),
    )

    assert result["training_ready"] is True
    assert result["quality_score"] == 100.0

    assert result["labels"] == [
        "non_hateful",
        "hateful",
    ]

    assert result["artifact_paths"]["train"].endswith("train.csv")

    assert result["artifact_paths"]["validation"].endswith("validation.csv")

    assert result["configuration"]["random_seed"] == 42


def test_not_ready_dataset_is_rejected() -> None:
    dataset = create_dataset()

    service = TrainingReadinessService(
        artifact_service=FakeArtifactService(
            training_ready=False,
        ),
    )

    with pytest.raises(
        DatasetNotTrainingReadyError,
    ):
        service.evaluate(
            dataset_version=dataset,
            payload=create_payload(dataset.id),
        )


def test_dataset_request_mismatch_is_rejected() -> None:
    dataset = create_dataset()

    service = TrainingReadinessService(
        artifact_service=FakeArtifactService(),
    )

    with pytest.raises(TrainingReadinessError):
        service.evaluate(
            dataset_version=dataset,
            payload=create_payload(uuid.uuid4()),
        )
