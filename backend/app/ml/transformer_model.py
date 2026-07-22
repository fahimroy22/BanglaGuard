from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import torch
from normalizer import normalize
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
)

from app.core.config import ROOT_DIR


class TransformerArtifactError(Exception):
    pass


@dataclass(frozen=True)
class TransformerPrediction:
    label: str
    confidence: float
    probabilities: dict[str, float]
    explanation: dict[str, Any]


def resolve_transformer_path(
    artifact_path: str,
) -> Path:
    path = Path(artifact_path)

    if not path.is_absolute():
        path = ROOT_DIR / path

    return path.expanduser().resolve()


def get_torch_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")

    if (
        hasattr(torch.backends, "mps")
        and torch.backends.mps.is_available()
    ):
        return torch.device("mps")

    return torch.device("cpu")


@lru_cache(maxsize=4)
def load_transformer_artifact(
    artifact_path: str,
):
    resolved_path = resolve_transformer_path(
        artifact_path
    )

    if not resolved_path.exists():
        raise TransformerArtifactError(
            f"Transformer artifact not found: "
            f"{resolved_path}"
        )

    tokenizer = AutoTokenizer.from_pretrained(
        resolved_path,
    )

    model = (
        AutoModelForSequenceClassification
        .from_pretrained(
            resolved_path,
        )
    )

    device = get_torch_device()

    model.to(device)
    model.eval()

    return tokenizer, model, device


def predict_with_transformer(
    artifact_path: str,
    text: str,
    max_length: int = 128,
) -> TransformerPrediction:
    (
        tokenizer,
        model,
        device,
    ) = load_transformer_artifact(
        artifact_path
    )

    normalized_text = normalize(text)

    encoded = tokenizer(
        normalized_text,
        return_tensors="pt",
        truncation=True,
        max_length=max_length,
    )

    encoded = {
        key: value.to(device)
        for key, value in encoded.items()
    }

    with torch.inference_mode():
        output = model(**encoded)

        probability_tensor = torch.softmax(
            output.logits,
            dim=-1,
        )[0]

    probability_values = (
        probability_tensor
        .detach()
        .cpu()
        .tolist()
    )

    id2label = {
        int(key): str(value)
        for key, value
        in model.config.id2label.items()
    }

    probabilities = {
        id2label[index]: round(
            float(probability),
            6,
        )
        for index, probability
        in enumerate(probability_values)
    }

    predicted_index = int(
        probability_tensor.argmax().item()
    )

    predicted_label = id2label[
        predicted_index
    ]

    confidence = probabilities[
        predicted_label
    ]

    return TransformerPrediction(
        label=predicted_label,
        confidence=confidence,
        probabilities=probabilities,
        explanation={
            "method": (
                "banglabert_sequence_classification"
            ),
            "base_model": "csebuetnlp/banglabert",
            "normalization": (
                "csebuetnlp_normalizer"
            ),
            "device": str(device),
            "warning": (
                "This model was trained on a very small "
                "development dataset and is not suitable "
                "for real moderation decisions."
            ),
        },
    )