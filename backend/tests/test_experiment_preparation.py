import json
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.domain.enums import (
    AnalysisTask,
    ExperimentStatus,
)
from app.domain.services.experiment_preparation import (
    ExperimentPreparationService,
)
from app.schemas.training import (
    ClassicalTrainingRequest,
)


class FakeSession:
    async def rollback(
        self,
    ) -> None:
        return None


class FakeReadinessService:
    def evaluate(
        self,
        *,
        dataset_version,
        payload,
    ):
        return {
            "dataset_version_id": (dataset_version.id),
            "dataset_name": (dataset_version.name),
            "dataset_version": (dataset_version.version),
            "task": "hate_speech",
            "training_ready": True,
            "quality_status": "ready",
            "quality_score": 100.0,
            "total_samples": 100,
            "train_samples": 80,
            "validation_samples": 10,
            "test_samples": 10,
            "labels": [
                "hateful",
                "non_hateful",
            ],
            "label_distribution": {
                "hateful": 48,
                "non_hateful": 52,
            },
            "artifact_paths": {
                "manifest": ("/tmp/dataset/manifest.json"),
                "processed": ("/tmp/dataset/processed.csv"),
                "train": ("/tmp/dataset/train.csv"),
                "validation": ("/tmp/dataset/validation.csv"),
                "test": ("/tmp/dataset/test.csv"),
            },
            "warnings": [],
            "errors": [],
            "recommendations": [],
            "configuration": (payload.model_dump(mode="json")),
        }


class FakeExperimentRepository:
    async def add(
        self,
        experiment,
    ):
        experiment.created_at = SimpleNamespace(
            isoformat=lambda: "2026-08-06T00:00:00+00:00"
        )

        return experiment


def create_dataset():
    return SimpleNamespace(
        id=uuid.uuid4(),
        name="BD-SHS Dataset",
        version="1.0.1-cleaned",
        task=AnalysisTask.HATE_SPEECH,
        checksum="checksum-value",
        manifest_path=("/tmp/dataset/manifest.json"),
    )


def create_payload(
    dataset_id: uuid.UUID,
):
    return ClassicalTrainingRequest(
        dataset_version_id=dataset_id,
        experiment_name="Classical baseline",
        experiment_description=("Prepared classical experiment."),
        model_name="BanglaGuard Classical",
        model_version="1.0.0",
        code_version=("phase-20.1.2.8.3.4"),
    )


@pytest.mark.asyncio
async def test_prepare_experiment_creates_workspace(
    tmp_path: Path,
) -> None:
    dataset = create_dataset()

    service = ExperimentPreparationService(
        session=FakeSession(),
        readiness_service=(FakeReadinessService()),
        root_directory=tmp_path,
    )

    service.repository = FakeExperimentRepository()

    result = await service.prepare_classical_experiment(
        dataset_version=dataset,
        payload=create_payload(dataset.id),
    )

    workspace = Path(result["workspace_paths"]["workspace"])

    assert workspace.exists()

    assert (workspace / "configuration.json").exists()

    assert (workspace / "metadata.json").exists()

    assert (workspace / "logs").is_dir()

    assert (workspace / "artifacts").is_dir()

    assert (workspace / "metrics").is_dir()

    configuration = json.loads(
        (workspace / "configuration.json").read_text(encoding="utf-8")
    )

    assert configuration["task"] == ("hate_speech")

    assert configuration["dataset"]["id"] == str(dataset.id)

    assert result["status"] == (ExperimentStatus.PLANNED.value)

    assert result["training_ready"] is True
    assert result["quality_score"] == 100.0


@pytest.mark.asyncio
async def test_prepared_experiment_has_no_model_version(
    tmp_path: Path,
) -> None:
    dataset = create_dataset()

    service = ExperimentPreparationService(
        session=FakeSession(),
        readiness_service=(FakeReadinessService()),
        root_directory=tmp_path,
    )

    service.repository = FakeExperimentRepository()

    result = await service.prepare_classical_experiment(
        dataset_version=dataset,
        payload=create_payload(dataset.id),
    )

    assert result["model_version_id"] is None

    metadata_path = Path(result["workspace_paths"]["metadata"])

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

    assert metadata["status"] == "planned"
    assert metadata["started_at"] is None
    assert metadata["completed_at"] is None
