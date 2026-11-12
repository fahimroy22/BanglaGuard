"""Deterministic dataset analysis and preview-first, immutable preparation.

No learned preprocessing is fitted here. Similarity search is bounded and explicitly
reports its coverage; exact checks always cover every loaded row.
"""

from __future__ import annotations

import csv
import hashlib
import json
import random
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd
from app.domain.services.dataset_artifacts import DatasetArtifactService
from app.schemas.dataset_research import Preparation
from sklearn.model_selection import train_test_split

MAX_ROWS = 100_000
MAX_BYTES = 50 * 1024 * 1024
SPLITS = ("train", "validation", "test")


def fingerprint(value):
    return hashlib.sha256(
        json.dumps(
            value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode()
    ).hexdigest()


def normalized(text):
    return " ".join(unicodedata.normalize("NFC", text).split())


def text_group(text):
    return hashlib.sha256(normalized(text).encode()).hexdigest()[:24]


def read_csv(path):
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("Analysis supports files up to 50 MB each.")
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        columns = reader.fieldnames or []
        if not columns or len(columns) != len(set(columns)):
            raise ValueError("CSV needs unique column names.")
        rows = []
        for row in reader:
            if None in row or any(v is None for v in row.values()):
                raise ValueError(
                    "CSV has inconsistent columns; fix the malformed rows first."
                )
            if len(rows) >= MAX_ROWS:
                raise ValueError(
                    "Analysis supports up to 100,000 rows; no rows were silently omitted."
                )
            rows.append(row)
    return columns, rows


def load_registered(dataset):
    service = DatasetArtifactService()
    inventory = service.get_file_inventory(dataset_version=dataset)["files"]
    available = {f["key"] for f in inventory if f["exists"]}
    # Split files are counted instead of adding their combined processed copy.
    if all(k in available for k in SPLITS):
        keys = SPLITS
    elif any(k in available for k in SPLITS):
        raise ValueError(
            "Some split files are missing. Restore them before analyzing or preparing this version."
        )
    elif "processed" in available:
        keys = ("processed",)
    else:
        raise ValueError("A processed CSV or all three split CSVs are required.")
    records = []
    for key in keys:
        artifact = service.get_download_file(dataset_version=dataset, file_key=key)
        columns, rows = read_csv(Path(artifact["path"]))
        if not {"text", "label"}.issubset(columns):
            raise ValueError("Dataset files must contain text and label columns.")
        for i, row in enumerate(rows, 2):
            records.append(
                {
                    "id": f"{key}:{i}",
                    "row_number": i,
                    "split": key if key in SPLITS else "unsplit",
                    "text": row["text"],
                    "label": row["label"],
                    "group": row.get("group", ""),
                    "source_label": row["label"],
                }
            )
    if len(records) > MAX_ROWS:
        raise ValueError("Analysis supports up to 100,000 rows across splits.")
    return records


def analyze(records, task):
    groups = defaultdict(list)
    for row in records:
        groups[text_group(row["text"])].append(row)
    flags = defaultdict(set)
    conflicts = []
    for key, members in groups.items():
        if not normalized(members[0]["text"]):
            continue
        if len(members) > 1:
            for r in members:
                flags[r["id"]].add("duplicates")
        if len({r["label"] for r in members}) > 1:
            conflicts.append(
                {
                    "id": key,
                    "text": members[0]["text"],
                    "labels": sorted({r["label"] for r in members}),
                    "rows": [r["id"] for r in members],
                }
            )
            for r in members:
                flags[r["id"]].add("conflicts")
        if len({r["split"] for r in members} & set(SPLITS)) > 1:
            for r in members:
                flags[r["id"]].add("overlap")
    labels = Counter(r["label"] for r in records)
    scripts = Counter()
    lengths = Counter()
    words = defaultdict(Counter)
    examples = defaultdict(list)
    train_labels = {r["label"] for r in records if r["split"] == "train"}
    for r in records:
        text, label = r["text"], r["label"]
        if not text.strip():
            flags[r["id"]].add("empty_text")
        if not label.strip():
            flags[r["id"]].add("empty_label")
        if (
            task == "sentiment" and label not in {"positive", "negative", "neutral"}
        ) or (r["split"] in ("validation", "test") and label not in train_labels):
            flags[r["id"]].add("invalid_labels")
        if "\ufffd" in text or any(
            unicodedata.category(c) == "Cc" and c not in "\n\r\t" for c in text
        ):
            flags[r["id"]].add("unusual_characters")
        bn, latin = (
            bool(re.search("[\u0980-\u09ff]", text)),
            bool(re.search("[A-Za-z]", text)),
        )
        script = (
            "Mixed Bangla/Latin"
            if bn and latin
            else "Bangla script"
            if bn
            else "Latin script"
            if latin
            else "Other / empty"
        )
        scripts[script] += 1
        n = len(text)
        lengths[
            "0–50"
            if n <= 50
            else "51–150"
            if n <= 150
            else "151–300"
            if n <= 300
            else "301–1000"
            if n <= 1000
            else "1001+"
        ] += 1
        if n > 1000:
            flags[r["id"]].add("long_text")
        if len(examples[label]) < 3:
            examples[label].append(text)
        tokens = text.split()
        words[label].update(tokens)
        words[label].update(" ".join(tokens[i : i + 2]) for i in range(len(tokens) - 1))
    # Bounded inverted-shingle candidate retrieval, deterministic sample by hash.
    unique = sorted(
        (
            members[0]
            for members in groups.values()
            if len(normalized(members[0]["text"])) >= 12
        ),
        key=lambda r: text_group(r["text"]),
    )
    sample = unique[:2000]
    inverted, shingle_sets, near = defaultdict(list), {}, []
    comparisons = 0
    for row in sample:
        text = normalized(row["text"])[:500]
        shingles = {text[i : i + 5] for i in range(len(text) - 4)}
        candidates = Counter()
        for shingle in sorted(shingles):
            candidates.update(inverted[shingle][-30:])
        for other, _ in candidates.most_common(30):
            a = shingle_sets[other]
            score = len(shingles & a) / len(shingles | a)
            comparisons += 1
            if score >= 0.85 and len(near) < 200:
                near.append(
                    {
                        "left": other,
                        "right": row["id"],
                        "similarity": round(score, 4),
                        "left_text": next(
                            r["text"] for r in sample if r["id"] == other
                        ),
                        "right_text": row["text"],
                    }
                )
                flags[other].add("near_duplicates")
                flags[row["id"]].add("near_duplicates")
        shingle_sets[row["id"]] = shingles
        for shingle in shingles:
            inverted[shingle].append(row["id"])
    counts = Counter(key for values in flags.values() for key in values)
    splits = Counter(r["split"] for r in records)
    checks = []
    for key, severity, title, detail in [
        (
            "empty_text",
            "blocking",
            "Missing text",
            "Rows need text or explicit exclusion.",
        ),
        (
            "empty_label",
            "blocking",
            "Missing labels",
            "Assign a label or explicitly exclude these rows.",
        ),
        (
            "invalid_labels",
            "blocking",
            "Unsupported or unseen labels",
            "Sentiment expects positive, negative and neutral. Evaluation labels must occur in training.",
        ),
        (
            "overlap",
            "concern",
            "Text shared across splits",
            "Normalized exact matches can inflate evaluation scores. Preserve benchmarks or explicitly create new splits.",
        ),
        (
            "conflicts",
            "concern",
            "Conflicting labels",
            "Review every normalized text group before deduplicating it.",
        ),
        (
            "duplicates",
            "concern",
            "Repeated text",
            "Count includes all members of repeated normalized text groups.",
        ),
        (
            "near_duplicates",
            "concern",
            "Possible near duplicates",
            "Bounded character-shingle search; review suggested pairs. No automatic removal.",
        ),
        (
            "unusual_characters",
            "information",
            "Unusual characters",
            "Replacement/control characters need inspection; they are not automatically removed.",
        ),
        (
            "long_text",
            "information",
            "Long text",
            "Over 1,000 characters. Actual tokenizer truncation depends on the selected model.",
        ),
    ]:
        checks.append(
            {
                "key": key,
                "severity": severity,
                "title": title,
                "count": counts[key],
                "detail": detail,
            }
        )
    if not splits["train"]:
        checks.append(
            {
                "key": "missing_train",
                "severity": "blocking",
                "title": "No training split",
                "count": 1,
                "detail": "Choose a split strategy before training.",
            }
        )
    if len(train_labels - {""}) < 2:
        checks.append(
            {
                "key": "training_classes",
                "severity": "blocking",
                "title": "Fewer than two training classes",
                "count": 1,
                "detail": "Training needs at least two classes.",
            }
        )
    if not splits["validation"] or not splits["test"]:
        checks.append(
            {
                "key": "missing_evaluation",
                "severity": "blocking",
                "title": "Missing evaluation split",
                "count": 1,
                "detail": "Training, validation and test splits must all be nonempty.",
            }
        )
    nonempty = [n for label, n in labels.items() if label]
    ratio = round(max(nonempty) / min(nonempty), 2) if nonempty else 0
    checks.append(
        {
            "key": "imbalance",
            "severity": "concern",
            "title": "Class imbalance",
            "count": int(ratio > 3),
            "detail": f"Largest / smallest observed class ratio: {ratio}. Concern threshold: 3.",
        }
    )
    chart_rows = sorted(records, key=lambda r: hashlib.sha256(r["id"].encode()).hexdigest())[:1500]
    visualization = {
        "points": [{"id": r["id"], "characters": len(r["text"]),
                    "words": len(r["text"].split()), "label": r["label"],
                    "split": r["split"], "text": r["text"][:300]} for r in chart_rows],
        "total": len(records),
        "label_splits": {label: dict(Counter(r["split"] for r in records if r["label"] == label)) for label in labels},
    }
    report = {
        "visualization": visualization,
        "total_rows": len(records),
        "labels": dict(labels),
        "splits": dict(splits),
        "scripts": dict(scripts),
        "lengths": dict(lengths),
        "label_examples": dict(examples),
        "frequent_phrases": {
            k: [{"phrase": w, "count": n} for w, n in c.most_common(15)]
            for k, c in words.items()
        },
        "checks": checks,
        "conflicts": conflicts,
        "conflict_groups": len(conflicts),
        "near_pairs": near,
        "near_coverage": {
            "unique_eligible": len(unique),
            "examined": len(sample),
            "comparisons": comparisons,
            "pair_limit": 200,
            "threshold": 0.85,
            "method": "Character 5-shingle Jaccard on bounded text prefixes; max 2,000 unique texts, 500 characters/text, 30 candidates/text, 200 reported pairs. Not exhaustive.",
        },
        "training_ready": not any(
            c["severity"] == "blocking" and c["count"] for c in checks
        ),
        "normalization": "NFC Unicode and collapsed whitespace for duplicate checks only; stored text unchanged.",
    }
    return report, flags


def prepare(records, config: Preparation, task):
    result, changes, errors = [], [], []
    groups = defaultdict(set)
    for r in records:
        groups[text_group(r["text"])].add(r["label"])
    seen = set()
    allowed = {"positive", "negative", "neutral"} if task == "sentiment" else None
    for row in records:
        r = dict(row)
        reasons = []
        key = text_group(r["text"])
        decision = config.conflicts.get(key)
        if decision is not None and decision != "__exclude__":
            if decision not in groups[key]:
                raise ValueError(
                    "A conflict decision must use a label already in its group."
                )
            r["label"] = decision
        if config.normalize_unicode:
            r["text"] = unicodedata.normalize("NFC", r["text"])
        if config.trim_whitespace:
            r["text"] = r["text"].strip()
        if config.collapse_whitespace:
            r["text"] = " ".join(r["text"].split())
        if decision == "__exclude__":
            reasons.append("conflict_excluded")
        if config.drop_empty and (not r["text"].strip() or not r["label"].strip()):
            reasons.append("empty")
        if config.drop_invalid_labels and allowed and r["label"] not in allowed:
            reasons.append("invalid_label")
        if config.drop_replacement and "\ufffd" in r["text"]:
            reasons.append("replacement_character")
        # Never choose the first label of a conflicting group silently.
        dedup_key = (
            text_group(r["text"]),
            r["label"],
            r["split"] if config.split_strategy == "preserve" else "",
        )
        if config.drop_duplicates and not reasons:
            if len(groups[key]) > 1 and decision is None:
                errors.append(
                    "Resolve conflicting labels before deduplication, or disable deduplication."
                )
            elif dedup_key in seen:
                reasons.append("duplicate_with_same_label")
            seen.add(dedup_key)
        if not reasons:
            result.append(r)
        if reasons or r["text"] != row["text"] or r["label"] != row["label"]:
            changes.append(
                {
                    "source_id": row["id"],
                    "source_split": row["split"],
                    "action": "removed" if reasons else "changed",
                    "reasons": reasons or ["text_or_label_changed"],
                    "before_text": row["text"],
                    "after_text": r["text"],
                    "before_label": row["label"],
                    "after_label": r["label"],
                }
            )
    if config.split_strategy != "preserve" and result:
        try:
            if config.split_strategy == "stratified":
                train, rest = train_test_split(
                    result,
                    train_size=config.train_fraction,
                    random_state=config.seed,
                    stratify=[r["label"] for r in result],
                )
                val, test = train_test_split(
                    rest,
                    train_size=config.validation_fraction / (1 - config.train_fraction),
                    random_state=config.seed,
                    stratify=[r["label"] for r in rest],
                )
            else:
                grouped = defaultdict(list)
                for r in result:
                    grouped[r["group"] or text_group(r["text"])].append(r)
                values = sorted(grouped.items())
                random.Random(config.seed).shuffle(values)
                train, val, test = [], [], []
                for _, members in values:
                    target = (
                        train
                        if len(train) < len(result) * config.train_fraction
                        else val
                        if len(val) < len(result) * config.validation_fraction
                        else test
                    )
                    target.extend(members)
            for name, subset in zip(SPLITS, (train, val, test)):
                for r in subset:
                    r["split"] = name
        except ValueError:
            errors.append(
                "Too few examples per class for these stratified splits. Add data or adjust fractions."
            )
    report, _ = analyze(result, task)
    if len(result) < 20:
        errors.append("At least 20 rows must remain.")
    if not report["training_ready"]:
        errors.append("Resolve blocking readiness issues before registration.")
    return result, changes, sorted(set(errors)), report


def preview(records, config, task):
    result, changes, errors, report = prepare(records, config, task)
    return (
        {
            "token": fingerprint(
                {"rows": records, "preparation": config.model_dump(), "task": task}
            ),
            "before_rows": len(records),
            "after_rows": len(result),
            "removed_rows": len(records) - len(result),
            "changed_rows": sum(c["action"] == "changed" for c in changes),
            "change_count": len(changes),
            "changes": changes[:100],
            "report": report,
            "errors": errors,
            "can_register": not errors,
        },
        result,
        changes,
    )


def write_version(
    directory, original, result, changes, report, config, parent_id, metadata
):
    directory.mkdir(parents=True, exist_ok=False)
    files = {}
    for key, rows in {
        "processed": result,
        **{s: [r for r in result if r["split"] == s] for s in SPLITS},
    }.items():
        path = directory / f"{key}.csv"
        pd.DataFrame(
            [
                {"text": r["text"], "label": r["label"], "group": r["group"]}
                for r in rows
            ],
            columns=["text", "label", "group"],
        ).to_csv(path, index=False)
        files[key] = str(path)
    (directory / "source-snapshot.json").write_text(
        json.dumps(original, ensure_ascii=False), encoding="utf-8"
    )
    provenance = [
        {
            "source_id": r["id"],
            "target_split": r["split"],
            "text_hash": text_group(r["text"]),
        }
        for r in result
    ]
    change_report = {
        "parent_dataset_version_id": parent_id,
        "metadata": metadata,
        "preparation": config.model_dump(),
        "changes": changes,
        "provenance": provenance,
        "analysis": report,
    }
    (directory / "change-report.json").write_text(
        json.dumps(change_report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    checksum = hashlib.sha256((directory / "processed.csv").read_bytes()).hexdigest()
    manifest = {
        "required_columns": ["text", "label"],
        "files": files,
        "checksum_sha256": checksum,
        "samples": {
            "total": len(result),
            **{s: report["splits"].get(s, 0) for s in SPLITS},
        },
        "label_distribution": report["labels"],
        "split_strategy": config.split_strategy,
        "random_seed": config.seed,
    }
    (directory / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return checksum
