from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from app.core.config import ROOT_DIR


class ModelArtifactError(Exception):
    pass


@dataclass(frozen=True)
class ClassicalPrediction:
    label: str
    confidence: float
    probabilities: dict[str, float]
    explanation: dict[str, Any]


def resolve_artifact_path(
    artifact_path: str,
) -> Path:
    path = Path(artifact_path)

    if not path.is_absolute():
        path = ROOT_DIR / path

    return path.resolve()


@lru_cache(maxsize=16)
def load_classical_model(
    artifact_path: str,
):
    resolved_path = resolve_artifact_path(
        artifact_path
    )

    if resolved_path.is_dir():
        resolved_path = (
            resolved_path / "model.joblib"
        )

    if not resolved_path.exists():
        raise ModelArtifactError(
            f"Model artifact not found: {resolved_path}"
        )

    return joblib.load(resolved_path)


def softmax(values: np.ndarray) -> np.ndarray:
    shifted = values - np.max(values)

    exponentials = np.exp(shifted)

    return exponentials / exponentials.sum()


def predict_with_classical_model(
    artifact_path: str,
    text: str,
) -> ClassicalPrediction:
    model = load_classical_model(
        artifact_path
    )

    prediction = str(
        model.predict([text])[0]
    )

    classifier = model.named_steps[
        "classifier"
    ]

    classes = [
        str(label)
        for label in classifier.classes_
    ]

    if hasattr(model, "predict_proba"):
        raw_probabilities = model.predict_proba(
            [text]
        )[0]

        probability_method = (
            "logistic_regression_predict_proba"
        )

    elif hasattr(model, "decision_function"):
        decision_scores = model.decision_function(
            [text]
        )

        if decision_scores.ndim == 1:
            decision_scores = np.column_stack(
                [
                    -decision_scores,
                    decision_scores,
                ]
            )

        raw_probabilities = softmax(
            decision_scores[0]
        )

        probability_method = (
            "softmax_of_uncalibrated_svm_scores"
        )

    else:
        raw_probabilities = np.zeros(
            len(classes)
        )

        predicted_index = classes.index(
            prediction
        )

        raw_probabilities[
            predicted_index
        ] = 1.0

        probability_method = "hard_prediction"

    probabilities = {
        label: round(float(probability), 6)
        for label, probability in zip(
            classes,
            raw_probabilities,
            strict=True,
        )
    }

    confidence = probabilities.get(
        prediction,
        max(probabilities.values()),
    )

    return ClassicalPrediction(
        label=prediction,
        confidence=confidence,
        probabilities=probabilities,
        explanation={
            "method": "tfidf_classical_model",
            "probability_method": probability_method,
            "warning": (
                "Linear SVM scores are not calibrated "
                "probabilities unless calibration is applied."
            ),
        },
    )