from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch
from normalizer import normalize
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
)


def save_json(
    path: Path,
    data: dict[str, Any],
) -> None:
    path.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def load_test_data(
    dataset_directory: Path,
) -> pd.DataFrame:
    test_path = dataset_directory / "test.csv"

    if not test_path.exists():
        raise FileNotFoundError(
            f"Test split not found: {test_path}"
        )

    dataframe = pd.read_csv(test_path)

    required_columns = {"text", "label"}

    if not required_columns.issubset(
        dataframe.columns
    ):
        raise ValueError(
            "test.csv must contain text and label columns"
        )

    dataframe = dataframe.dropna(
        subset=["text", "label"]
    ).copy()

    dataframe["text"] = (
        dataframe["text"]
        .astype(str)
        .str.strip()
    )

    dataframe["label"] = (
        dataframe["label"]
        .astype(str)
        .str.strip()
    )

    return dataframe


def calculate_metrics(
    actual: list[str],
    predicted: list[str],
    labels: list[str],
) -> dict[str, Any]:
    return {
        "accuracy": float(
            accuracy_score(actual, predicted)
        ),
        "macro_precision": float(
            precision_score(
                actual,
                predicted,
                average="macro",
                zero_division=0,
            )
        ),
        "macro_recall": float(
            recall_score(
                actual,
                predicted,
                average="macro",
                zero_division=0,
            )
        ),
        "macro_f1": float(
            f1_score(
                actual,
                predicted,
                average="macro",
                zero_division=0,
            )
        ),
        "weighted_f1": float(
            f1_score(
                actual,
                predicted,
                average="weighted",
                zero_division=0,
            )
        ),
        "classification_report": (
            classification_report(
                actual,
                predicted,
                labels=labels,
                output_dict=True,
                zero_division=0,
            )
        ),
        "confusion_matrix": (
            confusion_matrix(
                actual,
                predicted,
                labels=labels,
            ).tolist()
        ),
        "labels": labels,
    }


def save_confusion_matrix(
    actual: list[str],
    predicted: list[str],
    labels: list[str],
    output_path: Path,
    title: str,
) -> None:
    matrix = confusion_matrix(
        actual,
        predicted,
        labels=labels,
    )

    display = ConfusionMatrixDisplay(
        confusion_matrix=matrix,
        display_labels=labels,
    )

    figure, axis = plt.subplots(
        figsize=(8, 6)
    )

    display.plot(
        ax=axis,
        values_format="d",
    )

    axis.set_title(title)

    figure.tight_layout()
    figure.savefig(
        output_path,
        dpi=300,
        bbox_inches="tight",
    )

    plt.close(figure)


def predict_classical(
    artifact_path: Path,
    texts: list[str],
) -> tuple[list[str], list[float]]:
    model = joblib.load(artifact_path)

    predictions = [
        str(label)
        for label in model.predict(texts)
    ]

    if hasattr(model, "predict_proba"):
        probability_matrix = model.predict_proba(
            texts
        )

        confidences = (
            probability_matrix.max(axis=1).tolist()
        )

    else:
        confidences = [0.0] * len(texts)

    return predictions, confidences


def get_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")

    if (
        hasattr(torch.backends, "mps")
        and torch.backends.mps.is_available()
    ):
        return torch.device("mps")

    return torch.device("cpu")


def predict_transformer(
    artifact_path: Path,
    texts: list[str],
    batch_size: int = 8,
    max_length: int = 128,
) -> tuple[list[str], list[float]]:
    tokenizer = AutoTokenizer.from_pretrained(
        artifact_path
    )

    model = (
        AutoModelForSequenceClassification
        .from_pretrained(artifact_path)
    )

    device = get_device()

    model.to(device)
    model.eval()

    id2label = {
        int(key): str(value)
        for key, value
        in model.config.id2label.items()
    }

    all_predictions: list[str] = []
    all_confidences: list[float] = []

    for start_index in range(
        0,
        len(texts),
        batch_size,
    ):
        batch_texts = texts[
            start_index:
            start_index + batch_size
        ]

        normalized_texts = [
            normalize(text)
            for text in batch_texts
        ]

        encoded = tokenizer(
            normalized_texts,
            padding=True,
            truncation=True,
            max_length=max_length,
            return_tensors="pt",
        )

        encoded = {
            key: value.to(device)
            for key, value in encoded.items()
        }

        with torch.inference_mode():
            output = model(**encoded)

            probabilities = torch.softmax(
                output.logits,
                dim=-1,
            )

        predicted_indexes = (
            probabilities.argmax(dim=-1)
        )

        confidence_values = (
            probabilities.max(dim=-1).values
        )

        all_predictions.extend(
            id2label[int(index)]
            for index in (
                predicted_indexes
                .detach()
                .cpu()
                .tolist()
            )
        )

        all_confidences.extend(
            float(value)
            for value in (
                confidence_values
                .detach()
                .cpu()
                .tolist()
            )
        )

    return all_predictions, all_confidences


def evaluate_one_model(
    model_name: str,
    model_type: str,
    artifact_path: Path,
    dataframe: pd.DataFrame,
    output_directory: Path,
) -> dict[str, Any]:
    texts = dataframe["text"].tolist()
    actual = dataframe["label"].tolist()

    labels = sorted(
        dataframe["label"].unique().tolist()
    )

    if model_type == "classical":
        predictions, confidences = (
            predict_classical(
                artifact_path,
                texts,
            )
        )

    elif model_type == "transformer":
        predictions, confidences = (
            predict_transformer(
                artifact_path,
                texts,
            )
        )

    else:
        raise ValueError(
            f"Unsupported model type: {model_type}"
        )

    metrics = calculate_metrics(
        actual,
        predictions,
        labels,
    )

    model_directory = (
        output_directory / model_name
    )

    model_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    errors = dataframe.copy()

    errors["predicted_label"] = predictions
    errors["confidence"] = confidences
    errors["is_correct"] = (
        errors["label"]
        == errors["predicted_label"]
    )

    errors.to_csv(
        model_directory
        / "all_predictions.csv",
        index=False,
    )

    errors[
        errors["is_correct"] == False
    ].to_csv(
        model_directory / "errors.csv",
        index=False,
    )

    save_json(
        model_directory / "metrics.json",
        metrics,
    )

    save_confusion_matrix(
        actual=actual,
        predicted=predictions,
        labels=labels,
        output_path=(
            model_directory
            / "confusion_matrix.png"
        ),
        title=f"{model_name} Confusion Matrix",
    )

    return {
        "model_name": model_name,
        "model_type": model_type,
        "artifact_path": str(
            artifact_path.resolve()
        ),
        "metrics": metrics,
        "error_count": int(
            (
                errors["is_correct"] == False
            ).sum()
        ),
    }


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate and compare BanglaGuard models."
        )
    )

    parser.add_argument(
        "--dataset-dir",
        type=Path,
        required=True,
    )

    parser.add_argument(
        "--classical-model",
        type=Path,
        required=True,
    )

    parser.add_argument(
        "--transformer-model",
        type=Path,
        required=True,
    )

    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
    )

    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()

    output_directory = (
        arguments.output_dir
        .expanduser()
        .resolve()
    )

    output_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    dataframe = load_test_data(
        arguments.dataset_dir
        .expanduser()
        .resolve()
    )

    classical_result = evaluate_one_model(
        model_name="tfidf_logistic_regression",
        model_type="classical",
        artifact_path=(
            arguments.classical_model
            .expanduser()
            .resolve()
        ),
        dataframe=dataframe,
        output_directory=output_directory,
    )

    transformer_result = evaluate_one_model(
        model_name="banglabert",
        model_type="transformer",
        artifact_path=(
            arguments.transformer_model
            .expanduser()
            .resolve()
        ),
        dataframe=dataframe,
        output_directory=output_directory,
    )

    comparison = {
        "dataset_directory": str(
            arguments.dataset_dir.resolve()
        ),
        "test_samples": len(dataframe),
        "models": {
            "tfidf_logistic_regression": (
                classical_result
            ),
            "banglabert": (
                transformer_result
            ),
        },
    }

    best_model = max(
        comparison["models"].items(),
        key=lambda item: (
            item[1]["metrics"]["macro_f1"]
        ),
    )

    comparison["best_model"] = best_model[0]
    comparison[
        "selection_metric"
    ] = "test_macro_f1"

    save_json(
        output_directory
        / "comparison.json",
        comparison,
    )

    print("Evaluation complete.")
    print(
        "Classical macro F1:",
        classical_result[
            "metrics"
        ]["macro_f1"],
    )
    print(
        "BanglaBERT macro F1:",
        transformer_result[
            "metrics"
        ]["macro_f1"],
    )
    print(
        "Best model:",
        comparison["best_model"],
    )


if __name__ == "__main__":
    main()