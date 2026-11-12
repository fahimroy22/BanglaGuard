from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import ROOT_DIR, settings
from app.db.models import DatasetVersion, Experiment
from app.db.repositories.experiment import ExperimentRepository
from app.domain.enums import ExperimentStatus
from app.domain.services.training_readiness import (
    TrainingReadinessService,
)
from app.domain.services.transformer_training_execution import (
    TransformerTrainingExecutionService,
)
from app.schemas.training import TransformerTrainingRequest


class TransformerExperimentPreparationError(Exception):
    """Base exception for Transformer experiment preparation failures."""


class TransformerExperimentWorkspaceConflictError(
    TransformerExperimentPreparationError
):
    """Raised when the target Transformer workspace already exists."""


class TransformerExperimentPreparationService:
    """Prepare a reproducible Transformer training experiment workspace."""

    def __init__(
        self,
        session: AsyncSession,
        readiness_service: TrainingReadinessService | None = None,
        root_directory: Path = ROOT_DIR,
    ) -> None:
        self.session = session
        self.repository = ExperimentRepository(session)

        self.readiness_service = (
            readiness_service
            if readiness_service is not None
            else TrainingReadinessService()
        )

        self.root_directory = root_directory.resolve()

    async def prepare(
        self,
        *,
        dataset_version: DatasetVersion,
        payload: TransformerTrainingRequest,
    ) -> dict[str, Any]:
        readiness = self.readiness_service.evaluate(
            dataset_version=dataset_version,
            payload=payload,
        )

        execution_service = TransformerTrainingExecutionService(self.session)

        (
            requested_device,
            resolved_device,
        ) = execution_service._resolve_device(
            payload.model_dump(
                mode="json",
            )
        )

        experiment_id = uuid.uuid4()
        experiment_root = self._resolve_experiment_root(experiment_id)

        configuration_path = experiment_root / "configuration.json"
        metadata_path = experiment_root / "metadata.json"

        logs_directory = experiment_root / "logs"
        artifacts_directory = experiment_root / "artifacts"
        metrics_directory = experiment_root / "metrics"
        checkpoints_directory = experiment_root / "checkpoints"
        predictions_directory = experiment_root / "predictions"

        if experiment_root.exists():
            raise TransformerExperimentWorkspaceConflictError(
                "The Transformer experiment workspace already exists."
            )

        created_at = datetime.now(timezone.utc)

        request_configuration = payload.model_dump(
            mode="json",
        )

        model_configuration = request_configuration.get(
            "model",
            {},
        )

        pretrained_model = (
            model_configuration.get(
                "pretrained_model_name_or_path",
            )
            if isinstance(model_configuration, dict)
            else None
        )

        tokenizer_name = (
            model_configuration.get(
                "tokenizer_name_or_path",
            )
            if isinstance(model_configuration, dict)
            else None
        )

        configuration: dict[str, Any] = {
            **request_configuration,
            "experiment_id": str(experiment_id),
            "task": readiness["task"],
            "dataset": {
                "id": str(dataset_version.id),
                "name": dataset_version.name,
                "version": dataset_version.version,
                "checksum": dataset_version.checksum,
                "manifest_path": dataset_version.manifest_path,
                "sample_counts": {
                    "total": readiness["total_samples"],
                    "train": readiness["train_samples"],
                    "validation": readiness["validation_samples"],
                    "test": readiness["test_samples"],
                },
                "labels": readiness["labels"],
                "label_schema": getattr(dataset_version, "label_schema", None),
                "label_distribution": readiness["label_distribution"],
                "artifact_paths": readiness["artifact_paths"],
            },
            "quality": {
                "status": readiness["quality_status"],
                "score": readiness["quality_score"],
                "warnings": readiness["warnings"],
                "errors": readiness["errors"],
                "recommendations": readiness["recommendations"],
            },
            "output": {
                "workspace": str(experiment_root),
                "configuration": str(configuration_path),
                "metadata": str(metadata_path),
                "logs": str(logs_directory),
                "artifacts": str(artifacts_directory),
                "metrics": str(metrics_directory),
                "checkpoints": str(checkpoints_directory),
                "predictions": str(predictions_directory),
            },
        }

        metadata: dict[str, Any] = {
            "experiment_id": str(experiment_id),
            "name": payload.experiment_name,
            "description": payload.experiment_description,
            "status": ExperimentStatus.PLANNED.value,
            "experiment_type": "transformer",
            "dataset_version_id": str(dataset_version.id),
            "model_version_id": None,
            "model_name": payload.model_name,
            "model_version": payload.model_version,
            "model_family": payload.model_family,
            "pretrained_model_name_or_path": pretrained_model,
            "tokenizer_name_or_path": (tokenizer_name or pretrained_model),
            "task": readiness["task"],
            "random_seed": payload.random_seed,
            "code_version": payload.code_version,
            "preprocessing_version": (payload.preprocessing_version),
            "training_ready": True,
            "quality_score": readiness["quality_score"],
            "requested_device": requested_device,
            "resolved_device": resolved_device,
            "created_at": created_at.isoformat(),
            "started_at": None,
            "completed_at": None,
        }

        experiment = Experiment(
            id=experiment_id,
            name=payload.experiment_name,
            description=payload.experiment_description,
            status=ExperimentStatus.PLANNED,
            dataset_version_id=dataset_version.id,
            model_version_id=None,
            random_seed=payload.random_seed,
            code_version=payload.code_version,
            configuration=configuration,
            results={
                "experiment_type": "transformer",
                "workspace": str(experiment_root),
                "configuration_path": str(configuration_path),
                "metadata_path": str(metadata_path),
                "training_started": False,
                "training_completed": False,
                "training_failed": False,
                "model_version_registered": False,
            },
        )

        try:
            experiment_root.mkdir(
                parents=True,
                exist_ok=False,
            )

            logs_directory.mkdir()
            artifacts_directory.mkdir()
            metrics_directory.mkdir()
            checkpoints_directory.mkdir()
            predictions_directory.mkdir()

            self._write_json(
                configuration_path,
                configuration,
            )

            self._write_json(
                metadata_path,
                metadata,
            )

            registered_experiment = await self.repository.add(experiment)

        except Exception:
            await self.session.rollback()

            shutil.rmtree(
                experiment_root,
                ignore_errors=True,
            )

            raise

        status_value = (
            registered_experiment.status.value
            if hasattr(
                registered_experiment.status,
                "value",
            )
            else str(registered_experiment.status).lower()
        )

        return {
            "experiment_id": registered_experiment.id,
            "name": registered_experiment.name,
            "status": status_value,
            "dataset_version_id": (registered_experiment.dataset_version_id),
            "model_version_id": (registered_experiment.model_version_id),
            "task": readiness["task"],
            "model_family": payload.model_family,
            "model_name": payload.model_name,
            "model_version": payload.model_version,
            "pretrained_model_name_or_path": (pretrained_model),
            "random_seed": (
                registered_experiment.random_seed
                if registered_experiment.random_seed is not None
                else payload.random_seed
            ),
            "code_version": (registered_experiment.code_version),
            "training_ready": True,
            "quality_score": readiness["quality_score"],
            "requested_device": requested_device,
            "resolved_device": resolved_device,
            "workspace_paths": {
                "workspace": str(experiment_root),
                "configuration": str(configuration_path),
                "metadata": str(metadata_path),
                "logs": str(logs_directory),
                "artifacts": str(artifacts_directory),
                "metrics": str(metrics_directory),
                "checkpoints": str(checkpoints_directory),
                "predictions": str(predictions_directory),
            },
            "configuration": configuration,
            "created_at": (registered_experiment.created_at.isoformat()),
        }

    async def prepare_transformer_experiment(
        self,
        *,
        dataset_version: DatasetVersion,
        payload: TransformerTrainingRequest,
    ) -> dict[str, Any]:
        """Compatibility alias matching the classical service naming style."""
        return await self.prepare(
            dataset_version=dataset_version,
            payload=payload,
        )

    def _resolve_experiment_root(
        self,
        experiment_id: uuid.UUID,
    ) -> Path:
        configured_root = Path(
            getattr(
                settings,
                "experiment_storage_path",
                "storage/experiments",
            )
        )

        if not configured_root.is_absolute():
            configured_root = self.root_directory / configured_root

        storage_root = configured_root.resolve()

        experiment_root = (storage_root / str(experiment_id)).resolve()

        try:
            experiment_root.relative_to(storage_root)
        except ValueError as exc:
            raise TransformerExperimentPreparationError(
                "The Transformer experiment workspace path is invalid."
            ) from exc

        return experiment_root

    def _write_json(
        self,
        path: Path,
        content: dict[str, Any],
    ) -> None:
        path.write_text(
            json.dumps(
                content,
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
