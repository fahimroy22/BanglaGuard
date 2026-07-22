from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.base import BaseEstimator
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.svm import LinearSVC


RANDOM_SEED = 42


def load_split(
    dataset_directory: Path,
    split_name: str,
) -> tuple[pd.Series, pd.Series]:
    file_path = dataset_directory / f"{split_name}.csv"

    if not file_path.exists():
        raise FileNotFoundError(
            f"Missing dataset split: {file_path}"
        )

    dataframe = pd.read_csv(file_path)

    required_columns = {"text", "label"}

    if not required_columns.issubset(dataframe.columns):
        raise ValueError(
            f"{file_path.name} must contain text and label columns."
        )

    dataframe = dataframe.dropna(
        subset=["text", "label"]
    )

    texts = dataframe["text"].astype(str)
    labels = dataframe["label"].astype(str)

    return texts, labels


def build_feature_extractor() -> FeatureUnion:
    word_features = TfidfVectorizer(
        analyzer="word",
        ngram_range=(1, 2),
        min_df=1,
        max_df=1.0,
        sublinear_tf=True,
        max_features=30000,
    )

    character_features = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        min_df=1,
        max_df=1.0,
        sublinear_tf=True,
        max_features=50000,
    )

    return FeatureUnion(
        [
            ("word_tfidf", word_features),
            ("character_tfidf", character_features),
        ]
    )


def build_models() -> dict[str, Pipeline]:
    logistic_regression = Pipeline(
        [
            ("features", build_feature_extractor()),
            (
                "classifier",
                LogisticRegression(
                    max_iter=2000,
                    class_weight="balanced",
                    random_state=RANDOM_SEED,
                ),
            ),
        ]
    )

    linear_svm = Pipeline(
        [
            ("features", build_feature_extractor()),
            (
                "classifier",
                LinearSVC(
                    class_weight="balanced",
                    random_state=RANDOM_SEED,
                ),
            ),
        ]
    )

    return {
        "tfidf_logistic_regression": logistic_regression,
        "tfidf_linear_svm": linear_svm,
    }


def evaluate_model(
    model: BaseEstimator,
    texts: pd.Series,
    labels: pd.Series,
) -> dict[str, Any]:
    predictions = model.predict(texts)

    report = classification_report(
        labels,
        predictions,
        output_dict=True,
        zero_division=0,
    )

    label_names = sorted(labels.unique().tolist())

    matrix = confusion_matrix(
        labels,
        predictions,
        labels=label_names,
    )

    return {
        "accuracy": float(
            accuracy_score(labels, predictions)
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


def save_json(
    file_path: Path,
    data: dict[str, Any],
) -> None:
    file_path.write_text(
        json.dumps(
            data,
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Train TF-IDF Logistic Regression "
            "and Linear SVM models."
        )
    )

    parser.add_argument(
        "--dataset-dir",
        type=Path,
        required=True,
        help=(
            "Directory containing train.csv, "
            "validation.csv and test.csv."
        ),
    )

    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="Directory for trained artifacts.",
    )

    parser.add_argument(
        "--task",
        type=str,
        default="hate_speech",
        choices=["hate_speech", "sentiment"],
    )

    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()

    dataset_directory = arguments.dataset_dir.resolve()
    output_directory = arguments.output_dir.resolve()

    output_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    train_texts, train_labels = load_split(
        dataset_directory,
        "train",
    )

    validation_texts, validation_labels = load_split(
        dataset_directory,
        "validation",
    )

    test_texts, test_labels = load_split(
        dataset_directory,
        "test",
    )

    models = build_models()

    experiment_results: dict[str, Any] = {
        "task": arguments.task,
        "random_seed": RANDOM_SEED,
        "dataset_directory": str(dataset_directory),
        "training_samples": len(train_texts),
        "validation_samples": len(validation_texts),
        "test_samples": len(test_texts),
        "models": {},
    }

    best_model_name: str | None = None
    best_validation_f1 = -1.0

    for model_name, model in models.items():
        print(f"\nTraining: {model_name}")

        model.fit(
            train_texts,
            train_labels,
        )

        validation_metrics = evaluate_model(
            model,
            validation_texts,
            validation_labels,
        )

        test_metrics = evaluate_model(
            model,
            test_texts,
            test_labels,
        )

        model_directory = (
            output_directory / model_name
        )

        model_directory.mkdir(
            parents=True,
            exist_ok=True,
        )

        artifact_path = (
            model_directory / "model.joblib"
        )

        joblib.dump(
            model,
            artifact_path,
            compress=3,
        )

        model_result = {
            "name": model_name,
            "artifact_path": str(artifact_path),
            "validation": validation_metrics,
            "test": test_metrics,
        }

        save_json(
            model_directory / "metrics.json",
            model_result,
        )

        experiment_results["models"][
            model_name
        ] = model_result

        validation_f1 = validation_metrics[
            "macro_f1"
        ]

        print(
            "Validation macro F1:",
            round(validation_f1, 4),
        )

        print(
            "Test macro F1:",
            round(test_metrics["macro_f1"], 4),
        )

        if validation_f1 > best_validation_f1:
            best_validation_f1 = validation_f1
            best_model_name = model_name

    experiment_results["best_model"] = (
        best_model_name
    )

    experiment_results[
        "selection_metric"
    ] = "validation_macro_f1"

    save_json(
        output_directory / "experiment_results.json",
        experiment_results,
    )

    if best_model_name is None:
        raise RuntimeError(
            "No model was trained successfully."
        )

    best_source = (
        output_directory
        / best_model_name
        / "model.joblib"
    )

    best_model = joblib.load(best_source)

    joblib.dump(
        best_model,
        output_directory / "best_model.joblib",
        compress=3,
    )

    print("\nTraining completed.")
    print("Best model:", best_model_name)
    print("Artifacts:", output_directory)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(
            f"Training failed: {error}",
            file=sys.stderr,
        )
        raise