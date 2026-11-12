import json
import uuid
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

from app.domain.enums import (
    ExperimentStatus,
)
from app.domain.services.classical_training_execution import (
    ClassicalExperimentStateError,
    ClassicalTrainingExecutionService,
)


class FakeSession:
    def __init__(
        self,
    ) -> None:
        self.commit_count = 0

    async def commit(
        self,
    ) -> None:
        self.commit_count += 1

    async def refresh(
        self,
        instance,
    ) -> None:
        return None


def write_split(
    path: Path,
    *,
    count: int,
) -> None:
    rows = []

    for index in range(count):
        if index % 2 == 0:
            rows.append(
                {
                    "text": (f"এটি ভালো এবং নিরাপদ বাক্য {index}"),
                    "label": "non_hateful",
                }
            )
        else:
            rows.append(
                {
                    "text": (f"এটি অপমানজনক বাক্য {index}"),
                    "label": "hateful",
                }
            )

    pd.DataFrame(rows).to_csv(
        path,
        index=False,
        encoding="utf-8",
    )


def create_experiment_workspace(
    tmp_path: Path,
):
    experiment_id = uuid.uuid4()

    workspace = tmp_path / "storage" / "experiments" / str(experiment_id)

    logs = workspace / "logs"
    artifacts = workspace / "artifacts"
    metrics = workspace / "metrics"

    logs.mkdir(
        parents=True,
    )

    artifacts.mkdir()
    metrics.mkdir()

    dataset_directory = tmp_path / "research" / "data" / "processed" / "dataset"

    dataset_directory.mkdir(
        parents=True,
    )

    train_path = dataset_directory / "train.csv"

    validation_path = dataset_directory / "validation.csv"

    test_path = dataset_directory / "test.csv"

    write_split(
        train_path,
        count=20,
    )

    write_split(
        validation_path,
        count=6,
    )

    write_split(
        test_path,
        count=6,
    )

    configuration = {
        "experiment_id": str(experiment_id),
        "dataset_version_id": str(uuid.uuid4()),
        "experiment_name": ("Classical execution test"),
        "model_name": ("BanglaGuard Classical"),
        "model_version": "1.0.0",
        "model_family": ("tfidf_logistic_regression"),
        "task": "hate_speech",
        "random_seed": 42,
        "preprocessing_version": ("banglaguard-text-v1"),
        "save_probabilities": True,
        "save_classification_report": True,
        "save_confusion_matrix": True,
        "dataset": {
            "artifact_paths": {
                "train": str(train_path),
                "validation": str(validation_path),
                "test": str(test_path),
            }
        },
        "output": {
            "workspace": str(workspace),
            "logs": str(logs),
            "artifacts": str(artifacts),
            "metrics": str(metrics),
        },
        "tfidf": {
            "analyzer": "word",
            "lowercase": False,
            "strip_accents": None,
            "ngram_min": 1,
            "ngram_max": 2,
            "min_df": 1,
            "max_df": 1.0,
            "max_features": 5000,
            "sublinear_tf": True,
            "use_idf": True,
            "smooth_idf": True,
            "norm": "l2",
        },
        "classifier": {
            "penalty": "l2",
            "solver": "liblinear",
            "regularization_c": 1.0,
            "max_iter": 500,
            "class_weight": "balanced",
            "tolerance": 0.0001,
            "fit_intercept": True,
            "l1_ratio": None,
        },
    }

    configuration_path = workspace / "configuration.json"

    configuration_path.write_text(
        json.dumps(
            configuration,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    metadata_path = workspace / "metadata.json"

    metadata_path.write_text(
        json.dumps(
            {
                "experiment_id": str(experiment_id),
                "status": "planned",
                "started_at": None,
                "completed_at": None,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    dataset_version_id = uuid.UUID(configuration["dataset_version_id"])

    experiment = SimpleNamespace(
        id=experiment_id,
        name="Classical execution test",
        description=None,
        status=ExperimentStatus.PLANNED,
        dataset_version_id=(dataset_version_id),
        model_version_id=None,
        random_seed=42,
        code_version="test",
        configuration=configuration,
        results={
            "workspace": str(workspace),
            "configuration_path": str(configuration_path),
            "metadata_path": str(metadata_path),
            "training_started": False,
        },
        started_at=None,
        completed_at=None,
    )

    return (
        experiment,
        workspace,
    )


@pytest.mark.asyncio
async def test_execute_classical_training(
    tmp_path: Path,
) -> None:
    (
        experiment,
        workspace,
    ) = create_experiment_workspace(tmp_path)

    session = FakeSession()

    service = ClassicalTrainingExecutionService(
        session=session,
        root_directory=tmp_path,
    )

    result = await service.execute(
        experiment=experiment,
    )

    assert result["status"] == "completed"

    assert experiment.status == (ExperimentStatus.COMPLETED)

    assert experiment.started_at is not None

    assert experiment.completed_at is not None

    assert (workspace / "artifacts" / "model.joblib").is_file()

    assert (workspace / "metrics" / "validation_metrics.json").is_file()

    assert (workspace / "metrics" / "test_metrics.json").is_file()

    assert (workspace / "metrics" / "classification_report.json").is_file()

    assert (workspace / "metrics" / "confusion_matrix.json").is_file()

    assert (workspace / "metrics" / "execution_result.json").is_file()

    assert (workspace / "logs" / "training.log").is_file()

    assert result["validation_metrics"]["macro_f1"] >= 0.0

    assert result["test_metrics"]["macro_f1"] >= 0.0

    assert result["model_version_registered"] is False


@pytest.mark.asyncio
async def test_non_planned_experiment_is_rejected(
    tmp_path: Path,
) -> None:
    (
        experiment,
        _,
    ) = create_experiment_workspace(tmp_path)

    experiment.status = ExperimentStatus.COMPLETED

    service = ClassicalTrainingExecutionService(
        session=FakeSession(),
        root_directory=tmp_path,
    )

    with pytest.raises(
        ClassicalExperimentStateError,
    ):
        await service.execute(
            experiment=experiment,
        )
