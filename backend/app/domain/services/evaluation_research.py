"""Versioned row-level evidence and reproducible descriptive evaluation."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from app.core.config import ROOT_DIR
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    f1_score,
)


def allowed(path):
    path = Path(path).resolve()
    if not path.is_relative_to((ROOT_DIR / "storage").resolve()):
        raise ValueError("Evidence must be inside project storage.")
    return path


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False, default=str).encode()
    ).hexdigest()


def save_evidence(
    workspace,
    split,
    texts,
    actual,
    predicted,
    labels,
    probabilities,
    configuration,
    explanations=None,
    sources=None,
):
    rows = []
    source = str(
        configuration.get("dataset", {}).get("name")
        or configuration.get("dataset_version_id")
        or "Dataset"
    )
    for i, (text, truth, guess) in enumerate(
        zip(texts, actual, predicted, strict=True)
    ):
        scores = (
            dict(zip(labels, map(float, probabilities[i]), strict=True))
            if probabilities is not None
            else None
        )
        rows.append(
            {
                "id": i,
                "text": str(text),
                "actual": str(truth),
                "predicted": str(guess),
                "correct": str(truth) == str(guess),
                "probabilities": scores,
                "confidence": max(scores.values()) if scores else None,
                "length": len(str(text)),
                "source": str(sources[i]) if sources is not None else source,
                "explanation": explanations[i] if explanations else None,
            }
        )
    evidence = {
        "schema_version": 1,
        "split": split,
        "labels": list(labels),
        "rows": rows,
        "dataset_version_id": configuration.get("dataset_version_id"),
        "label_definitions": configuration.get("dataset", {}).get("label_schema"),
        "evaluation_hash": digest([(r["text"], r["actual"]) for r in rows]),
    }
    path = Path(workspace) / "metrics" / f"{split}_evidence.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(evidence, ensure_ascii=False, allow_nan=False), encoding="utf-8"
    )
    temporary.replace(path)
    return evidence


def load_evidence(experiment, split):
    workspace = (experiment.results or {}).get("workspace") or (
        experiment.configuration or {}
    ).get("output", {}).get("workspace")
    if not workspace:
        return None
    path = allowed(Path(workspace) / "metrics" / f"{split}_evidence.json")
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    # Legacy transformer predictions remain useful without inventing text alignment.
    legacy = allowed(Path(workspace) / "predictions" / f"{split}_predictions.jsonl")
    if not legacy.is_file():
        return None
    records = [
        json.loads(line) for line in legacy.read_text().splitlines() if line.strip()
    ]
    labels_by_id = {}
    for row in records:
        labels_by_id[row["label_id"]] = row["label"]
        labels_by_id[row["predicted_id"]] = row["predicted_label"]
    labels = [labels_by_id[k] for k in sorted(labels_by_id)]
    rows = []
    for i, row in enumerate(records):
        probabilities = row.get("probabilities")
        scores = (
            dict(zip(labels, probabilities))
            if probabilities
            and len(probabilities) == len(labels)
            and sorted(labels_by_id) == list(range(len(labels)))
            else None
        )
        rows.append(
            {
                "id": i,
                "text": None,
                "actual": row["label"],
                "predicted": row["predicted_label"],
                "correct": row["label"] == row["predicted_label"],
                "probabilities": scores,
                "confidence": max(scores.values()) if scores else None,
                "length": None,
                "source": "Legacy prediction artifact",
                "explanation": None,
            }
        )
    return {
        "schema_version": 0,
        "split": split,
        "labels": labels,
        "rows": rows,
        "evaluation_hash": None,
        "label_definitions": None,
        "warning": "Legacy predictions have no immutable text snapshot. Text, length and comparable-run checks are unavailable; a new run saves complete evidence.",
    }


def summarize(evidence):
    rows = evidence["rows"]
    labels = evidence["labels"]
    if not rows:
        raise ValueError("No evaluation rows available.")
    actual, predicted = [r["actual"] for r in rows], [r["predicted"] for r in rows]
    correct = np.array([r["correct"] for r in rows], dtype=float)
    n = len(rows)
    # Wilson 95% score interval for the observed accuracy.
    p, z = float(correct.mean()), 1.959963984540054
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    radius = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    # Seeded multinomial bootstrap over confusion cells avoids O(n*replicates) work.
    matrix = confusion_matrix(actual, predicted, labels=labels)
    draws = (
        np.random.default_rng(42)
        .multinomial(n, matrix.flatten() / n, size=1000)
        .reshape(1000, len(labels), len(labels))
    )
    tp = np.diagonal(draws, axis1=1, axis2=2)
    denominator = draws.sum(axis=1) + draws.sum(axis=2)
    values = np.divide(
        2 * tp, denominator, out=np.zeros_like(tp, dtype=float), where=denominator != 0
    ).mean(axis=1)
    bins = []
    for index in range(10):
        bucket = [
            r
            for r in rows
            if r["confidence"] is not None
            and min(int(r["confidence"] * 10), 9) == index
        ]
        bins.append(
            {
                "lower": index / 10,
                "upper": (index + 1) / 10,
                "count": len(bucket),
                "accuracy": sum(r["correct"] for r in bucket) / len(bucket)
                if bucket
                else None,
                "confidence": sum(r["confidence"] for r in bucket) / len(bucket)
                if bucket
                else None,
            }
        )
    available = sum(b["count"] for b in bins)
    ece = (
        sum(
            b["count"] * abs(b["accuracy"] - b["confidence"])
            for b in bins
            if b["count"]
        )
        / available
        if available
        else None
    )
    return {
        "count": n,
        "accuracy": p,
        "macro_f1": float(
            f1_score(actual, predicted, labels=labels, average="macro", zero_division=0)
        ),
        "accuracy_interval": [centre - radius, centre + radius],
        "macro_f1_interval": np.quantile(values, [0.025, 0.975]).tolist(),
        "interval_method": "95% Wilson accuracy interval; 1,000 seeded IID row bootstrap samples for macro F1, fixed label set. Descriptive; correlated examples can make intervals too narrow.",
        "labels": labels,
        "matrix": matrix.tolist(),
        "classification_report": classification_report(
            actual, predicted, labels=labels, output_dict=True, zero_division=0
        ),
        "confidence_bins": bins,
        "expected_calibration_error": ece,
        "confidence_count": available,
    }


def compatibility(left, right):
    concerns = []
    for key, label in [
        ("dataset_version_id", "dataset version"),
        ("split", "evaluation split"),
        ("labels", "label set"),
        ("label_definitions", "label definitions"),
        ("evaluation_hash", "evaluation examples"),
    ]:
        if left.get(key) is None or right.get(key) is None:
            concerns.append(f"Missing {label} evidence")
        elif left[key] != right[key]:
            concerns.append(f"Different {label}")
    return {"comparable": not concerns, "concerns": concerns}


def seed_configuration(configuration):
    # Exclude identity/output metadata, keep every setting affecting fitting.
    return {
        k: v
        for k, v in configuration.items()
        if k
        not in {
            "random_seed",
            "experiment_id",
            "experiment_name",
            "experiment_description",
            "model_name",
            "model_version",
            "output",
            "research_question",
            "research_notes",
        }
    }
