from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from time import perf_counter
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
    resolved_path = resolve_artifact_path(artifact_path)

    if resolved_path.is_dir():
        resolved_path = resolved_path / "model.joblib"

    if not resolved_path.exists():
        raise ModelArtifactError(f"Model artifact not found: {resolved_path}")

    return joblib.load(resolved_path)


def softmax(values: np.ndarray) -> np.ndarray:
    shifted = values - np.max(values)

    exponentials = np.exp(shifted)

    return exponentials / exponentials.sum()


def explain_linear_features(model, text: str, prediction: str) -> dict[str, Any]:
    """Decompose the target class decision score, not its probability."""
    classifier = model.named_steps["classifier"]
    vectorizer = model.named_steps["features"]
    classes = [str(label) for label in classifier.classes_]
    target = classes.index(prediction)
    estimator = classifier
    sign = 1.0
    if hasattr(classifier, "estimators_"):
        if len(classifier.estimators_) == 1 and len(classes) == 2:
            estimator = classifier.estimators_[0]
            sign = -1.0 if target == 0 else 1.0
        else:
            estimator = classifier.estimators_[target]
        row = 0
    elif hasattr(classifier, "coef_"):
        row = target if classifier.coef_.shape[0] > 1 else 0
        if classifier.coef_.shape[0] == 1 and len(classes) == 2 and target == 0:
            sign = -1.0
    else:
        return {}
    if not hasattr(estimator, "coef_"):
        return {}
    values = vectorizer.transform([text]).tocsr()
    names = vectorizer.get_feature_names_out()
    weights = estimator.coef_[row] * sign
    contributions = [
        {"feature": str(names[index]), "score": float(value * weights[index])}
        for index, value in zip(values.indices, values.data, strict=True)
    ]
    contributions.sort(key=lambda item: abs(item["score"]), reverse=True)
    intercept = float(estimator.intercept_[row]) * sign
    total = sum(item["score"] for item in contributions)
    unknown = sorted(
        set(vectorizer.build_analyzer()(text)) - set(vectorizer.vocabulary_)
    )
    return {
        "attribution_method": "tfidf_times_linear_coefficient",
        "target_label": prediction,
        "score_units": "decision_score",
        "features": contributions[:50],
        "intercept": intercept,
        "decision_score": intercept + total,
        "omitted_contribution": sum(item["score"] for item in contributions[50:]),
        "unknown_features": unknown[:30],
        "unknown_feature_count": len(unknown),
        "feature_count": len(contributions),
    }


def predict_with_classical_model(
    artifact_path: str,
    text: str,
    include_explanation: bool = True,
) -> ClassicalPrediction:
    started = perf_counter()
    model = load_classical_model(artifact_path)
    loaded = perf_counter()

    prediction = str(model.predict([text])[0])

    classifier = model.named_steps["classifier"]

    classes = [str(label) for label in classifier.classes_]

    if hasattr(model, "predict_proba"):
        raw_probabilities = model.predict_proba([text])[0]

        probability_method = "logistic_regression_predict_proba"

    elif hasattr(model, "decision_function"):
        decision_scores = model.decision_function([text])

        if decision_scores.ndim == 1:
            decision_scores = np.column_stack(
                [
                    -decision_scores,
                    decision_scores,
                ]
            )

        raw_probabilities = softmax(decision_scores[0])

        probability_method = "softmax_of_uncalibrated_svm_scores"

    else:
        raw_probabilities = np.zeros(len(classes))

        predicted_index = classes.index(prediction)

        raw_probabilities[predicted_index] = 1.0

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

    inferred = perf_counter()
    attribution = (
        explain_linear_features(model, text, prediction) if include_explanation else {}
    )
    explained = perf_counter()
    return ClassicalPrediction(
        label=prediction,
        confidence=confidence,
        probabilities=probabilities,
        explanation={
            "method": "tfidf_classical_model",
            "probability_method": probability_method,
            **attribution,
            "runtime": {
                "model_load_ms": (loaded - started) * 1000,
                "prediction_ms": (inferred - loaded) * 1000,
                "explanation_ms": (explained - inferred) * 1000
                if include_explanation
                else 0,
                "explanation_requested": include_explanation,
                "normalized_text": text,
                "truncated": False,
                "model_input_preview": text,
            },
            "warning": "Model scores are not a guarantee of correctness.",
        },
    )
