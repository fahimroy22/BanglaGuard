from __future__ import annotations

from starlette.concurrency import run_in_threadpool

import inspect
import json
import traceback
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import Any

import numpy as np
import pandas as pd
import torch
from datasets import Dataset
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sqlalchemy.ext.asyncio import AsyncSession
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
    EvalPrediction,
    PreTrainedModel,
    PreTrainedTokenizerBase,
    Trainer,
    TrainingArguments,
)

from app.core.config import ROOT_DIR, settings
from app.db.models import Experiment
from app.db.repositories.experiment import (
    ExperimentRepository,
)
from app.domain.enums import ExperimentStatus


class TransformerTrainingExecutionError(Exception):
    """Base exception for Transformer execution failures."""


class TransformerExperimentStateError(TransformerTrainingExecutionError):
    """Raised when an experiment cannot start Transformer training."""


class TransformerExperimentConfigurationError(TransformerTrainingExecutionError):
    """Raised when a saved Transformer configuration is invalid."""


class TransformerTrainingArtifactError(TransformerTrainingExecutionError):
    """Raised when required workspace or dataset artifacts are missing."""


class TransformerDeviceError(TransformerTrainingExecutionError):
    """Raised when the requested compute device is unavailable."""


class TransformerModelLoadingError(TransformerTrainingExecutionError):
    """Raised when the tokenizer or pretrained model cannot be loaded."""


class TransformerDatasetPreparationError(TransformerTrainingExecutionError):
    """Raised when dataset loading, encoding, or tokenization fails."""


class TransformerTrainerConfigurationError(TransformerTrainingExecutionError):
    """Raised when Hugging Face Trainer configuration is invalid."""


@dataclass(slots=True)
class TransformerDatasetSplits:
    train: Dataset
    validation: Dataset
    test: Dataset

    labels: list[str]
    label_to_id: dict[str, int]
    id_to_label: dict[int, str]

    sample_counts: dict[str, int]
    evidence_texts: dict[str, list[str]] | None = None
    evidence_sources: dict[str, list[str]] | None = None


# PHASE 22.4.4.1D.3.1: TRANSFORMER TRAINING LIFECYCLE


@dataclass(slots=True)
class TransformerTrainingRunResult:
    started_at: datetime
    completed_at: datetime
    duration_seconds: float

    resumed_from_checkpoint: str | None
    best_checkpoint_path: str | None
    checkpoint_paths: list[str]

    training_metrics: dict[str, float]


# PHASE 22.4.4.1D.3.3: TRANSFORMER EVALUATION


@dataclass(slots=True)
class TransformerSplitEvaluationResult:
    split: str
    sample_count: int

    label_ids: list[int]
    predicted_ids: list[int]

    labels: list[str]
    predicted_labels: list[str]

    probabilities: list[list[float]] | None

    trainer_metrics: dict[str, float]
    summary_metrics: dict[str, float]

    classification_report: dict[str, Any]
    confusion_matrix_labels: list[str]
    confusion_matrix: list[list[int]]


@dataclass(slots=True)
class TransformerEvaluationResult:
    validation: TransformerSplitEvaluationResult
    test: TransformerSplitEvaluationResult


# PHASE 22.4.4.1D.3.4: FINAL ARTIFACT PERSISTENCE


@dataclass(slots=True)
class TransformerArtifactPersistenceResult:
    artifact_path: str
    tokenizer_path: str

    trainer_state_path: str | None
    execution_result_path: str

    label_mapping_path: str

    training_metrics_path: str
    validation_metrics_path: str
    test_metrics_path: str

    classification_report_path: str | None
    confusion_matrix_path: str | None

    validation_predictions_path: str | None
    test_predictions_path: str | None


@dataclass(slots=True)
class TransformerExecutionComponents:
    configuration: dict[str, Any]
    paths: dict[str, Path]

    requested_device: str
    resolved_device: str

    tokenizer: PreTrainedTokenizerBase
    model: PreTrainedModel

    datasets: TransformerDatasetSplits
    data_collator: DataCollatorWithPadding

    training_arguments: TrainingArguments
    trainer: Trainer


class TransformerTrainingExecutionService:
    """Assemble the Transformer fine-tuning pipeline.

    This phase intentionally stops before ``trainer.train()``. Training,
    evaluation, artifact persistence, and experiment lifecycle transitions
    are added in the following execution phases.
    """

    supported_model_family = "banglabert_sequence_classification"

    def __init__(
        self,
        session: AsyncSession,
        root_directory: Path = ROOT_DIR,
    ) -> None:
        self.session = session
        self.repository = ExperimentRepository(session)
        self.root_directory = root_directory.resolve()

    def assemble(
        self,
        *,
        experiment: Experiment,
    ) -> TransformerExecutionComponents:
        """Build every component required for Transformer training."""

        self._validate_initial_state(experiment)

        configuration = self._load_configuration(
            experiment,
        )

        paths = self._resolve_execution_paths(
            experiment=experiment,
            configuration=configuration,
        )

        requested_device, resolved_device = self._resolve_device(configuration)

        datasets = self._load_dataset_splits(
            configuration,
        )

        tokenizer = self._load_tokenizer(
            configuration,
        )

        tokenized_datasets = self._tokenize_datasets(
            datasets=datasets,
            tokenizer=tokenizer,
            configuration=configuration,
        )

        model = self._load_model(
            configuration=configuration,
            datasets=tokenized_datasets,
        )

        model_configuration = self._require_object(
            configuration,
            "model",
        )

        if bool(
            model_configuration.get(
                "gradient_checkpointing",
                False,
            )
        ):
            gradient_checkpointing_enable = getattr(
                model,
                "gradient_checkpointing_enable",
                None,
            )

            if callable(gradient_checkpointing_enable):
                gradient_checkpointing_enable()

        training_arguments = self._create_training_arguments(
            configuration=configuration,
            paths=paths,
            resolved_device=resolved_device,
        )

        data_collator = DataCollatorWithPadding(
            tokenizer=tokenizer,
        )

        trainer = self._create_trainer(
            model=model,
            tokenizer=tokenizer,
            datasets=tokenized_datasets,
            data_collator=data_collator,
            training_arguments=training_arguments,
            configuration=configuration,
        )

        return TransformerExecutionComponents(
            configuration=configuration,
            paths=paths,
            requested_device=requested_device,
            resolved_device=resolved_device,
            tokenizer=tokenizer,
            model=model,
            datasets=tokenized_datasets,
            data_collator=data_collator,
            training_arguments=training_arguments,
            trainer=trainer,
        )

    # PHASE 22.4.4.1D.3.2: EXPERIMENT STATE LIFECYCLE

    async def execute(
        self,
        *,
        experiment: Experiment,
        resume_from_checkpoint: str | Path | None = None,
    ) -> dict[str, Any]:
        """Execute the complete Transformer training workflow."""

        components = await run_in_threadpool(
            self.assemble, experiment=experiment,
        )

        lifecycle_started_at = datetime.now(timezone.utc)

        await self._mark_experiment_running(
            experiment=experiment,
            components=components,
            started_at=lifecycle_started_at,
        )

        try:
            training_result = await run_in_threadpool(
                self.run_training,
                components=components,
                resume_from_checkpoint=(resume_from_checkpoint),
            )

            evaluation_result = await run_in_threadpool(
                self.evaluate_and_generate_predictions,
                components=components,
            )

            persistence_result = await run_in_threadpool(
                self.persist_execution_artifacts,
                experiment=experiment,
                components=components,
                training_result=training_result,
                evaluation_result=(evaluation_result),
            )

            return await self._mark_execution_completed(
                experiment=experiment,
                components=components,
                training_result=training_result,
                evaluation_result=(evaluation_result),
                persistence_result=(persistence_result),
            )

        except Exception as exc:
            await self._mark_training_failed(
                experiment=experiment,
                components=components,
                started_at=(lifecycle_started_at),
                error=exc,
            )

            if isinstance(
                exc,
                TransformerTrainingExecutionError,
            ):
                raise

            raise TransformerTrainingExecutionError(
                f"Transformer execution failed: {str(exc)[:4000]}"
            ) from exc

    def persist_execution_artifacts(
        self,
        *,
        experiment: Experiment,
        components: TransformerExecutionComponents,
        training_result: TransformerTrainingRunResult,
        evaluation_result: TransformerEvaluationResult,
    ) -> TransformerArtifactPersistenceResult:
        """Persist the final Transformer model and evaluation evidence."""

        artifacts_directory = components.paths["artifacts"]

        metrics_directory = components.paths["metrics"]

        predictions_directory = components.paths["predictions"]

        final_model_directory = artifacts_directory / "final-model"

        final_model_directory.mkdir(
            parents=True,
            exist_ok=True,
        )

        metrics_directory.mkdir(
            parents=True,
            exist_ok=True,
        )

        predictions_directory.mkdir(
            parents=True,
            exist_ok=True,
        )

        try:
            components.trainer.save_model(str(final_model_directory))

            components.tokenizer.save_pretrained(str(final_model_directory))

        except Exception as exc:
            raise TransformerTrainingArtifactError(
                "The final Transformer model or tokenizer could not be saved."
            ) from exc

        required_model_files = {
            "config.json",
        }

        missing_model_files = sorted(
            filename
            for filename in required_model_files
            if not (final_model_directory / filename).is_file()
        )

        weight_candidates = (
            final_model_directory / "model.safetensors",
            final_model_directory / "pytorch_model.bin",
        )

        if missing_model_files:
            raise TransformerTrainingArtifactError(
                "The exported Transformer model "
                "is missing required files: " + ", ".join(missing_model_files) + "."
            )

        if not any(candidate.is_file() for candidate in weight_candidates):
            raise TransformerTrainingArtifactError(
                "The exported Transformer model does not contain model weights."
            )

        label_mapping_path = artifacts_directory / "label_mapping.json"

        self._write_json(
            label_mapping_path,
            {
                "labels": (components.datasets.labels),
                "label_to_id": (components.datasets.label_to_id),
                "id_to_label": {
                    str(key): value
                    for key, value in components.datasets.id_to_label.items()
                },
            },
        )

        training_metrics_path = metrics_directory / "training_metrics.json"

        validation_metrics_path = metrics_directory / "validation_metrics.json"

        test_metrics_path = metrics_directory / "test_metrics.json"

        self._write_json(
            training_metrics_path,
            training_result.training_metrics,
        )

        self._write_json(
            validation_metrics_path,
            {
                **evaluation_result.validation.summary_metrics,
                "trainer_metrics": (evaluation_result.validation.trainer_metrics),
                "sample_count": (evaluation_result.validation.sample_count),
            },
        )

        self._write_json(
            test_metrics_path,
            {
                **evaluation_result.test.summary_metrics,
                "trainer_metrics": (evaluation_result.test.trainer_metrics),
                "sample_count": (evaluation_result.test.sample_count),
            },
        )

        configuration = components.configuration

        classification_report_path: Path | None = None

        if bool(
            configuration.get(
                "save_classification_report",
                True,
            )
        ):
            classification_report_path = (
                metrics_directory / "classification_report.json"
            )

            self._write_json(
                classification_report_path,
                {
                    "validation": (evaluation_result.validation.classification_report),
                    "test": (evaluation_result.test.classification_report),
                },
            )

        confusion_matrix_path: Path | None = None

        if bool(
            configuration.get(
                "save_confusion_matrix",
                True,
            )
        ):
            confusion_matrix_path = metrics_directory / "confusion_matrix.json"

            self._write_json(
                confusion_matrix_path,
                {
                    "labels": (evaluation_result.test.confusion_matrix_labels),
                    "validation": (evaluation_result.validation.confusion_matrix),
                    "test": (evaluation_result.test.confusion_matrix),
                },
            )

        validation_predictions_path: Path | None = None

        test_predictions_path: Path | None = None

        if bool(
            configuration.get(
                "save_predictions",
                True,
            )
        ):
            validation_predictions_path = (
                predictions_directory / "validation_predictions.jsonl"
            )

            test_predictions_path = predictions_directory / "test_predictions.jsonl"

            self._write_prediction_jsonl(
                path=validation_predictions_path,
                result=(evaluation_result.validation),
            )

            self._write_prediction_jsonl(
                path=test_predictions_path,
                result=evaluation_result.test,
            )

        trainer_state_path = metrics_directory / "trainer_state.json"

        saved_trainer_state = self._save_trainer_state(
            trainer=components.trainer,
            path=trainer_state_path,
        )

        if not saved_trainer_state:
            trainer_state_path_value = None
        else:
            trainer_state_path_value = str(trainer_state_path)

        execution_result_path = metrics_directory / "execution_result.json"

        model_configuration = self._require_object(
            configuration,
            "model",
        )

        execution_result = {
            "experiment_id": str(experiment.id),
            "status": (ExperimentStatus.COMPLETED.value),
            "dataset_version_id": str(experiment.dataset_version_id),
            "model_version_id": (
                str(experiment.model_version_id)
                if experiment.model_version_id is not None
                else None
            ),
            "model_name": (configuration["model_name"]),
            "model_version": (configuration["model_version"]),
            "model_family": (configuration["model_family"]),
            "task": configuration["task"],
            "pretrained_model_name_or_path": (
                model_configuration["pretrained_model_name_or_path"]
            ),
            "requested_device": (components.requested_device),
            "resolved_device": (components.resolved_device),
            "started_at": (training_result.started_at.isoformat()),
            "completed_at": (training_result.completed_at.isoformat()),
            "duration_seconds": (training_result.duration_seconds),
            "sample_counts": (components.datasets.sample_counts),
            "artifact_path": str(final_model_directory),
            "tokenizer_path": str(final_model_directory),
            "best_checkpoint_path": (training_result.best_checkpoint_path),
            "checkpoint_paths": (training_result.checkpoint_paths),
            "training_log_path": str(components.paths["training_log"]),
            "trainer_state_path": (trainer_state_path_value),
            "training_metrics": (training_result.training_metrics),
            "validation_metrics": (evaluation_result.validation.summary_metrics),
            "test_metrics": (evaluation_result.test.summary_metrics),
            "label_mapping_path": str(label_mapping_path),
            "validation_predictions_path": (
                str(validation_predictions_path)
                if validation_predictions_path is not None
                else None
            ),
            "test_predictions_path": (
                str(test_predictions_path)
                if test_predictions_path is not None
                else None
            ),
            "model_version_registered": False,
        }

        self._write_json(
            execution_result_path,
            execution_result,
        )

        completed_at = datetime.now(timezone.utc)

        self._append_log(
            components.paths["training_log"],
            (
                f"[{completed_at.isoformat()}] "
                "Final Transformer artifacts "
                "were persisted successfully."
            ),
        )

        return TransformerArtifactPersistenceResult(
            artifact_path=str(final_model_directory),
            tokenizer_path=str(final_model_directory),
            trainer_state_path=(trainer_state_path_value),
            execution_result_path=str(execution_result_path),
            label_mapping_path=str(label_mapping_path),
            training_metrics_path=str(training_metrics_path),
            validation_metrics_path=str(validation_metrics_path),
            test_metrics_path=str(test_metrics_path),
            classification_report_path=(
                str(classification_report_path)
                if classification_report_path is not None
                else None
            ),
            confusion_matrix_path=(
                str(confusion_matrix_path)
                if confusion_matrix_path is not None
                else None
            ),
            validation_predictions_path=(
                str(validation_predictions_path)
                if validation_predictions_path is not None
                else None
            ),
            test_predictions_path=(
                str(test_predictions_path)
                if test_predictions_path is not None
                else None
            ),
        )

    async def _mark_execution_completed(
        self,
        *,
        experiment: Experiment,
        components: TransformerExecutionComponents,
        training_result: TransformerTrainingRunResult,
        evaluation_result: TransformerEvaluationResult,
        persistence_result: TransformerArtifactPersistenceResult,
    ) -> dict[str, Any]:
        completed_at = training_result.completed_at

        configuration = components.configuration

        model_configuration = self._require_object(
            configuration,
            "model",
        )

        response = {
            "experiment_id": (experiment.id),
            "status": (ExperimentStatus.COMPLETED.value),
            "dataset_version_id": (experiment.dataset_version_id),
            "model_version_id": (experiment.model_version_id),
            "model_name": (configuration["model_name"]),
            "model_version": (configuration["model_version"]),
            "model_family": (configuration["model_family"]),
            "task": configuration["task"],
            "pretrained_model_name_or_path": (
                model_configuration["pretrained_model_name_or_path"]
            ),
            "tokenizer_path": (persistence_result.tokenizer_path),
            "requested_device": (components.requested_device),
            "resolved_device": (components.resolved_device),
            "started_at": (training_result.started_at),
            "completed_at": completed_at,
            "duration_seconds": (training_result.duration_seconds),
            "artifact_path": (persistence_result.artifact_path),
            "best_checkpoint_path": (training_result.best_checkpoint_path),
            "training_log_path": str(components.paths["training_log"]),
            "trainer_state_path": (persistence_result.trainer_state_path),
            "execution_result_path": (persistence_result.execution_result_path),
            "training_metrics": (training_result.training_metrics),
            "validation_metrics": (evaluation_result.validation.summary_metrics),
            "test_metrics": (evaluation_result.test.summary_metrics),
            "checkpoint_paths": (training_result.checkpoint_paths),
            "model_version_registered": False,
        }

        experiment.status = ExperimentStatus.COMPLETED

        experiment.completed_at = completed_at

        experiment.results = {
            **self._existing_results(experiment),
            "experiment_type": "transformer",
            "training_started": True,
            "training_completed": True,
            "training_failed": False,
            "evaluation_completed": True,
            "artifacts_persisted": True,
            "training_phase_only": False,
            "started_at": (training_result.started_at.isoformat()),
            "completed_at": (completed_at.isoformat()),
            "duration_seconds": (training_result.duration_seconds),
            "error_message": None,
            "requested_device": (components.requested_device),
            "resolved_device": (components.resolved_device),
            "artifact_path": (persistence_result.artifact_path),
            "tokenizer_path": (persistence_result.tokenizer_path),
            "best_checkpoint_path": (training_result.best_checkpoint_path),
            "checkpoint_paths": (training_result.checkpoint_paths),
            "training_metrics": (training_result.training_metrics),
            "validation_metrics": (evaluation_result.validation.summary_metrics),
            "test_metrics": (evaluation_result.test.summary_metrics),
            "trainer_state_path": (persistence_result.trainer_state_path),
            "execution_result_path": (persistence_result.execution_result_path),
            "label_mapping_path": (persistence_result.label_mapping_path),
            "classification_report_path": (
                persistence_result.classification_report_path
            ),
            "confusion_matrix_path": (persistence_result.confusion_matrix_path),
            "validation_predictions_path": (
                persistence_result.validation_predictions_path
            ),
            "test_predictions_path": (persistence_result.test_predictions_path),
            "model_version_registered": False,
        }

        try:
            await self.session.commit()
            await self.session.refresh(experiment)
        except Exception as exc:
            await self.session.rollback()

            raise TransformerTrainingExecutionError(
                "The completed Transformer execution state could not be saved."
            ) from exc

        self._update_metadata(
            metadata_path=components.paths["metadata"],
            updates={
                "status": (ExperimentStatus.COMPLETED.value),
                "started_at": (training_result.started_at.isoformat()),
                "completed_at": (completed_at.isoformat()),
                "duration_seconds": (training_result.duration_seconds),
                "requested_device": (components.requested_device),
                "resolved_device": (components.resolved_device),
                "artifact_path": (persistence_result.artifact_path),
                "tokenizer_path": (persistence_result.tokenizer_path),
                "best_checkpoint_path": (training_result.best_checkpoint_path),
                "training_metrics": (training_result.training_metrics),
                "validation_metrics": (evaluation_result.validation.summary_metrics),
                "test_metrics": (evaluation_result.test.summary_metrics),
                "trainer_state_path": (persistence_result.trainer_state_path),
                "execution_result_path": (persistence_result.execution_result_path),
                "evaluation_completed": True,
                "artifacts_persisted": True,
                "training_phase_only": False,
                "error_message": None,
            },
        )

        completed_log_at = datetime.now(timezone.utc)

        self._append_log(
            components.paths["training_log"],
            (
                f"[{completed_log_at.isoformat()}] "
                "Transformer execution lifecycle "
                "completed successfully."
            ),
        )

        return response

    def _write_prediction_jsonl(
        self,
        *,
        path: Path,
        result: TransformerSplitEvaluationResult,
    ) -> None:
        path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        rows: list[str] = []

        for index in range(result.sample_count):
            row: dict[str, Any] = {
                "row_index": index,
                "label_id": (result.label_ids[index]),
                "label": (result.labels[index]),
                "predicted_id": (result.predicted_ids[index]),
                "predicted_label": (result.predicted_labels[index]),
                "correct": (result.label_ids[index] == result.predicted_ids[index]),
            }

            if result.probabilities is not None:
                row["probabilities"] = result.probabilities[index]

            rows.append(
                json.dumps(
                    row,
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )

        path.write_text(
            "\n".join(rows) + "\n",
            encoding="utf-8",
        )

    def _save_trainer_state(
        self,
        *,
        trainer: Trainer,
        path: Path,
    ) -> bool:
        state = getattr(
            trainer,
            "state",
            None,
        )

        if state is None:
            return False

        save_to_json = getattr(
            state,
            "save_to_json",
            None,
        )

        if callable(save_to_json):
            try:
                path.parent.mkdir(
                    parents=True,
                    exist_ok=True,
                )

                save_to_json(str(path))

                return path.is_file()

            except Exception as exc:
                raise TransformerTrainingArtifactError(
                    "The Transformer trainer state could not be saved."
                ) from exc

        state_dictionary = getattr(
            state,
            "__dict__",
            None,
        )

        if not isinstance(
            state_dictionary,
            dict,
        ):
            return False

        serializable = self._make_json_serializable(state_dictionary)

        self._write_json(
            path,
            serializable,
        )

        return True

    def _make_json_serializable(
        self,
        value: Any,
    ) -> Any:
        if value is None:
            return None

        if isinstance(
            value,
            (
                str,
                int,
                float,
                bool,
            ),
        ):
            return value

        if isinstance(
            value,
            Path,
        ):
            return str(value)

        if isinstance(
            value,
            dict,
        ):
            return {
                str(key): (self._make_json_serializable(item))
                for key, item in value.items()
            }

        if isinstance(
            value,
            (
                list,
                tuple,
                set,
            ),
        ):
            return [self._make_json_serializable(item) for item in value]

        if isinstance(
            value,
            (
                np.integer,
                np.floating,
            ),
        ):
            return value.item()

        if isinstance(
            value,
            np.ndarray,
        ):
            return value.tolist()

        isoformat = getattr(
            value,
            "isoformat",
            None,
        )

        if callable(isoformat):
            try:
                return isoformat()
            except (
                TypeError,
                ValueError,
            ):
                pass

        return str(value)

    async def execute_training_lifecycle(
        self,
        *,
        experiment: Experiment,
        resume_from_checkpoint: str | Path | None = None,
    ) -> dict[str, Any]:
        """Run Transformer model fitting with persistent state transitions.

        This lifecycle currently covers model fitting only. Validation/test
        evaluation, final model export, prediction persistence, and complete
        execution-response construction are added in subsequent phases.
        """

        components = await run_in_threadpool(
            self.assemble, experiment=experiment,
        )

        started_at = datetime.now(timezone.utc)

        await self._mark_experiment_running(
            experiment=experiment,
            components=components,
            started_at=started_at,
        )

        try:
            training_result = await run_in_threadpool(
                self.run_training,
                components=components,
                resume_from_checkpoint=(resume_from_checkpoint),
            )

            return await self._mark_training_completed(
                experiment=experiment,
                components=components,
                training_result=training_result,
            )

        except Exception as exc:
            await self._mark_training_failed(
                experiment=experiment,
                components=components,
                started_at=started_at,
                error=exc,
            )

            if isinstance(
                exc,
                TransformerTrainingExecutionError,
            ):
                raise

            raise TransformerTrainingExecutionError(
                f"Transformer training lifecycle failed: {str(exc)[:4000]}"
            ) from exc

    async def _mark_experiment_running(
        self,
        *,
        experiment: Experiment,
        components: TransformerExecutionComponents,
        started_at: datetime,
    ) -> None:
        experiment.status = ExperimentStatus.RUNNING

        experiment.started_at = started_at
        experiment.completed_at = None

        experiment.results = {
            **self._existing_results(experiment),
            "experiment_type": "transformer",
            "training_started": True,
            "training_completed": False,
            "training_failed": False,
            "started_at": (started_at.isoformat()),
            "completed_at": None,
            "duration_seconds": None,
            "error_message": None,
            "requested_device": (components.requested_device),
            "resolved_device": (components.resolved_device),
            "training_log_path": str(components.paths["training_log"]),
            "model_version_registered": False,
        }

        try:
            await self.session.commit()
            await self.session.refresh(experiment)
        except Exception as exc:
            await self.session.rollback()

            raise TransformerTrainingExecutionError(
                "The experiment could not be marked as running."
            ) from exc

        self._update_metadata(
            metadata_path=components.paths["metadata"],
            updates={
                "status": (ExperimentStatus.RUNNING.value),
                "started_at": (started_at.isoformat()),
                "completed_at": None,
                "duration_seconds": None,
                "requested_device": (components.requested_device),
                "resolved_device": (components.resolved_device),
                "error_message": None,
            },
        )

        self._append_log(
            components.paths["training_log"],
            (f"[{started_at.isoformat()}] Experiment state changed to running."),
        )

    async def _mark_training_completed(
        self,
        *,
        experiment: Experiment,
        components: TransformerExecutionComponents,
        training_result: TransformerTrainingRunResult,
    ) -> dict[str, Any]:
        completed_at = training_result.completed_at

        lifecycle_result = {
            "experiment_id": str(experiment.id),
            "status": (ExperimentStatus.COMPLETED.value),
            "dataset_version_id": str(experiment.dataset_version_id),
            "model_version_id": (
                str(experiment.model_version_id)
                if experiment.model_version_id is not None
                else None
            ),
            "requested_device": (components.requested_device),
            "resolved_device": (components.resolved_device),
            "started_at": (training_result.started_at.isoformat()),
            "completed_at": (completed_at.isoformat()),
            "duration_seconds": (training_result.duration_seconds),
            "resumed_from_checkpoint": (training_result.resumed_from_checkpoint),
            "best_checkpoint_path": (training_result.best_checkpoint_path),
            "checkpoint_paths": (training_result.checkpoint_paths),
            "training_metrics": (training_result.training_metrics),
            "training_phase_only": True,
            "model_version_registered": False,
        }

        lifecycle_result_path = (
            components.paths["metrics"] / "training_lifecycle_result.json"
        )

        self._write_json(
            lifecycle_result_path,
            lifecycle_result,
        )

        experiment.status = ExperimentStatus.COMPLETED

        experiment.completed_at = completed_at

        experiment.results = {
            **self._existing_results(experiment),
            "experiment_type": "transformer",
            "training_started": True,
            "training_completed": True,
            "training_failed": False,
            "started_at": (training_result.started_at.isoformat()),
            "completed_at": (completed_at.isoformat()),
            "duration_seconds": (training_result.duration_seconds),
            "error_message": None,
            "requested_device": (components.requested_device),
            "resolved_device": (components.resolved_device),
            "resumed_from_checkpoint": (training_result.resumed_from_checkpoint),
            "best_checkpoint_path": (training_result.best_checkpoint_path),
            "checkpoint_paths": (training_result.checkpoint_paths),
            "training_metrics": (training_result.training_metrics),
            "training_lifecycle_result_path": str(lifecycle_result_path),
            "training_phase_only": True,
            "model_version_registered": False,
        }

        try:
            await self.session.commit()
            await self.session.refresh(experiment)
        except Exception as exc:
            await self.session.rollback()

            raise TransformerTrainingExecutionError(
                "The completed Transformer training state could not be saved."
            ) from exc

        self._update_metadata(
            metadata_path=components.paths["metadata"],
            updates={
                "status": (ExperimentStatus.COMPLETED.value),
                "started_at": (training_result.started_at.isoformat()),
                "completed_at": (completed_at.isoformat()),
                "duration_seconds": (training_result.duration_seconds),
                "requested_device": (components.requested_device),
                "resolved_device": (components.resolved_device),
                "resumed_from_checkpoint": (training_result.resumed_from_checkpoint),
                "best_checkpoint_path": (training_result.best_checkpoint_path),
                "checkpoint_paths": (training_result.checkpoint_paths),
                "training_metrics": (training_result.training_metrics),
                "training_phase_only": True,
                "error_message": None,
            },
        )

        self._append_log(
            components.paths["training_log"],
            (
                f"[{completed_at.isoformat()}] "
                "Experiment state changed to completed "
                "after Transformer model fitting."
            ),
        )

        return lifecycle_result

    async def _mark_training_failed(
        self,
        *,
        experiment: Experiment,
        components: TransformerExecutionComponents,
        started_at: datetime,
        error: Exception,
    ) -> None:
        completed_at = datetime.now(timezone.utc)

        duration_seconds = max(
            0.0,
            (completed_at - started_at).total_seconds(),
        )

        error_message = str(error)[:4000]

        failure_trace = traceback.format_exc()

        self._append_log(
            components.paths["training_log"],
            (
                f"[{completed_at.isoformat()}] "
                "Transformer training lifecycle failed: "
                f"{error_message}\n"
                f"{failure_trace}"
            ),
        )

        experiment.status = ExperimentStatus.FAILED

        experiment.completed_at = completed_at

        experiment.results = {
            **self._existing_results(experiment),
            "experiment_type": "transformer",
            "training_started": True,
            "training_completed": False,
            "training_failed": True,
            "started_at": (
                experiment.started_at.isoformat()
                if experiment.started_at is not None
                else started_at.isoformat()
            ),
            "completed_at": (completed_at.isoformat()),
            "duration_seconds": round(
                duration_seconds,
                6,
            ),
            "error_message": error_message,
            "requested_device": (components.requested_device),
            "resolved_device": (components.resolved_device),
            "model_version_registered": False,
        }

        try:
            await self.session.commit()
            await self.session.refresh(experiment)
        except Exception:  # noqa: BLE001
            await self.session.rollback()

        self._update_metadata(
            metadata_path=components.paths["metadata"],
            updates={
                "status": (ExperimentStatus.FAILED.value),
                "completed_at": (completed_at.isoformat()),
                "duration_seconds": round(
                    duration_seconds,
                    6,
                ),
                "requested_device": (components.requested_device),
                "resolved_device": (components.resolved_device),
                "error_message": error_message,
            },
        )

    def _update_metadata(
        self,
        *,
        metadata_path: Path,
        updates: dict[str, Any],
    ) -> None:
        metadata: dict[str, Any] = {}

        if metadata_path.is_file():
            try:
                loaded = json.loads(metadata_path.read_text(encoding="utf-8"))
            except (
                OSError,
                json.JSONDecodeError,
            ) as exc:
                raise (
                    TransformerTrainingArtifactError(
                        "The Transformer metadata file could not be read."
                    )
                ) from exc

            if not isinstance(
                loaded,
                dict,
            ):
                raise (
                    TransformerTrainingArtifactError(
                        "The Transformer metadata must be a JSON object."
                    )
                )

            metadata = loaded

        metadata.update(updates)

        self._write_json(
            metadata_path,
            metadata,
        )

    def _write_json(
        self,
        path: Path,
        content: dict[str, Any],
    ) -> None:
        path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

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

    def evaluate_and_generate_predictions(
        self,
        *,
        components: TransformerExecutionComponents,
    ) -> TransformerEvaluationResult:
        """Evaluate validation and test splits after model fitting."""

        configuration = components.configuration

        save_probabilities = bool(
            configuration.get(
                "save_probabilities",
                True,
            )
        )

        validation = self._evaluate_split(
            split_name="validation",
            trainer=components.trainer,
            dataset=components.datasets.validation,
            id_to_label=(components.datasets.id_to_label),
            save_probabilities=save_probabilities,
            training_log_path=components.paths["training_log"],
        )

        test = self._evaluate_split(
            split_name="test",
            trainer=components.trainer,
            dataset=components.datasets.test,
            id_to_label=(components.datasets.id_to_label),
            save_probabilities=save_probabilities,
            training_log_path=components.paths["training_log"],
        )

        from app.domain.services.evaluation_research import save_evidence
        if components.datasets.evidence_texts is not None:
            for result in (validation, test):
                save_evidence(components.paths["workspace"], result.split,
                              components.datasets.evidence_texts[result.split], result.labels,
                              result.predicted_labels,
                              [components.datasets.id_to_label[i] for i in sorted(components.datasets.id_to_label)],
                              result.probabilities, configuration, sources=(components.datasets.evidence_sources or {}).get(result.split))

        return TransformerEvaluationResult(
            validation=validation,
            test=test,
        )

    def _evaluate_split(
        self,
        *,
        split_name: str,
        trainer: Trainer,
        dataset: Dataset,
        id_to_label: dict[int, str],
        save_probabilities: bool,
        training_log_path: Path,
    ) -> TransformerSplitEvaluationResult:
        started_at = datetime.now(timezone.utc)

        self._append_log(
            training_log_path,
            (
                f"[{started_at.isoformat()}] "
                f"Starting {split_name} evaluation. "
                f"samples={len(dataset)}."
            ),
        )

        try:
            prediction_output = trainer.predict(
                dataset,
                metric_key_prefix=split_name,
            )
        except Exception as exc:
            failed_at = datetime.now(timezone.utc)

            self._append_log(
                training_log_path,
                (
                    f"[{failed_at.isoformat()}] "
                    f"{split_name.capitalize()} "
                    "evaluation failed: "
                    f"{str(exc)[:4000]}"
                ),
            )

            raise TransformerTrainingExecutionError(
                f"Transformer {split_name} evaluation failed: {str(exc)[:4000]}"
            ) from exc

        logits = self._extract_logits(
            getattr(
                prediction_output,
                "predictions",
                None,
            )
        )

        label_ids = self._extract_label_ids(
            getattr(
                prediction_output,
                "label_ids",
                None,
            )
        )

        if logits.shape[0] != label_ids.shape[0]:
            raise TransformerTrainingExecutionError(
                f"The {split_name} prediction and label counts do not match."
            )

        if logits.shape[0] != len(dataset):
            raise TransformerTrainingExecutionError(
                f"The {split_name} prediction count does not match the dataset."
            )

        probabilities_array = self._softmax(logits)

        predicted_ids_array = np.argmax(
            probabilities_array,
            axis=-1,
        ).astype(np.int64)

        self._validate_prediction_label_ids(
            split_name=split_name,
            label_ids=label_ids,
            predicted_ids=predicted_ids_array,
            id_to_label=id_to_label,
        )

        detailed = self.build_detailed_metrics(
            label_ids=label_ids,
            predicted_ids=predicted_ids_array,
            id_to_label=id_to_label,
        )

        summary_metrics = {
            key: float(detailed[key])
            for key in (
                "accuracy",
                "macro_precision",
                "macro_recall",
                "macro_f1",
                "weighted_f1",
            )
        }

        trainer_metrics = self._normalize_numeric_metrics(
            getattr(
                prediction_output,
                "metrics",
                {},
            )
        )

        label_id_values = [int(value) for value in label_ids.tolist()]

        predicted_id_values = [int(value) for value in predicted_ids_array.tolist()]

        actual_labels = [id_to_label[value] for value in label_id_values]

        predicted_labels = [id_to_label[value] for value in predicted_id_values]

        completed_at = datetime.now(timezone.utc)

        self._append_log(
            training_log_path,
            (
                f"[{completed_at.isoformat()}] "
                f"{split_name.capitalize()} "
                "evaluation completed. "
                f"macro_f1="
                f"{summary_metrics['macro_f1']:.6f}, "
                f"accuracy="
                f"{summary_metrics['accuracy']:.6f}."
            ),
        )

        return TransformerSplitEvaluationResult(
            split=split_name,
            sample_count=len(label_id_values),
            label_ids=label_id_values,
            predicted_ids=(predicted_id_values),
            labels=actual_labels,
            predicted_labels=(predicted_labels),
            probabilities=(
                probabilities_array.astype(float).tolist()
                if save_probabilities
                else None
            ),
            trainer_metrics=trainer_metrics,
            summary_metrics=summary_metrics,
            classification_report=(detailed["classification_report"]),
            confusion_matrix_labels=(detailed["confusion_matrix_labels"]),
            confusion_matrix=(detailed["confusion_matrix"]),
        )

    def _extract_logits(
        self,
        predictions: object,
    ) -> np.ndarray:
        value = predictions

        if isinstance(
            value,
            tuple,
        ):
            if not value:
                raise TransformerTrainingExecutionError(
                    "Transformer prediction output contains no logits."
                )

            value = value[0]

        try:
            logits = np.asarray(
                value,
                dtype=np.float64,
            )
        except Exception as exc:
            raise TransformerTrainingExecutionError(
                "Transformer prediction logits could not be converted to an array."
            ) from exc

        if logits.ndim != 2:
            raise TransformerTrainingExecutionError(
                "Transformer prediction logits must be a two-dimensional array."
            )

        if logits.shape[0] == 0:
            raise TransformerTrainingExecutionError(
                "Transformer prediction output contains no rows."
            )

        if logits.shape[1] < 2:
            raise TransformerTrainingExecutionError(
                "Transformer prediction output must contain at least two labels."
            )

        if not np.isfinite(logits).all():
            raise TransformerTrainingExecutionError(
                "Transformer prediction logits contain non-finite values."
            )

        return logits

    def _extract_label_ids(
        self,
        label_ids: object,
    ) -> np.ndarray:
        try:
            values = np.asarray(
                label_ids,
            )
        except Exception as exc:
            raise TransformerTrainingExecutionError(
                "Transformer evaluation labels could not be converted to an array."
            ) from exc

        if values.ndim != 1:
            values = values.reshape(-1)

        if values.size == 0:
            raise TransformerTrainingExecutionError(
                "Transformer evaluation contains no labels."
            )

        try:
            values = values.astype(np.int64)
        except (
            TypeError,
            ValueError,
        ) as exc:
            raise TransformerTrainingExecutionError(
                "Transformer evaluation labels must be integer identifiers."
            ) from exc

        return values

    def _softmax(
        self,
        logits: np.ndarray,
    ) -> np.ndarray:
        shifted = logits - np.max(
            logits,
            axis=-1,
            keepdims=True,
        )

        exponentials = np.exp(shifted)

        denominators = np.sum(
            exponentials,
            axis=-1,
            keepdims=True,
        )

        if np.any(denominators <= 0):
            raise TransformerTrainingExecutionError(
                "Transformer probabilities could not be normalized."
            )

        probabilities = exponentials / denominators

        if not np.isfinite(probabilities).all():
            raise TransformerTrainingExecutionError(
                "Transformer probabilities contain non-finite values."
            )

        return probabilities

    def _validate_prediction_label_ids(
        self,
        *,
        split_name: str,
        label_ids: np.ndarray,
        predicted_ids: np.ndarray,
        id_to_label: dict[int, str],
    ) -> None:
        valid_ids = set(id_to_label)

        actual_ids = {int(value) for value in label_ids.tolist()}

        predicted_values = {int(value) for value in predicted_ids.tolist()}

        invalid_actual = sorted(actual_ids - valid_ids)

        invalid_predicted = sorted(predicted_values - valid_ids)

        if invalid_actual:
            raise TransformerTrainingExecutionError(
                f"The {split_name} split "
                "contains unknown label IDs: "
                + ", ".join(str(value) for value in invalid_actual)
                + "."
            )

        if invalid_predicted:
            raise TransformerTrainingExecutionError(
                f"The {split_name} predictions "
                "contain unknown label IDs: "
                + ", ".join(str(value) for value in invalid_predicted)
                + "."
            )

    def run_training(
        self,
        *,
        components: TransformerExecutionComponents,
        resume_from_checkpoint: str | Path | None = None,
    ) -> TransformerTrainingRunResult:
        """Execute the Hugging Face training loop.

        This method performs model fitting only. Experiment finalization,
        evaluation, artifact persistence, and model registration are handled
        by later lifecycle phases.
        """

        resolved_checkpoint = self._resolve_resume_checkpoint(
            resume_from_checkpoint=resume_from_checkpoint,
            checkpoints_directory=components.paths["checkpoints"],
        )

        started_at = datetime.now(timezone.utc)
        start_counter = perf_counter()

        self._append_log(
            components.paths["training_log"],
            (
                f"[{started_at.isoformat()}] "
                "Starting Transformer training. "
                f"device={components.resolved_device}, "
                f"train_samples="
                f"{components.datasets.sample_counts['train']}, "
                f"validation_samples="
                f"{components.datasets.sample_counts['validation']}, "
                f"test_samples="
                f"{components.datasets.sample_counts['test']}."
            ),
        )

        if resolved_checkpoint is not None:
            self._append_log(
                components.paths["training_log"],
                (
                    f"[{started_at.isoformat()}] "
                    "Resuming from checkpoint: "
                    f"{resolved_checkpoint}."
                ),
            )

        try:
            training_output = components.trainer.train(
                resume_from_checkpoint=(
                    resolved_checkpoint if resolved_checkpoint is not None else None
                ),
            )

        except Exception as exc:
            failed_at = datetime.now(timezone.utc)

            self._append_log(
                components.paths["training_log"],
                (
                    f"[{failed_at.isoformat()}] "
                    "Transformer model fitting failed: "
                    f"{str(exc)[:4000]}"
                ),
            )

            raise TransformerTrainingExecutionError(
                f"Transformer model fitting failed: {str(exc)[:4000]}"
            ) from exc

        completed_at = datetime.now(timezone.utc)

        duration_seconds = round(
            perf_counter() - start_counter,
            6,
        )

        training_metrics = self._normalize_numeric_metrics(
            getattr(
                training_output,
                "metrics",
                {},
            )
        )

        training_metrics.setdefault(
            "training_runtime_seconds",
            duration_seconds,
        )

        checkpoint_paths = self._list_checkpoint_paths(components.paths["checkpoints"])

        best_checkpoint_path = self._resolve_best_checkpoint(
            trainer=components.trainer,
            checkpoints=checkpoint_paths,
        )

        self._append_log(
            components.paths["training_log"],
            (
                f"[{completed_at.isoformat()}] "
                "Transformer model fitting completed. "
                f"duration_seconds={duration_seconds}, "
                f"checkpoints={len(checkpoint_paths)}."
            ),
        )

        return TransformerTrainingRunResult(
            started_at=started_at,
            completed_at=completed_at,
            duration_seconds=duration_seconds,
            resumed_from_checkpoint=(
                str(resolved_checkpoint) if resolved_checkpoint is not None else None
            ),
            best_checkpoint_path=best_checkpoint_path,
            checkpoint_paths=checkpoint_paths,
            training_metrics=training_metrics,
        )

    def _resolve_resume_checkpoint(
        self,
        *,
        resume_from_checkpoint: str | Path | None,
        checkpoints_directory: Path,
    ) -> str | None:
        if resume_from_checkpoint is None:
            return None

        checkpoint_value = str(resume_from_checkpoint).strip()

        if not checkpoint_value:
            return None

        checkpoint_path = self._resolve_allowed_path(Path(checkpoint_value))

        checkpoints_root = checkpoints_directory.resolve()

        try:
            checkpoint_path.relative_to(checkpoints_root)
        except ValueError as exc:
            raise TransformerTrainingArtifactError(
                "The requested resume checkpoint "
                "is outside this experiment's "
                "checkpoint directory."
            ) from exc

        if not checkpoint_path.is_dir():
            raise TransformerTrainingArtifactError(
                "The requested Transformer checkpoint directory was not found."
            )

        trainer_state_path = checkpoint_path / "trainer_state.json"

        if not trainer_state_path.is_file():
            raise TransformerTrainingArtifactError(
                "The requested checkpoint does not contain trainer_state.json."
            )

        return str(checkpoint_path)

    def _list_checkpoint_paths(
        self,
        checkpoints_directory: Path,
    ) -> list[str]:
        if not checkpoints_directory.is_dir():
            return []

        candidates: list[tuple[int, Path]] = []

        for path in checkpoints_directory.iterdir():
            if not path.is_dir():
                continue

            if not path.name.startswith("checkpoint-"):
                continue

            suffix = path.name.removeprefix("checkpoint-")

            try:
                step = int(suffix)
            except ValueError:
                continue

            candidates.append(
                (
                    step,
                    path.resolve(),
                )
            )

        candidates.sort(key=lambda item: item[0])

        return [str(path) for _, path in candidates]

    def _resolve_best_checkpoint(
        self,
        *,
        trainer: Trainer,
        checkpoints: list[str],
    ) -> str | None:
        trainer_state = getattr(
            trainer,
            "state",
            None,
        )

        best_checkpoint = getattr(
            trainer_state,
            "best_model_checkpoint",
            None,
        )

        if (
            isinstance(
                best_checkpoint,
                str,
            )
            and best_checkpoint.strip()
        ):
            resolved = self._resolve_allowed_path(Path(best_checkpoint))

            if resolved.is_dir():
                return str(resolved)

        if checkpoints:
            return checkpoints[-1]

        return None

    def _normalize_numeric_metrics(
        self,
        metrics: object,
    ) -> dict[str, float]:
        if not isinstance(
            metrics,
            dict,
        ):
            return {}

        normalized: dict[str, float] = {}

        for key, value in metrics.items():
            if isinstance(
                value,
                bool,
            ):
                continue

            if isinstance(
                value,
                (int, float, np.integer, np.floating),
            ):
                numeric_value = float(value)

                if np.isfinite(numeric_value):
                    normalized[str(key)] = numeric_value

        return normalized

    def _append_log(
        self,
        path: Path,
        message: str,
    ) -> None:
        path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        with path.open(
            "a",
            encoding="utf-8",
        ) as handle:
            handle.write(message.rstrip() + "\n")

    def _validate_initial_state(
        self,
        experiment: Experiment,
    ) -> None:
        if experiment.status != ExperimentStatus.PLANNED:
            status_value = (
                experiment.status.value
                if hasattr(
                    experiment.status,
                    "value",
                )
                else str(experiment.status).lower()
            )

            raise TransformerExperimentStateError(
                "Only planned experiments may start "
                "Transformer training. "
                f"Current status: {status_value}."
            )

        if experiment.model_version_id is not None:
            raise TransformerExperimentStateError(
                "This experiment already has a registered model version."
            )

        if not isinstance(
            experiment.configuration,
            dict,
        ):
            raise (
                TransformerExperimentConfigurationError(
                    "The experiment does not contain a valid Transformer configuration."
                )
            )

    def _load_configuration(
        self,
        experiment: Experiment,
    ) -> dict[str, Any]:
        results = self._existing_results(
            experiment,
        )

        configured_path = results.get(
            "configuration_path",
        )

        if (
            not isinstance(
                configured_path,
                str,
            )
            or not configured_path.strip()
        ):
            raise (
                TransformerExperimentConfigurationError(
                    "The Transformer configuration file path is missing."
                )
            )

        configuration_path = self._resolve_allowed_path(
            Path(configured_path),
        )

        if not configuration_path.is_file():
            raise TransformerTrainingArtifactError(
                "The Transformer configuration file was not found."
            )

        try:
            configuration = json.loads(
                configuration_path.read_text(
                    encoding="utf-8",
                )
            )
        except (
            OSError,
            json.JSONDecodeError,
        ) as exc:
            raise (
                TransformerExperimentConfigurationError(
                    "The Transformer configuration file could not be read."
                )
            ) from exc

        if not isinstance(
            configuration,
            dict,
        ):
            raise (
                TransformerExperimentConfigurationError(
                    "The Transformer configuration must be a JSON object."
                )
            )

        required_keys = {
            "experiment_id",
            "dataset",
            "output",
            "model",
            "optimization",
            "evaluation",
            "runtime",
            "model_family",
            "model_name",
            "model_version",
            "task",
        }

        missing_keys = sorted(required_keys - set(configuration))

        if missing_keys:
            raise (
                TransformerExperimentConfigurationError(
                    "The Transformer configuration "
                    "is missing required keys: " + ", ".join(missing_keys) + "."
                )
            )

        if str(configuration["experiment_id"]) != str(experiment.id):
            raise (
                TransformerExperimentConfigurationError(
                    "The saved configuration belongs to another experiment."
                )
            )

        if configuration.get("model_family") != self.supported_model_family:
            raise (
                TransformerExperimentConfigurationError(
                    "Only "
                    "banglabert_sequence_classification "
                    "experiments are supported by "
                    "this executor."
                )
            )

        return configuration

    def _resolve_execution_paths(
        self,
        *,
        experiment: Experiment,
        configuration: dict[str, Any],
    ) -> dict[str, Path]:
        output = self._require_object(
            configuration,
            "output",
        )

        required_output_keys = {
            "workspace",
            "logs",
            "artifacts",
            "metrics",
            "checkpoints",
            "predictions",
        }

        missing_output_keys = sorted(required_output_keys - set(output))

        if missing_output_keys:
            raise (
                TransformerExperimentConfigurationError(
                    "The Transformer output "
                    "configuration is missing keys: "
                    + ", ".join(missing_output_keys)
                    + "."
                )
            )

        workspace = self._resolve_allowed_path(Path(str(output["workspace"])))

        expected_workspace = (
            self._experiment_storage_root() / str(experiment.id)
        ).resolve()

        if workspace != expected_workspace:
            raise (
                TransformerExperimentConfigurationError(
                    "The configured workspace does not match the experiment."
                )
            )

        logs = self._resolve_allowed_path(Path(str(output["logs"])))

        artifacts = self._resolve_allowed_path(Path(str(output["artifacts"])))

        metrics = self._resolve_allowed_path(Path(str(output["metrics"])))

        checkpoints = self._resolve_allowed_path(Path(str(output["checkpoints"])))

        predictions = self._resolve_allowed_path(Path(str(output["predictions"])))

        configuration_path = self._resolve_allowed_path(
            workspace / "configuration.json"
        )

        metadata_path = self._resolve_allowed_path(workspace / "metadata.json")

        for directory in (
            workspace,
            logs,
            artifacts,
            metrics,
            checkpoints,
            predictions,
        ):
            directory.mkdir(
                parents=True,
                exist_ok=True,
            )

        return {
            "workspace": workspace,
            "configuration": (configuration_path),
            "metadata": metadata_path,
            "logs": logs,
            "artifacts": artifacts,
            "metrics": metrics,
            "checkpoints": checkpoints,
            "predictions": predictions,
            "training_log": (logs / "training.log"),
        }

    def _resolve_device(
        self,
        configuration: dict[str, Any],
    ) -> tuple[str, str]:
        runtime = self._require_object(
            configuration,
            "runtime",
        )

        requested = str(
            runtime.get(
                "device_preference",
                "auto",
            )
        ).lower()

        supported = {
            "auto",
            "cuda",
            "mps",
            "cpu",
        }

        if requested not in supported:
            raise TransformerDeviceError(
                f"Unsupported Transformer device preference: {requested}."
            )

        cuda_available = torch.cuda.is_available()

        mps_backend = getattr(
            torch.backends,
            "mps",
            None,
        )

        mps_available = bool(mps_backend and mps_backend.is_available())

        if requested == "auto":
            if cuda_available:
                resolved = "cuda"
            elif mps_available:
                resolved = "mps"
            else:
                resolved = "cpu"

        elif requested == "cuda":
            if not cuda_available:
                raise TransformerDeviceError("CUDA was requested but is not available.")

            resolved = "cuda"

        elif requested == "mps":
            if not mps_available:
                raise TransformerDeviceError(
                    "Apple MPS was requested but is not available."
                )

            resolved = "mps"

        else:
            resolved = "cpu"

        fp16 = bool(
            runtime.get(
                "fp16",
                False,
            )
        )

        bf16 = bool(
            runtime.get(
                "bf16",
                False,
            )
        )

        if resolved != "cuda" and (fp16 or bf16):
            raise TransformerDeviceError(
                "The current Trainer configuration "
                "allows fp16 or bf16 only when "
                "CUDA is selected."
            )

        return requested, resolved

    def _load_dataset_splits(
        self,
        configuration: dict[str, Any],
    ) -> TransformerDatasetSplits:
        dataset_configuration = self._require_object(
            configuration,
            "dataset",
        )

        artifact_paths = self._require_object(
            dataset_configuration,
            "artifact_paths",
        )

        dataframes: dict[
            str,
            pd.DataFrame,
        ] = {}

        for split_name in (
            "train",
            "validation",
            "test",
        ):
            stored_path = artifact_paths.get(split_name)

            if (
                not isinstance(
                    stored_path,
                    str,
                )
                or not stored_path.strip()
            ):
                raise (
                    TransformerTrainingArtifactError(
                        f"The {split_name} dataset path is missing."
                    )
                )

            file_path = self._resolve_allowed_path(Path(stored_path))

            if not file_path.is_file():
                raise (
                    TransformerTrainingArtifactError(
                        f"The {split_name} dataset file was not found."
                    )
                )

            try:
                dataframe = pd.read_csv(
                    file_path,
                    encoding="utf-8",
                )
            except Exception as exc:
                raise (
                    TransformerTrainingArtifactError(
                        f"The {split_name} dataset file could not be read."
                    )
                ) from exc

            required_columns = {
                "text",
                "label",
            }

            if not required_columns.issubset(dataframe.columns):
                raise (
                    TransformerDatasetPreparationError(
                        f"The {split_name} split must contain text and label columns."
                    )
                )

            dataframe = dataframe[["text", "label"] + (["source"] if "source" in dataframe.columns else [])].copy()

            dataframe["text"] = (
                dataframe["text"].astype("string").fillna("").str.strip()
            )

            dataframe["label"] = (
                dataframe["label"].astype("string").fillna("").str.strip()
            )

            dataframe = dataframe[
                (dataframe["text"] != "") & (dataframe["label"] != "")
            ].reset_index(drop=True)

            if dataframe.empty:
                raise (
                    TransformerDatasetPreparationError(
                        f"The {split_name} split contains no valid rows."
                    )
                )

            dataframes[split_name] = dataframe

        configured_labels = dataset_configuration.get(
            "labels",
        )

        training_labels = set(dataframes["train"]["label"].unique().tolist())

        if len(training_labels) < 2:
            raise (
                TransformerDatasetPreparationError(
                    "The training split must contain at least two labels."
                )
            )

        labels: list[str]

        if (
            isinstance(
                configured_labels,
                list,
            )
            and configured_labels
        ):
            labels = [str(label) for label in configured_labels]

            if set(labels) != training_labels:
                raise (
                    TransformerDatasetPreparationError(
                        "The configured labels do not match the training split labels."
                    )
                )
        else:
            labels = sorted(training_labels)

        label_to_id = {label: index for index, label in enumerate(labels)}

        id_to_label = {index: label for label, index in label_to_id.items()}

        datasets: dict[str, Dataset] = {}

        for split_name, dataframe in dataframes.items():
            unknown_labels = sorted(set(dataframe["label"].unique()) - training_labels)

            if unknown_labels:
                raise (
                    TransformerDatasetPreparationError(
                        f"The {split_name} split "
                        "contains labels absent "
                        "from training: " + ", ".join(unknown_labels) + "."
                    )
                )

            prepared = dataframe.copy()

            prepared["labels"] = prepared["label"].map(label_to_id)

            if prepared["labels"].isna().any():
                raise (
                    TransformerDatasetPreparationError(
                        f"The {split_name} split contains unmapped labels."
                    )
                )

            prepared["labels"] = prepared["labels"].astype("int64")

            prepared = prepared[
                [
                    "text",
                    "labels",
                ]
            ]

            datasets[split_name] = Dataset.from_pandas(
                prepared,
                preserve_index=False,
            )

        return TransformerDatasetSplits(
            evidence_sources={name: frame["source"].fillna("Unknown").astype(str).tolist() for name, frame in dataframes.items() if "source" in frame.columns},
            evidence_texts={name: frame["text"].tolist() for name, frame in dataframes.items()},
            train=datasets["train"],
            validation=(datasets["validation"]),
            test=datasets["test"],
            labels=labels,
            label_to_id=label_to_id,
            id_to_label=id_to_label,
            sample_counts={
                split_name: len(dataset) for split_name, dataset in datasets.items()
            },
        )

    def _load_tokenizer(
        self,
        configuration: dict[str, Any],
    ) -> PreTrainedTokenizerBase:
        model_configuration = self._require_object(
            configuration,
            "model",
        )

        pretrained_model = self._require_string(
            model_configuration,
            "pretrained_model_name_or_path",
        )

        tokenizer_name_value = model_configuration.get("tokenizer_name_or_path")

        tokenizer_name = (
            tokenizer_name_value.strip()
            if isinstance(
                tokenizer_name_value,
                str,
            )
            and tokenizer_name_value.strip()
            else pretrained_model
        )

        try:
            tokenizer = AutoTokenizer.from_pretrained(
                tokenizer_name,
                use_fast=bool(
                    model_configuration.get(
                        "use_fast_tokenizer",
                        True,
                    )
                ),
                trust_remote_code=bool(
                    model_configuration.get(
                        "trust_remote_code",
                        False,
                    )
                ),
            )
        except Exception as exc:
            raise (
                TransformerModelLoadingError(
                    "The Transformer tokenizer "
                    f"could not be loaded from "
                    f"{tokenizer_name!r}."
                )
            ) from exc

        return tokenizer

    def _load_model(
        self,
        *,
        configuration: dict[str, Any],
        datasets: TransformerDatasetSplits,
    ) -> PreTrainedModel:
        model_configuration = self._require_object(
            configuration,
            "model",
        )

        pretrained_model = self._require_string(
            model_configuration,
            "pretrained_model_name_or_path",
        )

        try:
            model = AutoModelForSequenceClassification.from_pretrained(
                pretrained_model,
                num_labels=len(datasets.labels),
                label2id=(datasets.label_to_id),
                id2label=(datasets.id_to_label),
                trust_remote_code=bool(
                    model_configuration.get(
                        "trust_remote_code",
                        False,
                    )
                ),
                ignore_mismatched_sizes=True,
            )
        except Exception as exc:
            raise (
                TransformerModelLoadingError(
                    "The pretrained Transformer "
                    f"model could not be loaded "
                    f"from {pretrained_model!r}."
                )
            ) from exc

        return model

    def _tokenize_datasets(
        self,
        *,
        datasets: TransformerDatasetSplits,
        tokenizer: PreTrainedTokenizerBase,
        configuration: dict[str, Any],
    ) -> TransformerDatasetSplits:
        model_configuration = self._require_object(
            configuration,
            "model",
        )

        max_length = int(
            model_configuration.get(
                "max_sequence_length",
                256,
            )
        )

        if not 16 <= max_length <= 512:
            raise (
                TransformerDatasetPreparationError(
                    "max_sequence_length must be between 16 and 512."
                )
            )

        def tokenize_batch(
            batch: dict[str, list[Any]],
        ) -> dict[str, Any]:
            return tokenizer(
                batch["text"],
                truncation=True,
                max_length=max_length,
                padding=False,
            )

        try:
            train = datasets.train.map(
                tokenize_batch,
                batched=True,
                remove_columns=["text"],
                desc="Tokenizing training split",
            )

            validation = datasets.validation.map(
                tokenize_batch,
                batched=True,
                remove_columns=["text"],
                desc=("Tokenizing validation split"),
            )

            test = datasets.test.map(
                tokenize_batch,
                batched=True,
                remove_columns=["text"],
                desc="Tokenizing test split",
            )
        except Exception as exc:
            raise (
                TransformerDatasetPreparationError("Transformer tokenization failed.")
            ) from exc

        return TransformerDatasetSplits(
            train=train,
            validation=validation,
            test=test,
            labels=datasets.labels,
            label_to_id=(datasets.label_to_id),
            id_to_label=(datasets.id_to_label),
            sample_counts=(datasets.sample_counts),
            evidence_texts=datasets.evidence_texts,
            evidence_sources=datasets.evidence_sources,
        )

    def _create_training_arguments(
        self,
        *,
        configuration: dict[str, Any],
        paths: dict[str, Path],
        resolved_device: str,
    ) -> TrainingArguments:
        optimization = self._require_object(
            configuration,
            "optimization",
        )

        evaluation = self._require_object(
            configuration,
            "evaluation",
        )

        runtime = self._require_object(
            configuration,
            "runtime",
        )

        eval_strategy = str(
            evaluation.get(
                "evaluation_strategy",
                "epoch",
            )
        )

        save_strategy = str(
            evaluation.get(
                "save_strategy",
                "epoch",
            )
        )

        arguments: dict[str, Any] = {
            "output_dir": str(paths["checkpoints"]),
            "logging_dir": str(paths["logs"]),
            "per_device_train_batch_size": int(
                optimization.get(
                    "train_batch_size",
                    8,
                )
            ),
            "per_device_eval_batch_size": int(
                optimization.get(
                    "evaluation_batch_size",
                    16,
                )
            ),
            "num_train_epochs": float(
                optimization.get(
                    "num_train_epochs",
                    3.0,
                )
            ),
            "learning_rate": float(
                optimization.get(
                    "learning_rate",
                    2e-5,
                )
            ),
            "weight_decay": float(
                optimization.get(
                    "weight_decay",
                    0.01,
                )
            ),
            "warmup_ratio": float(
                optimization.get(
                    "warmup_ratio",
                    0.1,
                )
            ),
            "gradient_accumulation_steps": int(
                optimization.get(
                    "gradient_accumulation_steps",
                    1,
                )
            ),
            "max_grad_norm": float(
                optimization.get(
                    "max_gradient_norm",
                    1.0,
                )
            ),
            "optim": str(
                optimization.get(
                    "optimizer",
                    "adamw_torch",
                )
            ),
            "lr_scheduler_type": str(
                optimization.get(
                    "scheduler_type",
                    "linear",
                )
            ),
            "eval_strategy": eval_strategy,
            "save_strategy": save_strategy,
            "logging_strategy": "steps",
            "logging_steps": int(
                evaluation.get(
                    "logging_steps",
                    50,
                )
            ),
            "save_total_limit": (evaluation.get("save_total_limit")),
            "load_best_model_at_end": bool(
                evaluation.get(
                    "load_best_model_at_end",
                    True,
                )
            ),
            "metric_for_best_model": str(
                evaluation.get(
                    "metric_for_best_model",
                    "macro_f1",
                )
            ),
            "greater_is_better": bool(
                evaluation.get(
                    "greater_is_better",
                    True,
                )
            ),
            "seed": int(
                configuration.get(
                    "random_seed",
                    42,
                )
            ),
            "data_seed": int(
                configuration.get(
                    "random_seed",
                    42,
                )
            ),
            "fp16": bool(
                runtime.get(
                    "fp16",
                    False,
                )
            ),
            "bf16": bool(
                runtime.get(
                    "bf16",
                    False,
                )
            ),
            "dataloader_num_workers": int(
                runtime.get(
                    "dataloader_num_workers",
                    0,
                )
            ),
            "dataloader_pin_memory": bool(
                runtime.get(
                    "dataloader_pin_memory",
                    False,
                )
            ),
            "disable_tqdm": bool(
                runtime.get(
                    "disable_tqdm",
                    True,
                )
            ),
            "gradient_checkpointing": bool(
                self._require_object(
                    configuration,
                    "model",
                ).get(
                    "gradient_checkpointing",
                    False,
                )
            ),
            "report_to": "none",
            "do_train": True,
            "do_eval": True,
            "do_predict": True,
            "use_cpu": (resolved_device == "cpu"),
        }

        evaluation_steps = evaluation.get("evaluation_steps")

        if eval_strategy == "steps" and evaluation_steps is not None:
            arguments["eval_steps"] = int(evaluation_steps)

        save_steps = evaluation.get("save_steps")

        if save_strategy == "steps" and save_steps is not None:
            arguments["save_steps"] = int(save_steps)

        try:
            return TrainingArguments(
                **arguments,
            )
        except Exception as exc:
            raise (
                TransformerTrainerConfigurationError(
                    "Hugging Face TrainingArguments could not be created."
                )
            ) from exc

    def _create_trainer(
        self,
        *,
        model: PreTrainedModel,
        tokenizer: PreTrainedTokenizerBase,
        datasets: TransformerDatasetSplits,
        data_collator: DataCollatorWithPadding,
        training_arguments: TrainingArguments,
        configuration: dict[str, Any],
    ) -> Trainer:
        callbacks: list[Any] = []

        evaluation = self._require_object(
            configuration,
            "evaluation",
        )

        patience = evaluation.get("early_stopping_patience")

        if patience is not None:
            callbacks.append(
                EarlyStoppingCallback(
                    early_stopping_patience=int(patience),
                    early_stopping_threshold=float(
                        evaluation.get(
                            "early_stopping_threshold",
                            0.0,
                        )
                    ),
                )
            )

        trainer_kwargs: dict[str, Any] = {
            "model": model,
            "args": training_arguments,
            "train_dataset": datasets.train,
            "eval_dataset": (datasets.validation),
            "data_collator": data_collator,
            "compute_metrics": (self._build_compute_metrics(datasets.id_to_label)),
            "callbacks": callbacks,
        }

        trainer_parameters = inspect.signature(Trainer.__init__).parameters

        if "processing_class" in trainer_parameters:
            trainer_kwargs["processing_class"] = tokenizer
        elif "tokenizer" in trainer_parameters:
            trainer_kwargs["tokenizer"] = tokenizer

        try:
            return Trainer(
                **trainer_kwargs,
            )
        except Exception as exc:
            raise (
                TransformerTrainerConfigurationError(
                    "The Hugging Face Trainer could not be created."
                )
            ) from exc

    def _build_compute_metrics(
        self,
        id_to_label: dict[int, str],
    ) -> Callable[
        [EvalPrediction],
        dict[str, float],
    ]:
        labels_order = [id_to_label[index] for index in sorted(id_to_label)]

        def compute_metrics(
            prediction: EvalPrediction,
        ) -> dict[str, float]:
            logits = prediction.predictions

            if isinstance(
                logits,
                tuple,
            ):
                logits = logits[0]

            predicted_ids = np.argmax(
                logits,
                axis=-1,
            )

            actual_ids = prediction.label_ids

            return {
                "accuracy": float(
                    accuracy_score(
                        actual_ids,
                        predicted_ids,
                    )
                ),
                "macro_precision": float(
                    precision_score(
                        actual_ids,
                        predicted_ids,
                        average="macro",
                        zero_division=0,
                    )
                ),
                "macro_recall": float(
                    recall_score(
                        actual_ids,
                        predicted_ids,
                        average="macro",
                        zero_division=0,
                    )
                ),
                "macro_f1": float(
                    f1_score(
                        actual_ids,
                        predicted_ids,
                        average="macro",
                        zero_division=0,
                    )
                ),
                "weighted_f1": float(
                    f1_score(
                        actual_ids,
                        predicted_ids,
                        average="weighted",
                        zero_division=0,
                    )
                ),
                "label_count": float(len(labels_order)),
            }

        return compute_metrics

    def build_detailed_metrics(
        self,
        *,
        label_ids: np.ndarray,
        predicted_ids: np.ndarray,
        id_to_label: dict[int, str],
    ) -> dict[str, Any]:
        """Build detailed reports for later persistence phases."""

        ordered_ids = sorted(id_to_label)

        ordered_labels = [id_to_label[index] for index in ordered_ids]

        return {
            "accuracy": float(
                accuracy_score(
                    label_ids,
                    predicted_ids,
                )
            ),
            "macro_precision": float(
                precision_score(
                    label_ids,
                    predicted_ids,
                    average="macro",
                    zero_division=0,
                )
            ),
            "macro_recall": float(
                recall_score(
                    label_ids,
                    predicted_ids,
                    average="macro",
                    zero_division=0,
                )
            ),
            "macro_f1": float(
                f1_score(
                    label_ids,
                    predicted_ids,
                    average="macro",
                    zero_division=0,
                )
            ),
            "weighted_f1": float(
                f1_score(
                    label_ids,
                    predicted_ids,
                    average="weighted",
                    zero_division=0,
                )
            ),
            "classification_report": (
                classification_report(
                    label_ids,
                    predicted_ids,
                    labels=ordered_ids,
                    target_names=(ordered_labels),
                    output_dict=True,
                    zero_division=0,
                )
            ),
            "confusion_matrix_labels": (ordered_labels),
            "confusion_matrix": (
                confusion_matrix(
                    label_ids,
                    predicted_ids,
                    labels=ordered_ids,
                ).tolist()
            ),
        }

    def _require_object(
        self,
        source: dict[str, Any],
        key: str,
    ) -> dict[str, Any]:
        value = source.get(key)

        if not isinstance(
            value,
            dict,
        ):
            raise (
                TransformerExperimentConfigurationError(
                    f"The {key} configuration must be a JSON object."
                )
            )

        return value

    def _require_string(
        self,
        source: dict[str, Any],
        key: str,
    ) -> str:
        value = source.get(key)

        if (
            not isinstance(
                value,
                str,
            )
            or not value.strip()
        ):
            raise (
                TransformerExperimentConfigurationError(
                    f"The {key} configuration value is missing."
                )
            )

        return value.strip()

    def _existing_results(
        self,
        experiment: Experiment,
    ) -> dict[str, Any]:
        if isinstance(
            experiment.results,
            dict,
        ):
            return dict(experiment.results)

        return {}

    def _experiment_storage_root(
        self,
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

        return configured_root.resolve()

    def _allowed_storage_roots(
        self,
    ) -> tuple[Path, ...]:
        candidates = [
            self.root_directory,
            self._experiment_storage_root(),
        ]

        dataset_root = Path(
            getattr(
                settings,
                "dataset_storage_path",
                "storage/datasets",
            )
        )

        if not dataset_root.is_absolute():
            dataset_root = self.root_directory / dataset_root

        candidates.append(dataset_root.resolve())

        unique: list[Path] = []

        for candidate in candidates:
            resolved = candidate.resolve()

            if resolved not in unique:
                unique.append(resolved)

        return tuple(unique)

    def _resolve_allowed_path(
        self,
        path: Path,
    ) -> Path:
        candidate = (
            path if path.is_absolute() else self.root_directory / path
        ).resolve()

        for root in self._allowed_storage_roots():
            try:
                candidate.relative_to(root)
            except ValueError:
                continue

            return candidate

        raise TransformerTrainingArtifactError(
            "The requested Transformer "
            "artifact path is outside the "
            "allowed storage roots."
        )
