import uuid

import pytest
from pydantic import ValidationError

from app.schemas.training import (
    ClassicalTrainingRequest,
    LogisticRegressionTrainingConfiguration,
    TfidfTrainingConfiguration,
)


def build_request(
    **overrides,
) -> ClassicalTrainingRequest:
    values = {
        "dataset_version_id": uuid.uuid4(),
        "experiment_name": "Classical baseline",
        "model_name": "BanglaGuard TF-IDF Model",
        "model_version": "1.0.0",
    }

    values.update(overrides)

    return ClassicalTrainingRequest(**values)


def test_default_training_configuration() -> None:
    payload = build_request()

    assert payload.model_family == ("tfidf_logistic_regression")

    assert payload.random_seed == 42

    assert payload.tfidf.ngram_min == 1
    assert payload.tfidf.ngram_max == 2

    assert payload.classifier.solver == "liblinear"
    assert payload.classifier.penalty == "l2"

    assert payload.classifier.class_weight == "balanced"


def test_invalid_ngram_range_is_rejected() -> None:
    with pytest.raises(ValidationError):
        TfidfTrainingConfiguration(
            ngram_min=3,
            ngram_max=2,
        )


def test_invalid_solver_penalty_is_rejected() -> None:
    with pytest.raises(ValidationError):
        LogisticRegressionTrainingConfiguration(
            solver="lbfgs",
            penalty="l1",
        )


def test_elasticnet_requires_l1_ratio() -> None:
    with pytest.raises(ValidationError):
        LogisticRegressionTrainingConfiguration(
            solver="saga",
            penalty="elasticnet",
        )


def test_valid_elasticnet_configuration() -> None:
    configuration = LogisticRegressionTrainingConfiguration(
        solver="saga",
        penalty="elasticnet",
        l1_ratio=0.5,
    )

    assert configuration.l1_ratio == 0.5


def test_required_training_text_is_trimmed() -> None:
    payload = build_request(
        experiment_name="  Baseline experiment  ",
        model_name="  BanglaGuard Model  ",
    )

    assert payload.experiment_name == ("Baseline experiment")

    assert payload.model_name == "BanglaGuard Model"
