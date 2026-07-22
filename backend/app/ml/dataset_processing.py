import hashlib
import json
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd
from sklearn.model_selection import train_test_split


REQUIRED_COLUMNS = {"text", "label"}


class DatasetValidationError(Exception):
    pass


@dataclass(frozen=True)
class DatasetProcessingResult:
    dataset_id: uuid.UUID
    total_samples: int
    train_samples: int
    validation_samples: int
    test_samples: int
    label_schema: dict[str, Any]
    manifest_path: str
    checksum: str


def calculate_checksum(file_path: Path) -> str:
    digest = hashlib.sha256()

    with file_path.open("rb") as file:
        while chunk := file.read(8192):
            digest.update(chunk)

    return digest.hexdigest()


def process_dataset(
    source_path: Path,
    output_directory: Path,
    random_seed: int = 42,
) -> DatasetProcessingResult:
    try:
        dataframe = pd.read_csv(source_path)
    except Exception as exc:
        raise DatasetValidationError(
            "The uploaded file is not a valid CSV file."
        ) from exc

    missing_columns = REQUIRED_COLUMNS - set(dataframe.columns)

    if missing_columns:
        missing = ", ".join(sorted(missing_columns))
        raise DatasetValidationError(
            f"Missing required columns: {missing}"
        )

    dataframe = dataframe[["text", "label"]].copy()

    dataframe["text"] = dataframe["text"].astype("string").str.strip()
    dataframe["label"] = dataframe["label"].astype("string").str.strip()

    dataframe = dataframe.dropna(subset=["text", "label"])

    dataframe = dataframe[
        (dataframe["text"] != "")
        & (dataframe["label"] != "")
    ]

    dataframe = dataframe.drop_duplicates(
        subset=["text"],
        keep="first",
    ).reset_index(drop=True)

    if len(dataframe) < 20:
        raise DatasetValidationError(
            "The dataset must contain at least 20 valid unique rows."
        )

    label_counts = dataframe["label"].value_counts()

    if len(label_counts) < 2:
        raise DatasetValidationError(
            "The dataset must contain at least two labels."
        )

    # Use stratification only when every class has enough samples.
    stratify_labels = (
        dataframe["label"]
        if label_counts.min() >= 5
        else None
    )

    train_data, temporary_data = train_test_split(
        dataframe,
        test_size=0.20,
        random_state=random_seed,
        stratify=stratify_labels,
    )

    temporary_counts = temporary_data["label"].value_counts()

    temporary_stratify = (
        temporary_data["label"]
        if temporary_counts.min() >= 2
        else None
    )

    validation_data, test_data = train_test_split(
        temporary_data,
        test_size=0.50,
        random_state=random_seed,
        stratify=temporary_stratify,
    )

    output_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    processed_path = output_directory / "processed.csv"
    train_path = output_directory / "train.csv"
    validation_path = output_directory / "validation.csv"
    test_path = output_directory / "test.csv"
    manifest_path = output_directory / "manifest.json"

    dataframe.to_csv(
        processed_path,
        index=False,
    )

    train_data.to_csv(
        train_path,
        index=False,
    )

    validation_data.to_csv(
        validation_path,
        index=False,
    )

    test_data.to_csv(
        test_path,
        index=False,
    )

    dataset_id = uuid.uuid4()
    checksum = calculate_checksum(processed_path)

    label_distribution = {
        str(label): int(count)
        for label, count in label_counts.items()
    }

    manifest = {
        "dataset_id": str(dataset_id),
        "required_columns": sorted(REQUIRED_COLUMNS),
        "random_seed": random_seed,
        "split_ratio": {
            "train": 0.80,
            "validation": 0.10,
            "test": 0.10,
        },
        "samples": {
            "total": len(dataframe),
            "train": len(train_data),
            "validation": len(validation_data),
            "test": len(test_data),
        },
        "label_distribution": label_distribution,
        "files": {
            "processed": str(processed_path),
            "train": str(train_path),
            "validation": str(validation_path),
            "test": str(test_path),
        },
        "checksum_sha256": checksum,
    }

    manifest_path.write_text(
        json.dumps(
            manifest,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    return DatasetProcessingResult(
        dataset_id=dataset_id,
        total_samples=len(dataframe),
        train_samples=len(train_data),
        validation_samples=len(validation_data),
        test_samples=len(test_data),
        label_schema={
            "labels": list(label_distribution.keys()),
            "distribution": label_distribution,
        },
        manifest_path=str(manifest_path),
        checksum=checksum,
    )