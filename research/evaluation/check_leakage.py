from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

import pandas as pd
from rapidfuzz.fuzz import ratio


def normalize_for_comparison(
    text: str,
) -> str:
    normalized = unicodedata.normalize(
        "NFKC",
        str(text),
    )

    normalized = normalized.casefold()

    normalized = re.sub(
        r"\s+",
        " ",
        normalized,
    ).strip()

    normalized = re.sub(
        r"[^\w\u0980-\u09FF ]",
        "",
        normalized,
    )

    return normalized


def load_split(
    directory: Path,
    split_name: str,
) -> pd.DataFrame:
    path = directory / f"{split_name}.csv"

    dataframe = pd.read_csv(path)

    dataframe = dataframe.dropna(
        subset=["text", "label"]
    ).copy()

    dataframe["normalized"] = (
        dataframe["text"]
        .astype(str)
        .map(normalize_for_comparison)
    )

    return dataframe


def exact_overlap(
    first: pd.DataFrame,
    second: pd.DataFrame,
) -> list[str]:
    return sorted(
        set(first["normalized"])
        & set(second["normalized"])
    )


def near_overlap(
    first: pd.DataFrame,
    second: pd.DataFrame,
    threshold: float,
) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []

    for first_row in first.itertuples():
        for second_row in second.itertuples():
            score = ratio(
                first_row.normalized,
                second_row.normalized,
            )

            if score >= threshold:
                matches.append(
                    {
                        "first_text": first_row.text,
                        "second_text": second_row.text,
                        "similarity": score,
                    }
                )

    return matches


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--dataset-dir",
        type=Path,
        required=True,
    )

    parser.add_argument(
        "--output",
        type=Path,
        required=True,
    )

    parser.add_argument(
        "--similarity-threshold",
        type=float,
        default=90.0,
    )

    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()

    dataset_directory = (
        arguments.dataset_dir
        .expanduser()
        .resolve()
    )

    train = load_split(
        dataset_directory,
        "train",
    )

    validation = load_split(
        dataset_directory,
        "validation",
    )

    test = load_split(
        dataset_directory,
        "test",
    )

    report = {
        "exact": {
            "train_validation": exact_overlap(
                train,
                validation,
            ),
            "train_test": exact_overlap(
                train,
                test,
            ),
            "validation_test": exact_overlap(
                validation,
                test,
            ),
        },
        "near_duplicates": {
            "train_validation": near_overlap(
                train,
                validation,
                arguments.similarity_threshold,
            ),
            "train_test": near_overlap(
                train,
                test,
                arguments.similarity_threshold,
            ),
            "validation_test": near_overlap(
                validation,
                test,
                arguments.similarity_threshold,
            ),
        },
        "similarity_threshold": (
            arguments.similarity_threshold
        ),
    }

    arguments.output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    arguments.output.write_text(
        json.dumps(
            report,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    exact_count = sum(
        len(items)
        for items in report["exact"].values()
    )

    near_count = sum(
        len(items)
        for items
        in report["near_duplicates"].values()
    )

    print("Leakage check complete.")
    print("Exact overlaps:", exact_count)
    print("Near overlaps:", near_count)


if __name__ == "__main__":
    main()