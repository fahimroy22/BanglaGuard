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


class TransformerModelRegistrationError(Exception):
    """Base exception for Transformer model registration failures."""


class TransformerModelRegistrationStateError(TransformerModelRegistrationError):
    """Raised when an experiment cannot register a Transformer model."""


class TransformerModelRegistrationArtifactError(TransformerModelRegistrationError):
    """Raised when required Transformer artifacts are unavailable."""


class TransformerModelRegistrationConflictError(TransformerModelRegistrationError):
    """Raised when a Transformer model has already been registered."""


class TransformerModelRegistrationService:
    """Register a completed Transformer experiment as a model version."""

    supported_model_family = "banglabert_sequence_classification"

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

        model_family = self._required_string(
            configuration,
            "model_family",
        )

        if model_family != self.supported_model_family:
            raise (
                TransformerModelRegistrationStateError(
                    "The experiment is not a "
                    "supported BanglaBERT "
                    "sequence-classification run."
                )
            )

        artifact_path = self._resolve_model_artifact_path(results)

        tokenizer_path = self._resolve_tokenizer_path(
            results=results,
            artifact_path=artifact_path,
        )

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

        preprocessing_version = self._optional_string(
            configuration,
            "preprocessing_version",
        )

        existing_model = await self._find_existing_model(
            name=model_name,
            version=(model_version_name),
            task=task,
        )

        if existing_model is not None:
            raise (
                TransformerModelRegistrationConflictError(
                    "A model version with the "
                    "same name, version, and "
                    "task is already registered."
                )
            )

        model_configuration = self._build_model_configuration(
            experiment=experiment,
            configuration=configuration,
            results=results,
            artifact_path=artifact_path,
            tokenizer_path=tokenizer_path,
            preprocessing_version=(preprocessing_version),
        )

        registered_model = ModelVersion(
            id=uuid.uuid4(),
            name=model_name,
            version=model_version_name,
            task=task,
            architecture=model_family,
            status=ModelStatus.DRAFT,
            artifact_path=str(artifact_path),
            tokenizer_path=str(tokenizer_path),
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
            "registered_model_architecture": (registered_model.architecture),
            "registered_artifact_path": (registered_model.artifact_path),
            "registered_tokenizer_path": (registered_model.tokenizer_path),
        }

        self.session.add(registered_model)

        try:
            await self.session.commit()

            await self.session.refresh(registered_model)

            await self.session.refresh(experiment)

            self._update_workspace_files(
                experiment=experiment,
                model_version=(registered_model),
            )

        except Exception:
            await self.session.rollback()
            raise

        return {
            "experiment_id": (experiment.id),
            "model_version_id": (registered_model.id),
            "name": (registered_model.name),
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
            "tokenizer_path": (registered_model.tokenizer_path),
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

            raise (
                TransformerModelRegistrationStateError(
                    "Only completed experiments "
                    "may register a Transformer "
                    "model version. "
                    f"Current status: "
                    f"{status_value}."
                )
            )

        if experiment.model_version_id is not None:
            raise (
                TransformerModelRegistrationConflictError(
                    "This experiment already has a registered model version."
                )
            )

        results = self._get_results(experiment)

        if not bool(
            results.get(
                "training_completed",
                False,
            )
        ):
            raise (
                TransformerModelRegistrationStateError(
                    "The experiment does not contain a completed training result."
                )
            )

        if bool(
            results.get(
                "training_failed",
                False,
            )
        ):
            raise (
                TransformerModelRegistrationStateError(
                    "A failed Transformer training run cannot register a model version."
                )
            )

        if not bool(
            results.get(
                "evaluation_completed",
                False,
            )
        ):
            raise (
                TransformerModelRegistrationStateError(
                    "Transformer validation and "
                    "test evaluation must finish "
                    "before registration."
                )
            )

        if not bool(
            results.get(
                "artifacts_persisted",
                False,
            )
        ):
            raise (
                TransformerModelRegistrationStateError(
                    "Final Transformer artifacts must be persisted before registration."
                )
            )

        if bool(
            results.get(
                "training_phase_only",
                False,
            )
        ):
            raise (
                TransformerModelRegistrationStateError(
                    "A training-only lifecycle result cannot be registered."
                )
            )

        if bool(
            results.get(
                "model_version_registered",
                False,
            )
        ):
            raise (
                TransformerModelRegistrationConflictError(
                    "The experiment results already indicate model registration."
                )
            )

    def _get_configuration(
        self,
        experiment: Experiment,
    ) -> dict[str, Any]:
        if not isinstance(
            experiment.configuration,
            dict,
        ):
            raise (
                TransformerModelRegistrationStateError(
                    "The experiment training configuration is invalid."
                )
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
            raise (
                TransformerModelRegistrationStateError(
                    "The experiment training results are invalid."
                )
            )

        return dict(experiment.results)

    def _resolve_model_artifact_path(
        self,
        results: dict[str, Any],
    ) -> Path:
        artifact_value = results.get("artifact_path")

        artifact_path = self._resolve_registered_path(
            value=artifact_value,
            description=("trained Transformer model"),
        )

        if not artifact_path.is_dir():
            raise (
                TransformerModelRegistrationArtifactError(
                    "The trained Transformer artifact must be a directory."
                )
            )

        required_files = [
            "config.json",
        ]

        missing_files = [
            filename
            for filename in required_files
            if not (artifact_path / filename).is_file()
        ]

        if missing_files:
            raise (
                TransformerModelRegistrationArtifactError(
                    "The Transformer model "
                    "artifact is missing required "
                    "files: " + ", ".join(missing_files) + "."
                )
            )

        weight_candidates = (
            artifact_path / "model.safetensors",
            artifact_path / "pytorch_model.bin",
        )

        if not any(path.is_file() for path in weight_candidates):
            raise (
                TransformerModelRegistrationArtifactError(
                    "The Transformer artifact does not contain model weights."
                )
            )

        return artifact_path

    def _resolve_tokenizer_path(
        self,
        *,
        results: dict[str, Any],
        artifact_path: Path,
    ) -> Path:
        tokenizer_value = results.get("tokenizer_path")

        if tokenizer_value is None:
            tokenizer_path = artifact_path
        else:
            tokenizer_path = self._resolve_registered_path(
                value=tokenizer_value,
                description=("Transformer tokenizer"),
            )

        if not tokenizer_path.is_dir():
            raise (
                TransformerModelRegistrationArtifactError(
                    "The Transformer tokenizer artifact must be a directory."
                )
            )

        tokenizer_configuration = tokenizer_path / "tokenizer_config.json"

        if not (tokenizer_configuration.is_file()):
            raise (
                TransformerModelRegistrationArtifactError(
                    "The Transformer tokenizer "
                    "artifact is missing "
                    "tokenizer_config.json."
                )
            )

        vocabulary_candidates = (
            tokenizer_path / "tokenizer.json",
            tokenizer_path / "vocab.txt",
            tokenizer_path / "sentencepiece.bpe.model",
            tokenizer_path / "spiece.model",
            tokenizer_path / "vocab.json",
        )

        if not any(path.is_file() for path in vocabulary_candidates):
            raise (
                TransformerModelRegistrationArtifactError(
                    "The Transformer tokenizer "
                    "artifact does not contain a "
                    "supported vocabulary file."
                )
            )

        return tokenizer_path

    def _resolve_registered_path(
        self,
        *,
        value: object,
        description: str,
    ) -> Path:
        if (
            not isinstance(
                value,
                str,
            )
            or not value.strip()
        ):
            raise (
                TransformerModelRegistrationArtifactError(
                    f"The {description} path is missing."
                )
            )

        path = Path(value.strip())

        if not path.is_absolute():
            path = self.root_directory / path

        resolved_path = path.resolve()

        allowed_roots = (
            self._experiment_storage_root(),
            self._model_storage_root(),
        )

        if not any(
            self._is_within(
                resolved_path,
                root,
            )
            for root in allowed_roots
        ):
            raise (
                TransformerModelRegistrationArtifactError(
                    f"The {description} path is outside the allowed storage roots."
                )
            )

        if not resolved_path.exists():
            raise (
                TransformerModelRegistrationArtifactError(
                    f"The {description} artifact was not found."
                )
            )

        return resolved_path

    def _build_metrics(
        self,
        *,
        experiment: Experiment,
        results: dict[str, Any],
    ) -> dict[str, Any]:
        training_metrics = results.get("training_metrics")

        validation_metrics = results.get("validation_metrics")

        test_metrics = results.get("test_metrics")

        if not isinstance(
            training_metrics,
            dict,
        ):
            raise (
                TransformerModelRegistrationStateError(
                    "Transformer training metrics are missing."
                )
            )

        if not isinstance(
            validation_metrics,
            dict,
        ):
            raise (
                TransformerModelRegistrationStateError(
                    "Transformer validation metrics are missing."
                )
            )

        if not isinstance(
            test_metrics,
            dict,
        ):
            raise (
                TransformerModelRegistrationStateError(
                    "Transformer test metrics are missing."
                )
            )

        metrics: dict[str, Any] = {
            "evaluation_split": "test",
            "accuracy": (
                self._metric_value(
                    test_metrics,
                    "accuracy",
                )
            ),
            "macro_precision": (
                self._metric_value(
                    test_metrics,
                    "macro_precision",
                )
            ),
            "macro_recall": (
                self._metric_value(
                    test_metrics,
                    "macro_recall",
                )
            ),
            "macro_f1": (
                self._metric_value(
                    test_metrics,
                    "macro_f1",
                )
            ),
            "weighted_f1": (
                self._metric_value(
                    test_metrics,
                    "weighted_f1",
                )
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
            "training_metrics": (self._numeric_metric_mapping(training_metrics)),
        }

        optional_metric_paths = {
            "classification_report": (results.get("classification_report_path")),
            "confusion_matrix": (results.get("confusion_matrix_path")),
        }

        for key, path_value in optional_metric_paths.items():
            self._add_optional_json_file(
                content=metrics,
                key=key,
                path_value=path_value,
            )

        return metrics

    def _numeric_metric_mapping(
        self,
        metrics: dict[str, Any],
    ) -> dict[str, float]:
        output: dict[str, float] = {}

        for key, value in metrics.items():
            if isinstance(
                value,
                bool,
            ):
                continue

            if isinstance(
                value,
                int | float,
            ):
                output[str(key)] = float(value)

        return output

    def _add_optional_json_file(
        self,
        *,
        content: dict[str, Any],
        key: str,
        path_value: object,
    ) -> None:
        if not isinstance(
            path_value,
            str,
        ):
            return

        try:
            path = Path(path_value).resolve()

            if not self._is_within(
                path,
                self._experiment_storage_root(),
            ):
                return

            if not path.is_file():
                return

            loaded = json.loads(
                path.read_text(
                    encoding="utf-8",
                )
            )

            if isinstance(
                loaded,
                dict,
            ):
                content[key] = loaded

        except (
            OSError,
            json.JSONDecodeError,
        ):
            return

    def _build_model_configuration(
        self,
        *,
        experiment: Experiment,
        configuration: dict[str, Any],
        results: dict[str, Any],
        artifact_path: Path,
        tokenizer_path: Path,
        preprocessing_version: str | None,
    ) -> dict[str, Any]:
        model_section = configuration.get("model")

        if not isinstance(
            model_section,
            dict,
        ):
            raise (
                TransformerModelRegistrationStateError(
                    "The Transformer model configuration is missing."
                )
            )

        return {
            "experiment_id": str(experiment.id),
            "dataset_version_id": str(experiment.dataset_version_id),
            "model_family": (configuration["model_family"]),
            "pretrained_model_name_or_path": (
                model_section.get("pretrained_model_name_or_path")
            ),
            "random_seed": (experiment.random_seed),
            "code_version": (experiment.code_version),
            "preprocessing_version": (preprocessing_version),
            "artifact_path": str(artifact_path),
            "tokenizer_path": str(tokenizer_path),
            "training_configuration": (configuration),
            "training_result": {
                "started_at": (results.get("started_at")),
                "completed_at": (results.get("completed_at")),
                "duration_seconds": (results.get("duration_seconds")),
                "requested_device": (results.get("requested_device")),
                "resolved_device": (results.get("resolved_device")),
                "best_checkpoint_path": (results.get("best_checkpoint_path")),
                "checkpoint_paths": (
                    results.get(
                        "checkpoint_paths",
                        [],
                    )
                ),
                "training_log_path": (results.get("training_log_path")),
                "trainer_state_path": (results.get("trainer_state_path")),
                "execution_result_path": (results.get("execution_result_path")),
            },
            "evidence": {
                "label_mapping_path": (results.get("label_mapping_path")),
                "classification_report_path": (
                    results.get("classification_report_path")
                ),
                "confusion_matrix_path": (results.get("confusion_matrix_path")),
                "validation_predictions_path": (
                    results.get("validation_predictions_path")
                ),
                "test_predictions_path": (results.get("test_predictions_path")),
            },
        }

    def _metric_value(
        self,
        metrics: dict[str, Any],
        key: str,
    ) -> float:
        value = metrics.get(key)

        if isinstance(
            value,
            bool,
        ) or not isinstance(
            value,
            int | float,
        ):
            raise (
                TransformerModelRegistrationStateError(
                    f"Required metric {key!r} is missing or invalid."
                )
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
            raise (
                TransformerModelRegistrationStateError(
                    "The experiment task is invalid."
                )
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
            raise (
                TransformerModelRegistrationStateError(
                    f"Required configuration value {key!r} is missing."
                )
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
            raise (
                TransformerModelRegistrationStateError(
                    f"Configuration value {key!r} is invalid."
                )
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
            "registered_model_name": (model_version.name),
            "registered_model_version": (model_version.version),
            "registered_model_architecture": (model_version.architecture),
            "registered_artifact_path": (model_version.artifact_path),
            "registered_tokenizer_path": (model_version.tokenizer_path),
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
            raise (
                TransformerModelRegistrationArtifactError(
                    "An experiment metadata path is outside the allowed storage root."
                )
            )

        if not resolved_path.is_file():
            raise (
                TransformerModelRegistrationArtifactError(
                    "An experiment metadata file was not found."
                )
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
            raise (
                TransformerModelRegistrationArtifactError(
                    "An experiment metadata file could not be read."
                )
            ) from exc

        if not isinstance(
            content,
            dict,
        ):
            raise (
                TransformerModelRegistrationArtifactError(
                    "An experiment metadata file must contain a JSON object."
                )
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
