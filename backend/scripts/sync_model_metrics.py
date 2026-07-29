import asyncio
import json
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings
from app.db.models import ModelVersion


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def read_json(
    relative_path: str,
) -> dict[str, Any]:
    path = PROJECT_ROOT / relative_path

    if not path.exists():
        raise FileNotFoundError(
            f"Metrics file not found: {path}"
        )

    return json.loads(
        path.read_text(encoding="utf-8")
    )


def build_classical_metrics() -> tuple[
    dict[str, Any],
    dict[str, Any],
]:
    experiment = read_json(
        "storage/models/hate-speech/"
        "classical-v0.1.0/"
        "experiment_results.json"
    )

    result = experiment["models"][
        "tfidf_logistic_regression"
    ]

    validation = result["validation"]
    test = result["test"]

    metrics = {
        "accuracy": test["accuracy"],
        "macro_precision": (
            test["macro_precision"]
        ),
        "macro_recall": (
            test["macro_recall"]
        ),
        "macro_f1": test["macro_f1"],
        "weighted_f1": (
            test["weighted_f1"]
        ),
        "validation_accuracy": (
            validation["accuracy"]
        ),
        "validation_macro_f1": (
            validation["macro_f1"]
        ),
        "evaluation_split": "test",
        "evaluation_samples": (
            experiment["test_samples"]
        ),
        "validation_samples": (
            experiment["validation_samples"]
        ),
        "training_samples": (
            experiment["training_samples"]
        ),
        "confusion_matrix": (
            test["confusion_matrix"]
        ),
        "confusion_matrix_labels": (
            test[
                "confusion_matrix_labels"
            ]
        ),
        "classification_report": (
            test["classification_report"]
        ),
        "warning": (
            "Development smoke-test results. "
            "The test split contains only "
            f"{experiment['test_samples']} samples."
        ),
    }

    configuration = {
        "random_seed": (
            experiment["random_seed"]
        ),
        "dataset_directory": (
            experiment["dataset_directory"]
        ),
        "training_samples": (
            experiment["training_samples"]
        ),
        "validation_samples": (
            experiment["validation_samples"]
        ),
        "test_samples": (
            experiment["test_samples"]
        ),
    }

    return metrics, configuration


def build_transformer_metrics() -> tuple[
    dict[str, Any],
    dict[str, Any],
]:
    experiment = read_json(
        "storage/models/hate-speech/"
        "banglabert-v0.1.0/"
        "experiment_results.json"
    )

    validation = experiment[
        "validation_metrics"
    ]

    test = experiment["test_metrics"]
    counts = experiment["sample_counts"]

    metrics = {
        "accuracy": test["test_accuracy"],
        "macro_precision": (
            test["test_macro_precision"]
        ),
        "macro_recall": (
            test["test_macro_recall"]
        ),
        "macro_f1": (
            test["test_macro_f1"]
        ),
        "weighted_f1": (
            test["test_weighted_f1"]
        ),
        "test_loss": test["test_loss"],
        "validation_accuracy": (
            validation[
                "validation_accuracy"
            ]
        ),
        "validation_macro_f1": (
            validation[
                "validation_macro_f1"
            ]
        ),
        "validation_loss": (
            validation["validation_loss"]
        ),
        "train_loss": (
            experiment[
                "train_metrics"
            ]["train_loss"]
        ),
        "training_runtime_seconds": (
            experiment[
                "train_metrics"
            ]["train_runtime"]
        ),
        "evaluation_split": "test",
        "evaluation_samples": (
            counts["test"]
        ),
        "validation_samples": (
            counts["validation"]
        ),
        "training_samples": (
            counts["train"]
        ),
        "confusion_matrix": (
            experiment[
                "test_confusion_matrix"
            ]
        ),
        "confusion_matrix_labels": (
            experiment[
                "test_confusion_matrix_labels"
            ]
        ),
        "classification_report": (
            experiment[
                "test_classification_report"
            ]
        ),
        "warning": (
            "Development smoke-test results. "
            "The test split contains only "
            f"{counts['test']} samples."
        ),
    }

    configuration = {
        "base_model": (
            experiment["base_model"]
        ),
        "epochs": experiment["epochs"],
        "learning_rate": (
            experiment["learning_rate"]
        ),
        "max_length": (
            experiment["max_length"]
        ),
        "train_batch_size": (
            experiment[
                "train_batch_size"
            ]
        ),
        "eval_batch_size": (
            experiment[
                "eval_batch_size"
            ]
        ),
        "random_seed": (
            experiment["random_seed"]
        ),
        "dataset_directory": (
            experiment["dataset_directory"]
        ),
        "training_samples": (
            counts["train"]
        ),
        "validation_samples": (
            counts["validation"]
        ),
        "test_samples": counts["test"],
        "labels": (
            experiment["labels"]["labels"]
        ),
    }

    return metrics, configuration


async def synchronize() -> None:
    engine = create_async_engine(
        settings.database_url,
        pool_pre_ping=True,
    )

    session_factory = async_sessionmaker(
        engine,
        expire_on_commit=False,
    )

    classical_metrics, classical_config = (
        build_classical_metrics()
    )

    transformer_metrics, transformer_config = (
        build_transformer_metrics()
    )

    async with session_factory() as session:
        result = await session.scalars(
            select(ModelVersion)
        )

        models = list(result.all())

        updated = 0

        for model in models:
            existing_configuration = dict(
                model.configuration or {}
            )

            if (
                model.architecture
                == "tfidf_logistic_regression"
            ):
                model.metrics = (
                    classical_metrics
                )

                model.configuration = {
                    **existing_configuration,
                    **classical_config,
                }

                updated += 1

            elif model.architecture in {
                "banglabert_sequence_classification",
                "transformer_sequence_classification",
            }:
                model.metrics = (
                    transformer_metrics
                )

                model.configuration = {
                    **existing_configuration,
                    **transformer_config,
                }

                updated += 1

        await session.commit()

        print(
            f"Updated {updated} model-version records."
        )

        for model in models:
            print(
                f"- {model.name}: "
                f"{model.architecture}"
            )

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(synchronize())
