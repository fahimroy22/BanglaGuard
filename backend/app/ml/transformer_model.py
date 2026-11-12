from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache, wraps
from threading import RLock
from pathlib import Path
from time import perf_counter
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

    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")

    return torch.device("cpu")


@lru_cache(maxsize=4)
def load_transformer_artifact(
    artifact_path: str,
    tokenizer_path: str | None = None,
):
    resolved_path = resolve_transformer_path(artifact_path)

    if not resolved_path.exists():
        raise TransformerArtifactError(
            f"Transformer artifact not found: {resolved_path}"
        )

    resolved_tokenizer_path = (
        resolve_transformer_path(tokenizer_path) if tokenizer_path else resolved_path
    )

    if not resolved_tokenizer_path.exists():
        raise TransformerArtifactError(
            f"Transformer tokenizer artifact not found: {resolved_tokenizer_path}"
        )

    tokenizer = AutoTokenizer.from_pretrained(
        resolved_tokenizer_path,
    )

    model = AutoModelForSequenceClassification.from_pretrained(
        resolved_path,
    )

    device = get_torch_device()

    model.to(device)
    model.eval()

    return tokenizer, model, device


def compute_gradient_input_attributions(
    tokenizer,
    model,
    encoded: dict[str, torch.Tensor],
    predicted_index: int,
) -> list[dict[str, float | str]]:
    input_ids = encoded.get("input_ids")

    if input_ids is None:
        return []

    embedding_layer = model.get_input_embeddings()

    input_embeddings = embedding_layer(input_ids).detach()

    input_embeddings.requires_grad_(True)

    forward_inputs = {
        key: value for key, value in encoded.items() if key != "input_ids"
    }

    model.zero_grad(set_to_none=True)

    output = model(
        inputs_embeds=input_embeddings,
        **forward_inputs,
    )

    target_logit = output.logits[
        0,
        predicted_index,
    ]

    target_logit.backward()

    gradients = input_embeddings.grad

    if gradients is None:
        return []

    raw_scores = (gradients * input_embeddings).sum(dim=-1)[0]

    attention_mask = encoded.get("attention_mask")

    token_ids = input_ids[0].detach().cpu().tolist()

    tokens = tokenizer.convert_ids_to_tokens(token_ids)

    scores = raw_scores.detach().cpu()

    valid_indices: list[int] = []

    special_ids = set(tokenizer.all_special_ids)

    for index, token_id in enumerate(token_ids):
        if token_id in special_ids:
            continue

        if attention_mask is not None:
            if (
                int(
                    attention_mask[
                        0,
                        index,
                    ].item()
                )
                == 0
            ):
                continue

        valid_indices.append(index)

    if not valid_indices:
        return []

    selected_scores = torch.tensor(
        [float(scores[index].item()) for index in valid_indices],
        dtype=torch.float32,
    )

    max_absolute = float(selected_scores.abs().max().item())

    if max_absolute > 0:
        selected_scores = selected_scores / max_absolute

    attributions: list[dict[str, float | str]] = []

    for position, index in enumerate(valid_indices):
        token = tokens[index]

        clean_token = token.replace(
            "##",
            "",
        )

        attributions.append(
            {
                "token": clean_token,
                "score": round(
                    float(selected_scores[position].item()),
                    6,
                ),
            }
        )

    model.zero_grad(set_to_none=True)

    return attributions


_inference_lock = RLock()


def serial_inference(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        # Gradient explanations mutate cached model gradients: serialize inference.
        with _inference_lock:
            return function(*args, **kwargs)

    return wrapped


@serial_inference
def predict_with_transformer(
    artifact_path: str,
    text: str,
    tokenizer_path: str | None = None,
    max_length: int = 128,
    include_explanation: bool = True,
) -> TransformerPrediction:
    started = perf_counter()
    if not 16 <= max_length <= 512:
        raise TransformerArtifactError(
            "Transformer inference max_length must be between 16 and 512."
        )

    (
        tokenizer,
        model,
        device,
    ) = load_transformer_artifact(
        artifact_path,
        tokenizer_path,
    )

    loaded = perf_counter()
    normalized_text = normalize(text)

    encoded = tokenizer(
        normalized_text,
        return_tensors="pt",
        truncation=True,
        max_length=max_length,
    )

    full_ids = tokenizer(normalized_text, truncation=False, add_special_tokens=True)[
        "input_ids"
    ]
    input_preview = tokenizer.decode(encoded["input_ids"][0], skip_special_tokens=True)
    token_count = int(encoded["input_ids"].shape[-1])
    encoded = {key: value.to(device) for key, value in encoded.items()}

    with torch.inference_mode():
        output = model(**encoded)

        probability_tensor = torch.softmax(
            output.logits,
            dim=-1,
        )[0]

    probability_values = probability_tensor.detach().cpu().tolist()

    id2label = {int(key): str(value) for key, value in model.config.id2label.items()}

    probabilities = {
        id2label[index]: round(
            float(probability),
            6,
        )
        for index, probability in enumerate(probability_values)
    }

    predicted_index = int(probability_tensor.argmax().item())

    predicted_label = id2label[predicted_index]

    confidence = probabilities[predicted_label]

    inferred = perf_counter()
    token_attributions = (
        compute_gradient_input_attributions(
            tokenizer=tokenizer,
            model=model,
            encoded=encoded,
            predicted_index=(predicted_index),
        )
        if include_explanation
        else []
    )
    explained = perf_counter()

    return TransformerPrediction(
        label=predicted_label,
        confidence=confidence,
        probabilities=probabilities,
        explanation={
            "runtime": {
                "model_load_ms": (loaded - started) * 1000,
                "prediction_ms": (inferred - loaded) * 1000,
                "explanation_ms": (explained - inferred) * 1000
                if include_explanation
                else 0,
                "explanation_requested": include_explanation,
                "normalized_text": normalized_text,
                "model_input_preview": input_preview,
                "truncated": len(full_ids) > token_count,
                "original_tokens": len(full_ids),
                "processed_tokens": token_count,
                "maximum_tokens": max_length,
                "preview_note": "Decoded tokens shown; spacing may differ after tokenization.",
            },
            "method": ("banglabert_sequence_classification"),
            "attribution_method": ("gradient_x_input"),
            "target_label": (predicted_label),
            "normalization": ("csebuetnlp_normalizer"),
            "device": str(device),
            "max_sequence_length": (max_length),
            "tokens": (token_attributions),
        },
    )
