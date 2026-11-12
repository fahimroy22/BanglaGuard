import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.domain.enums import (
    AnalysisTask,
    ExperimentStatus,
    ModelStatus,
)
from app.domain.services.classical_model_registration import (
    ClassicalModelRegistrationConflictError,
    ClassicalModelRegistrationService,
)


class FakeScalarResult:
    def __init__(
        self,
        value=None,
    ) -> None:
        self.value = value

    def first(
        self,
    ):
        return self.value


class FakeSession:
    def __init__(
        self,
        *,
        existing_model=None,
    ) -> None:
        self.existing_model = existing_model

        self.added = []
        self.commit_count = 0
        self.rollback_count = 0

    async def scalars(
        self,
        statement,
    ):
        return FakeScalarResult(self.existing_model)

    def add(
        self,
        instance,
    ) -> None:
        self.added.append(instance)

    async def commit(
        self,
    ) -> None:
        self.commit_count += 1

        for instance in self.added:
            if (
                getattr(
                    instance,
                    "created_at",
                    None,
                )
                is None
            ):
                instance.created_at = datetime.now(timezone.utc)

            if (
                getattr(
                    instance,
                    "updated_at",
                    None,
                )
                is None
            ):
                instance.updated_at = datetime.now(timezone.utc)

    async def rollback(
        self,
    ) -> None:
        self.rollback_count += 1

    async def refresh(
        self,
        instance,
    ) -> None:
        return None


def create_completed_experiment(
    tmp_path: Path,
):
    experiment_id = uuid.uuid4()
    dataset_version_id = uuid.uuid4()

    workspace = tmp_path / "storage" / "experiments" / str(experiment_id)

    artifacts = workspace / "artifacts"

    metrics = workspace / "metrics"

    artifacts.mkdir(parents=True)

    metrics.mkdir()

    artifact_path = artifacts / "model.joblib"

    artifact_path.write_bytes(b"test-model-artifact")

    metadata_path = workspace / "metadata.json"

    metadata_path.write_text(
        json.dumps(
            {
                "experiment_id": str(experiment_id),
                "status": "completed",
                "model_version_id": None,
            }
        ),
        encoding="utf-8",
    )

    execution_result_path = metrics / "execution_result.json"

    execution_result_path.write_text(
        json.dumps(
            {
                "experiment_id": str(experiment_id),
                "status": "completed",
                "model_version_registered": (False),
            }
        ),
        encoding="utf-8",
    )

    (metrics / "classification_report.json").write_text(
        json.dumps(
            {
                "validation": {},
                "test": {},
            }
        ),
        encoding="utf-8",
    )

    (metrics / "confusion_matrix.json").write_text(
        json.dumps(
            {
                "labels": [
                    "hateful",
                    "non_hateful",
                ],
                "validation": [
                    [2, 1],
                    [1, 2],
                ],
                "test": [
                    [2, 1],
                    [1, 2],
                ],
            }
        ),
        encoding="utf-8",
    )

    configuration = {
        "experiment_id": str(experiment_id),
        "dataset_version_id": str(dataset_version_id),
        "model_name": ("BanglaGuard Classical"),
        "model_version": "1.0.0",
        "model_family": ("tfidf_logistic_regression"),
        "task": "hate_speech",
        "preprocessing_version": ("banglaguard-text-v1"),
        "random_seed": 42,
        "dataset": {
            "id": str(dataset_version_id),
        },
        "tfidf": {
            "analyzer": "word",
        },
        "classifier": {
            "solver": "liblinear",
        },
    }

    experiment = SimpleNamespace(
        id=experiment_id,
        name="Completed experiment",
        description=None,
        status=(ExperimentStatus.COMPLETED),
        dataset_version_id=(dataset_version_id),
        model_version_id=None,
        random_seed=42,
        code_version="test-version",
        configuration=configuration,
        results={
            "workspace": str(workspace),
            "artifact_path": str(artifact_path),
            "metadata_path": str(metadata_path),
            "execution_result_path": str(execution_result_path),
            "training_log_path": str(workspace / "logs" / "training.log"),
            "training_started": True,
            "training_completed": True,
            "training_failed": False,
            "started_at": ("2026-08-06T00:00:00+00:00"),
            "completed_at": ("2026-08-06T00:00:01+00:00"),
            "duration_seconds": 1.0,
            "validation_metrics": {
                "accuracy": 0.75,
                "macro_precision": 0.75,
                "macro_recall": 0.75,
                "macro_f1": 0.75,
                "weighted_f1": 0.75,
            },
            "test_metrics": {
                "accuracy": 0.70,
                "macro_precision": 0.70,
                "macro_recall": 0.70,
                "macro_f1": 0.70,
                "weighted_f1": 0.70,
            },
            "model_version_registered": (False),
        },
    )

    return (
        experiment,
        metadata_path,
        execution_result_path,
    )


@pytest.mark.asyncio
async def test_register_completed_model(
    tmp_path: Path,
) -> None:
    (
        experiment,
        metadata_path,
        execution_result_path,
    ) = create_completed_experiment(tmp_path)

    session = FakeSession()

    service = ClassicalModelRegistrationService(
        session=session,
        root_directory=tmp_path,
    )

    result = await service.register(experiment=experiment)

    assert result["status"] == (ModelStatus.DRAFT.value)

    assert result["task"] == (AnalysisTask.HATE_SPEECH.value)

    assert result["experiment_linked"] is True

    assert experiment.model_version_id == result["model_version_id"]

    assert experiment.results["model_version_registered"] is True

    assert result["metrics"]["macro_f1"] == 0.70

    metadata = json.loads(
        metadata_path.read_text(
            encoding="utf-8",
        )
    )

    execution_result = json.loads(
        execution_result_path.read_text(
            encoding="utf-8",
        )
    )

    assert metadata["model_version_registered"] is True

    assert execution_result["model_version_registered"] is True

    assert session.commit_count == 1


@pytest.mark.asyncio
async def test_registered_experiment_is_rejected(
    tmp_path: Path,
) -> None:
    (
        experiment,
        _,
        _,
    ) = create_completed_experiment(tmp_path)

    experiment.model_version_id = uuid.uuid4()

    service = ClassicalModelRegistrationService(
        session=FakeSession(),
        root_directory=tmp_path,
    )

    with pytest.raises(ClassicalModelRegistrationConflictError):
        await service.register(experiment=experiment)


@pytest.mark.asyncio
async def test_duplicate_model_identity_is_rejected(
    tmp_path: Path,
) -> None:
    (
        experiment,
        _,
        _,
    ) = create_completed_experiment(tmp_path)

    existing_model = SimpleNamespace(id=uuid.uuid4())

    service = ClassicalModelRegistrationService(
        session=FakeSession(existing_model=(existing_model)),
        root_directory=tmp_path,
    )

    with pytest.raises(ClassicalModelRegistrationConflictError):
        await service.register(experiment=experiment)
