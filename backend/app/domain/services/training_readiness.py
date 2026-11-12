from __future__ import annotations

from typing import Any

from app.db.models import DatasetVersion
from app.domain.services.dataset_artifacts import (
    DatasetArtifactService,
)
from app.schemas.training import (
    ClassicalTrainingRequest,
    TransformerTrainingRequest,
)


class TrainingReadinessError(Exception):
    """Base exception for training-readiness failures."""


class DatasetNotTrainingReadyError(TrainingReadinessError):
    """Raised when dataset quality checks block training."""


class TrainingDatasetArtifactError(TrainingReadinessError):
    """Raised when required training artifacts are unavailable."""


class TrainingTaskMismatchError(TrainingReadinessError):
    """Raised when the dataset task is incompatible with training."""


class TrainingReadinessService:
    def __init__(
        self,
        artifact_service: DatasetArtifactService | None = None,
    ) -> None:
        self.artifact_service = (
            artifact_service
            if artifact_service is not None
            else DatasetArtifactService()
        )

    def evaluate(
        self,
        *,
        dataset_version: DatasetVersion,
        payload: ClassicalTrainingRequest | TransformerTrainingRequest,
    ) -> dict[str, Any]:
        if dataset_version.id != payload.dataset_version_id:
            raise TrainingReadinessError(
                "The training request does not match the selected dataset version."
            )

        task_value = (
            dataset_version.task.value
            if hasattr(
                dataset_version.task,
                "value",
            )
            else str(dataset_version.task).lower()
        )

        if task_value not in {
            "hate_speech",
            "sentiment",
        }:
            raise TrainingTaskMismatchError(
                "The selected dataset task is not supported "
                "by the classical training pipeline."
            )

        quality_report = self.artifact_service.get_quality_report(
            dataset_version=dataset_version,
        )

        if not bool(
            quality_report.get(
                "training_ready",
                False,
            )
        ):
            error_messages = quality_report.get(
                "errors",
                [],
            )

            detail = (
                "; ".join(str(item) for item in error_messages)
                if error_messages
                else "Dataset quality checks did not pass."
            )

            raise DatasetNotTrainingReadyError(
                f"The dataset is not ready for training: {detail}"
            )

        artifact_paths: dict[str, str] = {}

        for file_key in (
            "manifest",
            "processed",
            "train",
            "validation",
            "test",
        ):
            try:
                artifact = self.artifact_service.get_download_file(
                    dataset_version=dataset_version,
                    file_key=file_key,
                )

            except Exception as exc:
                raise TrainingDatasetArtifactError(
                    f"Required training artifact {file_key!r} is unavailable."
                ) from exc

            artifact_paths[file_key] = str(artifact["path"])

        label_schema = (
            dataset_version.label_schema
            if isinstance(
                dataset_version.label_schema,
                dict,
            )
            else {}
        )

        labels_value = label_schema.get(
            "labels",
            [],
        )

        distribution_value = label_schema.get(
            "distribution",
            {},
        )

        labels = [str(label) for label in labels_value]

        label_distribution = {
            str(label): int(count)
            for label, count in (
                distribution_value.items()
                if isinstance(
                    distribution_value,
                    dict,
                )
                else []
            )
        }

        if len(labels) < 2:
            raise DatasetNotTrainingReadyError(
                "The dataset must contain at least two labels."
            )

        return {
            "dataset_version_id": dataset_version.id,
            "dataset_name": dataset_version.name,
            "dataset_version": dataset_version.version,
            "task": task_value,
            "training_ready": True,
            "quality_status": str(
                quality_report.get(
                    "status",
                    "ready",
                )
            ),
            "quality_score": float(
                quality_report.get(
                    "quality_score",
                    0.0,
                )
            ),
            "total_samples": int(dataset_version.total_samples),
            "train_samples": int(dataset_version.train_samples),
            "validation_samples": int(dataset_version.validation_samples),
            "test_samples": int(dataset_version.test_samples),
            "labels": labels,
            "label_distribution": (label_distribution),
            "artifact_paths": artifact_paths,
            "warnings": list(
                quality_report.get(
                    "warnings",
                    [],
                )
            ),
            "errors": list(
                quality_report.get(
                    "errors",
                    [],
                )
            ),
            "recommendations": list(
                quality_report.get(
                    "recommendations",
                    [],
                )
            ),
            "configuration": (
                payload.model_dump(
                    mode="json",
                )
            ),
        }
