from pathlib import Path

import pandas as pd
import pytest

from app.ml.dataset_processing import (
    DatasetValidationError,
    process_dataset,
)


def test_process_valid_dataset(
    tmp_path: Path,
) -> None:
    source_path = tmp_path / "dataset.csv"
    output_path = tmp_path / "processed"

    rows = []

    for index in range(30):
        rows.append(
            {
                "text": f"sample text {index}",
                "label": (
                    "positive"
                    if index % 2 == 0
                    else "negative"
                ),
            }
        )

    pd.DataFrame(rows).to_csv(
        source_path,
        index=False,
    )

    result = process_dataset(
        source_path,
        output_path,
    )

    assert result.total_samples == 30
    assert result.train_samples == 24
    assert result.validation_samples == 3
    assert result.test_samples == 3

    assert (
        output_path / "manifest.json"
    ).exists()


def test_missing_required_column(
    tmp_path: Path,
) -> None:
    source_path = tmp_path / "invalid.csv"

    pd.DataFrame(
        {
            "content": ["sample"],
            "label": ["positive"],
        }
    ).to_csv(
        source_path,
        index=False,
    )

    with pytest.raises(DatasetValidationError):
        process_dataset(
            source_path,
            tmp_path / "output",
        )


def test_small_dataset_is_rejected(
    tmp_path: Path,
) -> None:
    source_path = tmp_path / "small.csv"

    pd.DataFrame(
        {
            "text": ["one", "two"],
            "label": ["a", "b"],
        }
    ).to_csv(
        source_path,
        index=False,
    )

    with pytest.raises(DatasetValidationError):
        process_dataset(
            source_path,
            tmp_path / "output",
        )