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
from app.schemas.training import ClassicalTrainingRequest


class ExperimentPreparationError(Exception):
    """Base exception for experiment-preparation failures."""


class ExperimentWorkspaceConflictError(ExperimentPreparationError):
    """Raised when an experiment workspace already exists."""


class ExperimentPreparationService:
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

    async def prepare_classical_experiment(
        self,
        *,
        dataset_version: DatasetVersion,
        payload: ClassicalTrainingRequest,
    ) -> dict[str, Any]:
        readiness = self.readiness_service.evaluate(
            dataset_version=dataset_version,
            payload=payload,
        )

        experiment_id = uuid.uuid4()

        experiment_root = self._resolve_experiment_root(experiment_id)

        configuration_path = experiment_root / "configuration.json"

        metadata_path = experiment_root / "metadata.json"

        logs_directory = experiment_root / "logs"
        artifacts_directory = experiment_root / "artifacts"
        metrics_directory = experiment_root / "metrics"

        if experiment_root.exists():
            raise ExperimentWorkspaceConflictError(
                "The experiment workspace already exists."
            )

        created_at = datetime.now(timezone.utc)

        configuration = {
            **readiness["configuration"],
            "experiment_id": str(experiment_id),
            "task": readiness["task"],
            "dataset": {
                "id": str(dataset_version.id),
                "name": dataset_version.name,
                "version": dataset_version.version,
                "checksum": dataset_version.checksum,
                "manifest_path": (dataset_version.manifest_path),
                "sample_counts": {
                    "total": readiness["total_samples"],
                    "train": readiness["train_samples"],
                    "validation": (readiness["validation_samples"]),
                    "test": readiness["test_samples"],
                },
                "labels": readiness["labels"],
                "label_schema": getattr(dataset_version, "label_schema", None),
                "label_distribution": (readiness["label_distribution"]),
                "artifact_paths": (readiness["artifact_paths"]),
            },
            "quality": {
                "status": readiness["quality_status"],
                "score": readiness["quality_score"],
                "warnings": readiness["warnings"],
                "errors": readiness["errors"],
                "recommendations": (readiness["recommendations"]),
            },
            "output": {
                "workspace": str(experiment_root),
                "logs": str(logs_directory),
                "artifacts": str(artifacts_directory),
                "metrics": str(metrics_directory),
            },
        }

        metadata = {
            "experiment_id": str(experiment_id),
            "name": payload.experiment_name,
            "description": (payload.experiment_description),
            "status": ExperimentStatus.PLANNED.value,
            "dataset_version_id": str(dataset_version.id),
            "model_version_id": None,
            "model_name": payload.model_name,
            "model_version": payload.model_version,
            "model_family": payload.model_family,
            "task": readiness["task"],
            "random_seed": payload.random_seed,
            "code_version": payload.code_version,
            "preprocessing_version": (payload.preprocessing_version),
            "training_ready": True,
            "quality_score": readiness["quality_score"],
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
                "workspace": str(experiment_root),
                "configuration_path": (str(configuration_path)),
                "metadata_path": str(metadata_path),
                "training_started": False,
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

        return {
            "experiment_id": (registered_experiment.id),
            "name": registered_experiment.name,
            "status": (
                registered_experiment.status.value
                if hasattr(
                    registered_experiment.status,
                    "value",
                )
                else str(registered_experiment.status).lower()
            ),
            "dataset_version_id": (registered_experiment.dataset_version_id),
            "model_version_id": (registered_experiment.model_version_id),
            "task": readiness["task"],
            "random_seed": (
                registered_experiment.random_seed
                if registered_experiment.random_seed is not None
                else payload.random_seed
            ),
            "code_version": (registered_experiment.code_version),
            "training_ready": True,
            "quality_score": readiness["quality_score"],
            "workspace_paths": {
                "workspace": str(experiment_root),
                "configuration": (str(configuration_path)),
                "metadata": str(metadata_path),
                "logs": str(logs_directory),
                "artifacts": str(artifacts_directory),
                "metrics": str(metrics_directory),
            },
            "configuration": configuration,
            "created_at": (registered_experiment.created_at.isoformat()),
        }

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
            raise ExperimentPreparationError(
                "The experiment workspace path is invalid."
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
