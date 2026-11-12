from __future__ import annotations

import json
import os
from app.domain.services.training_jobs import JobStore
import traceback
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import Any

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.multiclass import OneVsRestClassifier
from app.ml.tokenization import unicode_word_tokens
from app.ml.preprocessing import preprocess_text
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.pipeline import Pipeline
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import ROOT_DIR, settings
from app.db.models import Experiment
from app.db.repositories.experiment import ExperimentRepository
from app.domain.enums import ExperimentStatus


class ClassicalTrainingExecutionError(Exception):
    """Base exception for classical training execution failures."""


class ClassicalExperimentStateError(ClassicalTrainingExecutionError):
    """Raised when an experiment cannot transition into training."""


class ClassicalExperimentConfigurationError(ClassicalTrainingExecutionError):
    """Raised when the saved experiment configuration is invalid."""


class ClassicalTrainingArtifactError(ClassicalTrainingExecutionError):
    """Raised when required dataset or workspace artifacts are unavailable."""


class ClassicalTrainingExecutionService:
    def __init__(
        self,
        session: AsyncSession,
        root_directory: Path = ROOT_DIR,
    ) -> None:
        self.session = session
        self.repository = ExperimentRepository(session)
        self.root_directory = root_directory.resolve()

    async def execute(
        self,
        *,
        experiment: Experiment,
    ) -> dict[str, Any]:
        self._validate_initial_state(experiment)

        configuration = self._load_configuration(experiment)

        paths = self._resolve_execution_paths(
            experiment=experiment,
            configuration=configuration,
        )

        started_at = datetime.now(timezone.utc)

        experiment.status = ExperimentStatus.RUNNING
        experiment.started_at = started_at
        experiment.completed_at = None
        experiment.results = {
            **self._existing_results(experiment),
            "training_started": True,
            "training_completed": False,
            "training_failed": False,
            "started_at": started_at.isoformat(),
            "completed_at": None,
            "error_message": None,
            "workspace": str(paths["workspace"]),
            "configuration_path": str(paths["configuration"]),
            "metadata_path": str(paths["metadata"]),
            "training_log_path": str(paths["training_log"]),
        }

        await self.session.commit()
        await self.session.refresh(experiment)

        self._update_metadata(
            metadata_path=paths["metadata"],
            updates={
                "status": ExperimentStatus.RUNNING.value,
                "started_at": started_at.isoformat(),
                "completed_at": None,
                "error_message": None,
            },
        )

        start_counter = perf_counter()

        try:
            self._append_log(
                paths["training_log"],
                (
                    f"[{started_at.isoformat()}] "
                    f"Starting classical training for experiment {experiment.id}."
                ),
            )

            split_data = self._load_dataset_splits(configuration)

            pipeline = self._build_pipeline(configuration)

            self._append_log(
                paths["training_log"],
                (
                    "Loaded dataset splits: "
                    f"train={len(split_data['train'][0])}, "
                    f"validation={len(split_data['validation'][0])}, "
                    f"test={len(split_data['test'][0])}."
                ),
            )

            if job_id := os.environ.get("BANGLAGUARD_TRAINING_JOB"):
                JobStore().event(job_id, state="training")
            pipeline.fit(
                split_data["train"][0],
                split_data["train"][1],
            )

            self._append_log(
                paths["training_log"],
                "Model fitting completed.",
            )

            if job_id := os.environ.get("BANGLAGUARD_TRAINING_JOB"):
                JobStore().event(job_id, state="evaluating")
            validation_metrics = self._evaluate(
                pipeline=pipeline,
                texts=split_data["validation"][0],
                labels=split_data["validation"][1],
                save_probabilities=bool(
                    configuration.get(
                        "save_probabilities",
                        True,
                    )
                ),
            )

            test_metrics = self._evaluate(
                pipeline=pipeline,
                texts=split_data["test"][0],
                labels=split_data["test"][1],
                save_probabilities=bool(
                    configuration.get(
                        "save_probabilities",
                        True,
                    )
                ),
            )

            from app.domain.services.evaluation_research import save_evidence
            for split in ("validation", "test"):
                texts, actual = split_data[split]
                save_evidence(paths["workspace"], split, texts.tolist(), actual.tolist(),
                              pipeline.predict(texts).tolist(), pipeline.classes_.tolist(),
                              pipeline.predict_proba(texts) if configuration.get("save_probabilities", True) else None,
                              configuration, sources=getattr(self, "_evaluation_sources", {}).get(split))

            if job_id := os.environ.get("BANGLAGUARD_TRAINING_JOB"):
                JobStore().event(job_id, state="saving")
            artifact_path = paths["artifacts"] / "model.joblib"

            joblib.dump(
                pipeline,
                artifact_path,
                compress=3,
            )

            self._write_json(
                paths["metrics"] / "validation_metrics.json",
                self._filter_saved_metrics(
                    validation_metrics,
                    configuration=configuration,
                ),
            )

            self._write_json(
                paths["metrics"] / "test_metrics.json",
                self._filter_saved_metrics(
                    test_metrics,
                    configuration=configuration,
                ),
            )

            if bool(
                configuration.get(
                    "save_classification_report",
                    True,
                )
            ):
                self._write_json(
                    paths["metrics"] / "classification_report.json",
                    {
                        "validation": validation_metrics["classification_report"],
                        "test": test_metrics["classification_report"],
                    },
                )

            if bool(
                configuration.get(
                    "save_confusion_matrix",
                    True,
                )
            ):
                self._write_json(
                    paths["metrics"] / "confusion_matrix.json",
                    {
                        "labels": test_metrics["confusion_matrix_labels"],
                        "validation": validation_metrics["confusion_matrix"],
                        "test": test_metrics["confusion_matrix"],
                    },
                )

            completed_at = datetime.now(timezone.utc)

            duration_seconds = round(
                perf_counter() - start_counter,
                6,
            )

            execution_result = {
                "experiment_id": str(experiment.id),
                "status": ExperimentStatus.COMPLETED.value,
                "model_family": configuration["model_family"],
                "model_name": configuration["model_name"],
                "model_version": configuration["model_version"],
                "task": configuration["task"],
                "artifact_path": str(artifact_path),
                "started_at": started_at.isoformat(),
                "completed_at": completed_at.isoformat(),
                "duration_seconds": duration_seconds,
                "sample_counts": {
                    "train": len(split_data["train"][0]),
                    "validation": len(split_data["validation"][0]),
                    "test": len(split_data["test"][0]),
                },
                "validation_metrics": self._summary_metrics(validation_metrics),
                "test_metrics": self._summary_metrics(test_metrics),
                "model_version_registered": False,
            }

            execution_result_path = paths["metrics"] / "execution_result.json"

            self._write_json(
                execution_result_path,
                execution_result,
            )

            experiment.status = ExperimentStatus.COMPLETED
            experiment.completed_at = completed_at
            experiment.results = {
                **self._existing_results(experiment),
                "training_started": True,
                "training_completed": True,
                "training_failed": False,
                "started_at": started_at.isoformat(),
                "completed_at": completed_at.isoformat(),
                "duration_seconds": duration_seconds,
                "error_message": None,
                "artifact_path": str(artifact_path),
                "validation_metrics": self._summary_metrics(validation_metrics),
                "test_metrics": self._summary_metrics(test_metrics),
                "execution_result_path": str(execution_result_path),
                "model_version_registered": False,
            }

            await self.session.commit()
            await self.session.refresh(experiment)

            self._update_metadata(
                metadata_path=paths["metadata"],
                updates={
                    "status": ExperimentStatus.COMPLETED.value,
                    "completed_at": completed_at.isoformat(),
                    "duration_seconds": duration_seconds,
                    "artifact_path": str(artifact_path),
                    "validation_metrics": self._summary_metrics(validation_metrics),
                    "test_metrics": self._summary_metrics(test_metrics),
                    "error_message": None,
                },
            )

            self._append_log(
                paths["training_log"],
                (
                    f"[{completed_at.isoformat()}] "
                    "Classical training completed successfully."
                ),
            )

            return {
                "experiment_id": experiment.id,
                "status": ExperimentStatus.COMPLETED.value,
                "dataset_version_id": experiment.dataset_version_id,
                "model_version_id": experiment.model_version_id,
                "model_name": configuration["model_name"],
                "model_version": configuration["model_version"],
                "model_family": configuration["model_family"],
                "task": configuration["task"],
                "started_at": started_at,
                "completed_at": completed_at,
                "duration_seconds": duration_seconds,
                "artifact_path": str(artifact_path),
                "training_log_path": str(paths["training_log"]),
                "execution_result_path": str(execution_result_path),
                "validation_metrics": self._summary_metrics(validation_metrics),
                "test_metrics": self._summary_metrics(test_metrics),
                "model_version_registered": False,
            }

        except Exception as exc:
            completed_at = datetime.now(timezone.utc)

            duration_seconds = round(
                perf_counter() - start_counter,
                6,
            )

            error_message = str(exc)[:4000]

            failure_trace = traceback.format_exc()

            self._append_log(
                paths["training_log"],
                (
                    f"[{completed_at.isoformat()}] "
                    f"Training failed: {error_message}\n"
                    f"{failure_trace}"
                ),
            )

            experiment.status = ExperimentStatus.FAILED
            experiment.completed_at = completed_at
            experiment.results = {
                **self._existing_results(experiment),
                "training_started": True,
                "training_completed": False,
                "training_failed": True,
                "started_at": started_at.isoformat(),
                "completed_at": completed_at.isoformat(),
                "duration_seconds": duration_seconds,
                "error_message": error_message,
                "model_version_registered": False,
            }

            await self.session.commit()
            await self.session.refresh(experiment)

            self._update_metadata(
                metadata_path=paths["metadata"],
                updates={
                    "status": ExperimentStatus.FAILED.value,
                    "completed_at": completed_at.isoformat(),
                    "duration_seconds": duration_seconds,
                    "error_message": error_message,
                },
            )

            raise ClassicalTrainingExecutionError(
                f"Classical training failed: {error_message}"
            ) from exc

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

            raise ClassicalExperimentStateError(
                "Only planned experiments may start training. "
                f"Current status: {status_value}."
            )

        if experiment.model_version_id is not None:
            raise ClassicalExperimentStateError(
                "This experiment already has a registered model version."
            )

        if not isinstance(
            experiment.configuration,
            dict,
        ):
            raise ClassicalExperimentConfigurationError(
                "The experiment does not contain a valid training configuration."
            )

    def _load_configuration(
        self,
        experiment: Experiment,
    ) -> dict[str, Any]:
        results = self._existing_results(experiment)

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
            raise ClassicalExperimentConfigurationError(
                "The experiment configuration file path is missing."
            )

        configuration_path = self._resolve_allowed_path(
            Path(configured_path),
        )

        if not configuration_path.is_file():
            raise ClassicalTrainingArtifactError(
                "The experiment configuration file was not found."
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
            raise ClassicalExperimentConfigurationError(
                "The experiment configuration file could not be read."
            ) from exc

        if not isinstance(
            configuration,
            dict,
        ):
            raise ClassicalExperimentConfigurationError(
                "The experiment configuration must be a JSON object."
            )

        required_keys = {
            "experiment_id",
            "dataset",
            "output",
            "tfidf",
            "classifier",
            "model_family",
            "model_name",
            "model_version",
            "task",
        }

        missing_keys = sorted(required_keys - set(configuration))

        if missing_keys:
            raise ClassicalExperimentConfigurationError(
                "The experiment configuration is missing required keys: "
                + ", ".join(missing_keys)
                + "."
            )

        if str(configuration["experiment_id"]) != str(experiment.id):
            raise ClassicalExperimentConfigurationError(
                "The saved configuration belongs to another experiment."
            )

        if configuration.get("model_family") != "tfidf_logistic_regression":
            raise ClassicalExperimentConfigurationError(
                "Only tfidf_logistic_regression experiments "
                "are supported by this executor."
            )

        return configuration

    def _resolve_execution_paths(
        self,
        *,
        experiment: Experiment,
        configuration: dict[str, Any],
    ) -> dict[str, Path]:
        output = configuration.get("output")

        if not isinstance(
            output,
            dict,
        ):
            raise ClassicalExperimentConfigurationError(
                "The output configuration is invalid."
            )

        required_output_keys = {
            "workspace",
            "logs",
            "artifacts",
            "metrics",
        }

        missing_output_keys = sorted(required_output_keys - set(output))

        if missing_output_keys:
            raise ClassicalExperimentConfigurationError(
                "The output configuration is missing keys: "
                + ", ".join(missing_output_keys)
                + "."
            )

        workspace = self._resolve_allowed_path(Path(str(output["workspace"])))

        expected_workspace = self._experiment_storage_root() / str(experiment.id)

        if workspace != expected_workspace.resolve():
            raise ClassicalExperimentConfigurationError(
                "The configured workspace does not match the experiment."
            )

        logs = self._resolve_allowed_path(Path(str(output["logs"])))

        artifacts = self._resolve_allowed_path(Path(str(output["artifacts"])))

        metrics = self._resolve_allowed_path(Path(str(output["metrics"])))

        configuration_path = self._resolve_allowed_path(
            workspace / "configuration.json"
        )

        metadata_path = self._resolve_allowed_path(workspace / "metadata.json")

        for directory in (
            workspace,
            logs,
            artifacts,
            metrics,
        ):
            directory.mkdir(
                parents=True,
                exist_ok=True,
            )

        return {
            "workspace": workspace,
            "configuration": configuration_path,
            "metadata": metadata_path,
            "logs": logs,
            "artifacts": artifacts,
            "metrics": metrics,
            "training_log": logs / "training.log",
        }

    def _load_dataset_splits(
        self,
        configuration: dict[str, Any],
    ) -> dict[
        str,
        tuple[pd.Series, pd.Series],
    ]:
        dataset = configuration.get("dataset")

        if not isinstance(
            dataset,
            dict,
        ):
            raise ClassicalExperimentConfigurationError(
                "The dataset configuration is invalid."
            )

        artifact_paths = dataset.get("artifact_paths")

        if not isinstance(
            artifact_paths,
            dict,
        ):
            raise ClassicalExperimentConfigurationError(
                "Dataset artifact paths are missing."
            )

        self._evaluation_sources = {}
        splits: dict[
            str,
            tuple[pd.Series, pd.Series],
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
                raise ClassicalTrainingArtifactError(
                    f"The {split_name} dataset path is missing."
                )

            file_path = self._resolve_allowed_path(Path(stored_path))

            if not file_path.is_file():
                raise ClassicalTrainingArtifactError(
                    f"The {split_name} dataset file was not found."
                )

            try:
                dataframe = pd.read_csv(
                    file_path,
                    encoding="utf-8",
                )
            except Exception as exc:
                raise ClassicalTrainingArtifactError(
                    f"The {split_name} dataset file could not be read."
                ) from exc

            required_columns = {
                "text",
                "label",
            }

            if not required_columns.issubset(dataframe.columns):
                raise ClassicalTrainingArtifactError(
                    f"The {split_name} split must contain text and label columns."
                )

            dataframe = dataframe[["text", "label"] + (["source"] if "source" in dataframe.columns else [])].copy()

            dataframe["text"] = (
                dataframe["text"].astype("string").fillna("").map(
                    lambda text: preprocess_text(str(text)).normalized_text
                )
            )

            dataframe["label"] = (
                dataframe["label"].astype("string").fillna("").str.strip()
            )

            dataframe = dataframe[
                (dataframe["text"] != "") & (dataframe["label"] != "")
            ].reset_index(drop=True)

            if dataframe.empty:
                raise ClassicalTrainingArtifactError(
                    f"The {split_name} split contains no valid rows."
                )

            if "source" in dataframe.columns:
                self._evaluation_sources[split_name] = dataframe["source"].fillna("Unknown").astype(str).tolist()
            splits[split_name] = (
                dataframe["text"],
                dataframe["label"],
            )

        training_labels = set(splits["train"][1].unique().tolist())

        if len(training_labels) < 2:
            raise ClassicalTrainingArtifactError(
                "The training split must contain at least two labels."
            )

        for split_name in (
            "validation",
            "test",
        ):
            split_labels = set(splits[split_name][1].unique().tolist())

            unknown_labels = sorted(split_labels - training_labels)

            if unknown_labels:
                raise ClassicalTrainingArtifactError(
                    f"The {split_name} split contains labels "
                    "that are absent from training: " + ", ".join(unknown_labels) + "."
                )

        return splits

    def _build_pipeline(
        self,
        configuration: dict[str, Any],
    ) -> Pipeline:
        tfidf = configuration.get("tfidf")

        classifier = configuration.get("classifier")

        if not isinstance(
            tfidf,
            dict,
        ) or not isinstance(
            classifier,
            dict,
        ):
            raise ClassicalExperimentConfigurationError(
                "TF-IDF or classifier configuration is invalid."
            )

        vectorizer = TfidfVectorizer(
            tokenizer=unicode_word_tokens if tfidf.get("analyzer", "word") == "word" else None,
            token_pattern=None,
            analyzer=str(
                tfidf.get(
                    "analyzer",
                    "word",
                )
            ),
            lowercase=bool(
                tfidf.get(
                    "lowercase",
                    False,
                )
            ),
            strip_accents=tfidf.get("strip_accents"),
            ngram_range=(
                int(
                    tfidf.get(
                        "ngram_min",
                        1,
                    )
                ),
                int(
                    tfidf.get(
                        "ngram_max",
                        2,
                    )
                ),
            ),
            min_df=int(
                tfidf.get(
                    "min_df",
                    2,
                )
            ),
            max_df=float(
                tfidf.get(
                    "max_df",
                    0.98,
                )
            ),
            max_features=(
                int(tfidf["max_features"])
                if tfidf.get("max_features") is not None
                else None
            ),
            sublinear_tf=bool(
                tfidf.get(
                    "sublinear_tf",
                    True,
                )
            ),
            use_idf=bool(
                tfidf.get(
                    "use_idf",
                    True,
                )
            ),
            smooth_idf=bool(
                tfidf.get(
                    "smooth_idf",
                    True,
                )
            ),
            norm=tfidf.get(
                "norm",
                "l2",
            ),
        )

        logistic_regression = LogisticRegression(
            penalty=classifier.get(
                "penalty",
                "l2",
            ),
            solver=str(
                classifier.get(
                    "solver",
                    "liblinear",
                )
            ),
            C=float(
                classifier.get(
                    "regularization_c",
                    1.0,
                )
            ),
            max_iter=int(
                classifier.get(
                    "max_iter",
                    2000,
                )
            ),
            class_weight=classifier.get(
                "class_weight",
                "balanced",
            ),
            tol=float(
                classifier.get(
                    "tolerance",
                    0.0001,
                )
            ),
            fit_intercept=bool(
                classifier.get(
                    "fit_intercept",
                    True,
                )
            ),
            l1_ratio=classifier.get("l1_ratio"),
            random_state=int(
                configuration.get(
                    "random_seed",
                    42,
                )
            ),
        )

        # Liblinear is binary-only in current sklearn. Explicit one-vs-rest
        # retains the selected solver and supports multiclass sentiment labels.
        estimator = (
            OneVsRestClassifier(logistic_regression)
            if logistic_regression.solver == "liblinear"
            else logistic_regression
        )

        return Pipeline(
            [
                (
                    "features",
                    vectorizer,
                ),
                (
                    "classifier",
                    estimator,
                ),
            ]
        )

    def _evaluate(
        self,
        *,
        pipeline: Pipeline,
        texts: pd.Series,
        labels: pd.Series,
        save_probabilities: bool,
    ) -> dict[str, Any]:
        predictions = pipeline.predict(texts)

        classifier = pipeline.named_steps["classifier"]

        label_names = [str(label) for label in classifier.classes_]

        report = classification_report(
            labels,
            predictions,
            labels=label_names,
            output_dict=True,
            zero_division=0,
        )

        matrix = confusion_matrix(
            labels,
            predictions,
            labels=label_names,
        )

        result: dict[str, Any] = {
            "accuracy": float(
                accuracy_score(
                    labels,
                    predictions,
                )
            ),
            "macro_precision": float(
                precision_score(
                    labels,
                    predictions,
                    average="macro",
                    zero_division=0,
                )
            ),
            "macro_recall": float(
                recall_score(
                    labels,
                    predictions,
                    average="macro",
                    zero_division=0,
                )
            ),
            "macro_f1": float(
                f1_score(
                    labels,
                    predictions,
                    average="macro",
                    zero_division=0,
                )
            ),
            "weighted_f1": float(
                f1_score(
                    labels,
                    predictions,
                    average="weighted",
                    zero_division=0,
                )
            ),
            "classification_report": report,
            "confusion_matrix": matrix.tolist(),
            "confusion_matrix_labels": label_names,
        }

        if save_probabilities:
            probabilities = pipeline.predict_proba(texts)

            result["probability_summary"] = {
                label: {
                    "minimum": float(
                        probabilities[
                            :,
                            index,
                        ].min()
                    ),
                    "maximum": float(
                        probabilities[
                            :,
                            index,
                        ].max()
                    ),
                    "average": float(
                        probabilities[
                            :,
                            index,
                        ].mean()
                    ),
                }
                for index, label in enumerate(label_names)
            }

        return result

    def _filter_saved_metrics(
        self,
        metrics: dict[str, Any],
        *,
        configuration: dict[str, Any],
    ) -> dict[str, Any]:
        result = dict(metrics)

        if not bool(
            configuration.get(
                "save_classification_report",
                True,
            )
        ):
            result.pop(
                "classification_report",
                None,
            )

        if not bool(
            configuration.get(
                "save_confusion_matrix",
                True,
            )
        ):
            result.pop(
                "confusion_matrix",
                None,
            )

            result.pop(
                "confusion_matrix_labels",
                None,
            )

        if not bool(
            configuration.get(
                "save_probabilities",
                True,
            )
        ):
            result.pop(
                "probability_summary",
                None,
            )

        return result

    def _summary_metrics(
        self,
        metrics: dict[str, Any],
    ) -> dict[str, float]:
        return {
            key: float(metrics[key])
            for key in (
                "accuracy",
                "macro_precision",
                "macro_recall",
                "macro_f1",
                "weighted_f1",
            )
        }

    def _existing_results(
        self,
        experiment: Experiment,
    ) -> dict[str, Any]:
        return (
            dict(experiment.results)
            if isinstance(
                experiment.results,
                dict,
            )
            else {}
        )

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

    def _resolve_allowed_path(
        self,
        candidate: Path,
    ) -> Path:
        if not candidate.is_absolute():
            candidate = self.root_directory / candidate

        resolved = candidate.expanduser().resolve()

        allowed_roots = (
            self._experiment_storage_root(),
            (self.root_directory / "research" / "data").resolve(),
        )

        for allowed_root in allowed_roots:
            try:
                resolved.relative_to(allowed_root)

                return resolved
            except ValueError:
                continue

        raise ClassicalTrainingArtifactError(
            "A configured training path is outside the allowed storage roots."
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
                loaded = json.loads(
                    metadata_path.read_text(
                        encoding="utf-8",
                    )
                )

                if isinstance(
                    loaded,
                    dict,
                ):
                    metadata = loaded
            except (
                OSError,
                json.JSONDecodeError,
            ):
                metadata = {}

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
        ) as log_file:
            log_file.write(message.rstrip() + "\n")
