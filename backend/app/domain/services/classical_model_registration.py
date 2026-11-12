from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import ROOT_DIR, settings
from app.db.models import Experiment, ModelVersion
from app.domain.enums import (
    AnalysisTask,
    ExperimentStatus,
    ModelStatus,
)


class ClassicalModelRegistrationError(Exception):
    """Base exception for classical model registration failures."""


class ClassicalModelRegistrationStateError(ClassicalModelRegistrationError):
    """Raised when an experiment cannot register a model."""


class ClassicalModelRegistrationArtifactError(ClassicalModelRegistrationError):
    """Raised when required training artifacts are unavailable."""


class ClassicalModelRegistrationConflictError(ClassicalModelRegistrationError):
    """Raised when the model has already been registered."""


class ClassicalModelRegistrationService:
    def __init__(
        self,
        session: AsyncSession,
        root_directory: Path = ROOT_DIR,
    ) -> None:
        self.session = session
        self.root_directory = root_directory.resolve()

    async def register(
        self,
        *,
        experiment: Experiment,
        identity: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        self._validate_experiment(experiment)

        configuration = dict(self._get_configuration(experiment))
        if identity is not None:
            configuration["model_name"] = identity["name"]
            configuration["model_version"] = identity["version"]

        results = self._get_results(experiment)

        artifact_path = self._resolve_artifact_path(results)

        metrics = self._build_metrics(
            experiment=experiment,
            results=results,
        )

        task = self._parse_task(configuration)

        model_name = self._required_string(
            configuration,
            "model_name",
        )

        model_version_name = self._required_string(
            configuration,
            "model_version",
        )

        model_family = self._required_string(
            configuration,
            "model_family",
        )

        preprocessing_version = self._optional_string(
            configuration,
            "preprocessing_version",
        )

        existing_model = await self._find_existing_model(
            name=model_name,
            version=model_version_name,
            task=task,
        )

        if existing_model is not None:
            raise ClassicalModelRegistrationConflictError(
                "A model version with the same name, "
                "version, and task is already registered."
            )

        model_configuration = {
            "experiment_id": str(experiment.id),
            "dataset_version_id": str(experiment.dataset_version_id),
            "model_family": model_family,
            "random_seed": (experiment.random_seed),
            "code_version": (experiment.code_version),
            "preprocessing_version": (preprocessing_version),
            "training_configuration": (configuration),
            "training_result": {
                "started_at": results.get("started_at"),
                "completed_at": results.get("completed_at"),
                "duration_seconds": results.get("duration_seconds"),
                "training_log_path": results.get("training_log_path"),
                "execution_result_path": (results.get("execution_result_path")),
            },
        }

        registered_model = ModelVersion(
            id=uuid.uuid4(),
            name=model_name,
            version=model_version_name,
            task=task,
            architecture=model_family,
            status=ModelStatus.DRAFT,
            artifact_path=str(artifact_path),
            tokenizer_path=None,
            preprocessing_version=(preprocessing_version),
            metrics=metrics,
            configuration=(model_configuration),
            is_explainable=False,
            activated_at=None,
        )

        experiment.model_version_id = registered_model.id

        experiment.results = {
            **results,
            "model_version_id": str(registered_model.id),
            "model_version_registered": True,
            "model_version_status": (ModelStatus.DRAFT.value),
            "registered_model_name": (registered_model.name),
            "registered_model_version": (registered_model.version),
        }

        self.session.add(registered_model)

        try:
            await self.session.commit()

            await self.session.refresh(registered_model)

            await self.session.refresh(experiment)

            self._update_workspace_files(
                experiment=experiment,
                model_version=registered_model,
            )

        except Exception:
            await self.session.rollback()
            raise

        return {
            "experiment_id": experiment.id,
            "model_version_id": (registered_model.id),
            "name": registered_model.name,
            "version": (registered_model.version),
            "task": (
                registered_model.task.value
                if hasattr(
                    registered_model.task,
                    "value",
                )
                else str(registered_model.task).lower()
            ),
            "architecture": (registered_model.architecture),
            "status": (
                registered_model.status.value
                if hasattr(
                    registered_model.status,
                    "value",
                )
                else str(registered_model.status).lower()
            ),
            "artifact_path": (registered_model.artifact_path),
            "preprocessing_version": (registered_model.preprocessing_version),
            "metrics": (registered_model.metrics or {}),
            "configuration": (registered_model.configuration or {}),
            "is_explainable": (registered_model.is_explainable),
            "experiment_linked": (experiment.model_version_id == registered_model.id),
            "created_at": (registered_model.created_at),
        }

    def _validate_experiment(
        self,
        experiment: Experiment,
    ) -> None:
        if experiment.status != ExperimentStatus.COMPLETED:
            status_value = (
                experiment.status.value
                if hasattr(
                    experiment.status,
                    "value",
                )
                else str(experiment.status).lower()
            )

            raise ClassicalModelRegistrationStateError(
                "Only completed experiments may "
                "register a model version. "
                f"Current status: {status_value}."
            )

        if experiment.model_version_id is not None:
            raise ClassicalModelRegistrationConflictError(
                "This experiment already has a registered model version."
            )

        results = self._get_results(experiment)

        if not bool(
            results.get(
                "training_completed",
                False,
            )
        ):
            raise ClassicalModelRegistrationStateError(
                "The experiment does not contain a completed training result."
            )

        if bool(
            results.get(
                "training_failed",
                False,
            )
        ):
            raise ClassicalModelRegistrationStateError(
                "A failed training run cannot register a model version."
            )

    def _get_configuration(
        self,
        experiment: Experiment,
    ) -> dict[str, Any]:
        if not isinstance(
            experiment.configuration,
            dict,
        ):
            raise ClassicalModelRegistrationStateError(
                "The experiment training configuration is invalid."
            )

        return dict(experiment.configuration)

    def _get_results(
        self,
        experiment: Experiment,
    ) -> dict[str, Any]:
        if not isinstance(
            experiment.results,
            dict,
        ):
            raise ClassicalModelRegistrationStateError(
                "The experiment training results are invalid."
            )

        return dict(experiment.results)

    def _resolve_artifact_path(
        self,
        results: dict[str, Any],
    ) -> Path:
        artifact_value = results.get("artifact_path")

        if (
            not isinstance(
                artifact_value,
                str,
            )
            or not artifact_value.strip()
        ):
            raise ClassicalModelRegistrationArtifactError(
                "The trained model artifact path is missing."
            )

        artifact_path = Path(artifact_value)

        if not artifact_path.is_absolute():
            artifact_path = self.root_directory / artifact_path

        resolved_path = artifact_path.resolve()

        allowed_roots = [
            self._experiment_storage_root(),
            self._model_storage_root(),
        ]

        if not any(
            self._is_within(
                resolved_path,
                root,
            )
            for root in allowed_roots
        ):
            raise ClassicalModelRegistrationArtifactError(
                "The model artifact path is outside the allowed storage roots."
            )

        if not resolved_path.is_file():
            raise ClassicalModelRegistrationArtifactError(
                "The trained model artifact was not found."
            )

        return resolved_path

    def _build_metrics(
        self,
        *,
        experiment: Experiment,
        results: dict[str, Any],
    ) -> dict[str, Any]:
        validation_metrics = results.get("validation_metrics")

        test_metrics = results.get("test_metrics")

        if not isinstance(
            validation_metrics,
            dict,
        ):
            raise ClassicalModelRegistrationStateError(
                "Validation metrics are missing."
            )

        if not isinstance(
            test_metrics,
            dict,
        ):
            raise ClassicalModelRegistrationStateError("Test metrics are missing.")

        metrics: dict[str, Any] = {
            "evaluation_split": "test",
            "accuracy": self._metric_value(
                test_metrics,
                "accuracy",
            ),
            "macro_precision": self._metric_value(
                test_metrics,
                "macro_precision",
            ),
            "macro_recall": self._metric_value(
                test_metrics,
                "macro_recall",
            ),
            "macro_f1": self._metric_value(
                test_metrics,
                "macro_f1",
            ),
            "weighted_f1": self._metric_value(
                test_metrics,
                "weighted_f1",
            ),
            "validation_accuracy": (
                self._metric_value(
                    validation_metrics,
                    "accuracy",
                )
            ),
            "validation_macro_precision": (
                self._metric_value(
                    validation_metrics,
                    "macro_precision",
                )
            ),
            "validation_macro_recall": (
                self._metric_value(
                    validation_metrics,
                    "macro_recall",
                )
            ),
            "validation_macro_f1": (
                self._metric_value(
                    validation_metrics,
                    "macro_f1",
                )
            ),
            "validation_weighted_f1": (
                self._metric_value(
                    validation_metrics,
                    "weighted_f1",
                )
            ),
            "training_runtime_seconds": float(
                results.get(
                    "duration_seconds",
                    0.0,
                )
                or 0.0
            ),
            "dataset_version_id": str(experiment.dataset_version_id),
            "experiment_id": str(experiment.id),
        }

        workspace_value = results.get("workspace")

        if isinstance(
            workspace_value,
            str,
        ):
            workspace = Path(workspace_value)

            self._add_optional_metric_file(
                metrics=metrics,
                key="classification_report",
                path=(workspace / "metrics" / "classification_report.json"),
            )

            self._add_optional_metric_file(
                metrics=metrics,
                key="confusion_matrix",
                path=(workspace / "metrics" / "confusion_matrix.json"),
            )

        return metrics

    def _add_optional_metric_file(
        self,
        *,
        metrics: dict[str, Any],
        key: str,
        path: Path,
    ) -> None:
        try:
            resolved_path = path.resolve()

            if not self._is_within(
                resolved_path,
                self._experiment_storage_root(),
            ):
                return

            if not resolved_path.is_file():
                return

            content = json.loads(
                resolved_path.read_text(
                    encoding="utf-8",
                )
            )

            if isinstance(
                content,
                dict,
            ):
                metrics[key] = content

        except (
            OSError,
            json.JSONDecodeError,
        ):
            return

    def _metric_value(
        self,
        metrics: dict[str, Any],
        key: str,
    ) -> float:
        value = metrics.get(key)

        if not isinstance(
            value,
            int | float,
        ):
            raise ClassicalModelRegistrationStateError(
                f"Required metric {key!r} is missing or invalid."
            )

        return float(value)

    def _parse_task(
        self,
        configuration: dict[str, Any],
    ) -> AnalysisTask:
        task_value = self._required_string(
            configuration,
            "task",
        )

        try:
            return AnalysisTask(task_value)

        except ValueError as exc:
            raise ClassicalModelRegistrationStateError(
                "The experiment task is invalid."
            ) from exc

    async def _find_existing_model(
        self,
        *,
        name: str,
        version: str,
        task: AnalysisTask,
    ) -> ModelVersion | None:
        statement = select(ModelVersion).where(
            ModelVersion.name == name,
            ModelVersion.version == version,
            ModelVersion.task == task,
        )

        result = await self.session.scalars(statement)

        return result.first()

    def _required_string(
        self,
        content: dict[str, Any],
        key: str,
    ) -> str:
        value = content.get(key)

        if (
            not isinstance(
                value,
                str,
            )
            or not value.strip()
        ):
            raise ClassicalModelRegistrationStateError(
                f"Required configuration value {key!r} is missing."
            )

        return value.strip()

    def _optional_string(
        self,
        content: dict[str, Any],
        key: str,
    ) -> str | None:
        value = content.get(key)

        if value is None:
            return None

        if not isinstance(
            value,
            str,
        ):
            raise ClassicalModelRegistrationStateError(
                f"Configuration value {key!r} is invalid."
            )

        cleaned = value.strip()

        return cleaned or None

    def _update_workspace_files(
        self,
        *,
        experiment: Experiment,
        model_version: ModelVersion,
    ) -> None:
        results = self._get_results(experiment)

        metadata_path = results.get("metadata_path")

        execution_result_path = results.get("execution_result_path")

        updates = {
            "model_version_id": str(model_version.id),
            "model_version_registered": True,
            "model_version_status": (ModelStatus.DRAFT.value),
        }

        if isinstance(
            metadata_path,
            str,
        ):
            self._update_json_file(
                Path(metadata_path),
                updates,
            )

        if isinstance(
            execution_result_path,
            str,
        ):
            self._update_json_file(
                Path(execution_result_path),
                updates,
            )

    def _update_json_file(
        self,
        path: Path,
        updates: dict[str, Any],
    ) -> None:
        resolved_path = path.resolve()

        if not self._is_within(
            resolved_path,
            self._experiment_storage_root(),
        ):
            raise ClassicalModelRegistrationArtifactError(
                "An experiment metadata path is outside the allowed storage root."
            )

        if not resolved_path.is_file():
            raise ClassicalModelRegistrationArtifactError(
                "An experiment metadata file was not found."
            )

        try:
            content = json.loads(
                resolved_path.read_text(
                    encoding="utf-8",
                )
            )

        except (
            OSError,
            json.JSONDecodeError,
        ) as exc:
            raise ClassicalModelRegistrationArtifactError(
                "An experiment metadata file could not be read."
            ) from exc

        if not isinstance(
            content,
            dict,
        ):
            raise ClassicalModelRegistrationArtifactError(
                "An experiment metadata file must contain a JSON object."
            )

        content.update(updates)

        resolved_path.write_text(
            json.dumps(
                content,
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )

    def _experiment_storage_root(
        self,
    ) -> Path:
        return self._configured_root(settings.experiment_storage_path)

    def _model_storage_root(
        self,
    ) -> Path:
        return self._configured_root(settings.model_storage_path)

    def _configured_root(
        self,
        configured_value: str,
    ) -> Path:
        path = Path(configured_value)

        if not path.is_absolute():
            path = self.root_directory / path

        return path.resolve()

    def _is_within(
        self,
        path: Path,
        root: Path,
    ) -> bool:
        try:
            path.relative_to(root)
            return True

        except ValueError:
            return False
