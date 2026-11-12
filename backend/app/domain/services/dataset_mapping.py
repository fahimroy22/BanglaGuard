from __future__ import annotations

import csv
import math
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from app.core.config import (
    ROOT_DIR,
    settings,
)
from app.schemas.dataset_mapping import (
    DatasetMappingValidationRequest,
)


class DatasetMappingError(Exception):
    """Base exception for dataset mapping failures."""


class DatasetInspectionNotFoundError(DatasetMappingError):
    """Raised when an inspection upload cannot be found."""


class DatasetInspectionExpiredError(DatasetMappingError):
    """Raised when an inspection upload has expired."""


class DatasetMappingColumnError(DatasetMappingError):
    """Raised when selected columns are invalid."""


class DatasetMappingValidationError(DatasetMappingError):
    """Raised when the mapping cannot produce training data."""


class DatasetMappingService:
    def validate_mapping(
        self,
        *,
        payload: DatasetMappingValidationRequest,
    ) -> dict[str, Any]:
        source_path = self._resolve_source_path(payload.upload_id)

        self._validate_not_expired(source_path)

        encoding = self._detect_encoding(source_path)

        delimiter = self._detect_delimiter(
            source_path,
            encoding,
        )

        dataframe = self._read_dataframe(
            path=source_path,
            encoding=encoding,
            delimiter=delimiter,
        )

        dataframe.columns = [str(column).strip() for column in dataframe.columns]

        self._validate_columns(
            dataframe=dataframe,
            text_column=payload.text_column,
            label_column=payload.label_column,
        )

        working = dataframe[
            [
                payload.text_column,
                payload.label_column,
            ]
        ].copy()

        working.insert(
            0,
            "_source_row_number",
            range(
                2,
                len(working) + 2,
            ),
        )

        working["_text"] = (
            working[payload.text_column].astype("string").fillna("").str.strip()
        )

        working["_source_label"] = (
            working[payload.label_column]
            .map(self._canonical_label_value)
            .astype("string")
            .fillna("")
            .str.strip()
        )

        working["_contains_replacement_character"] = working["_text"].str.contains(
            "\ufffd",
            regex=False,
            na=False,
        )

        working["_empty_text"] = working["_text"] == ""

        working["_empty_label"] = working["_source_label"] == ""

        normalized_mapping = {
            self._canonical_label_value(source): (target.strip())
            for source, target in payload.label_mapping.items()
        }

        working["_mapped_label"] = working["_source_label"].map(normalized_mapping)

        working["_unmapped_label"] = (
            ~working["_empty_label"] & working["_mapped_label"].isna()
        )

        duplicate_mask = (
            working["_text"].duplicated(
                keep="first",
            )
            & ~working["_empty_text"]
        )

        working["_duplicate_text"] = duplicate_mask

        total_rows = int(len(working))

        empty_text_rows = int(working["_empty_text"].sum())

        empty_label_rows = int(working["_empty_label"].sum())

        unmapped_label_rows = int(working["_unmapped_label"].sum())

        duplicate_text_rows = int(working["_duplicate_text"].sum())

        replacement_character_rows = int(
            working["_contains_replacement_character"].sum()
        )

        valid_mask = pd.Series(
            True,
            index=working.index,
        )

        if payload.drop_empty_text:
            valid_mask &= ~working["_empty_text"]

        if payload.drop_empty_label:
            valid_mask &= ~working["_empty_label"]

        valid_mask &= ~working["_unmapped_label"]

        if payload.drop_duplicates:
            valid_mask &= ~working["_duplicate_text"]

        if payload.exclude_replacement_character_rows:
            valid_mask &= ~working["_contains_replacement_character"]

        valid_rows = working[valid_mask].copy()

        valid_rows["_mapped_label"] = (
            valid_rows["_mapped_label"].astype(str).str.strip()
        )

        valid_count = int(len(valid_rows))

        invalid_count = total_rows - valid_count

        source_distribution = (
            working.loc[
                ~working["_empty_label"],
                "_source_label",
            ]
            .value_counts()
            .to_dict()
        )

        source_label_distribution = {
            str(label): int(count) for label, count in source_distribution.items()
        }

        mapped_distribution = valid_rows["_mapped_label"].value_counts().to_dict()

        mapped_label_distribution = {
            str(label): int(count) for label, count in mapped_distribution.items()
        }

        warnings = self._build_warnings(
            total_rows=total_rows,
            valid_rows=valid_count,
            empty_text_rows=empty_text_rows,
            empty_label_rows=empty_label_rows,
            unmapped_label_rows=(unmapped_label_rows),
            duplicate_text_rows=(duplicate_text_rows),
            replacement_character_rows=(replacement_character_rows),
            mapped_label_distribution=(mapped_label_distribution),
            exclude_replacement_character_rows=(
                payload.exclude_replacement_character_rows
            ),
        )

        preview_rows = []

        for _, row in valid_rows.head(payload.preview_rows).iterrows():
            preview_rows.append(
                {
                    "source_row_number": int(row["_source_row_number"]),
                    "text": str(row["_text"]),
                    "source_label": str(row["_source_label"]),
                    "label": str(row["_mapped_label"]),
                    "contains_replacement_character": (
                        bool(row["_contains_replacement_character"])
                    ),
                }
            )

        can_register = valid_count >= 20 and len(mapped_label_distribution) >= 2

        return {
            "upload_id": payload.upload_id,
            "filename": source_path.name,
            "encoding": encoding,
            "delimiter": delimiter,
            "text_column": (payload.text_column),
            "label_column": (payload.label_column),
            "total_rows": total_rows,
            "valid_rows": valid_count,
            "invalid_rows": invalid_count,
            "empty_text_rows": (empty_text_rows),
            "empty_label_rows": (empty_label_rows),
            "unmapped_label_rows": (unmapped_label_rows),
            "duplicate_text_rows": (duplicate_text_rows),
            "replacement_character_rows": (replacement_character_rows),
            "source_label_distribution": (source_label_distribution),
            "mapped_label_distribution": (mapped_label_distribution),
            "label_mapping": (normalized_mapping),
            "preview_rows": preview_rows,
            "warnings": warnings,
            "can_register": can_register,
            "validation_configuration": {
                "drop_empty_text": (payload.drop_empty_text),
                "drop_empty_label": (payload.drop_empty_label),
                "drop_duplicates": (payload.drop_duplicates),
                "exclude_replacement_character_rows": (
                    payload.exclude_replacement_character_rows
                ),
                "minimum_valid_rows": 20,
                "minimum_distinct_labels": 2,
            },
        }

    def _resolve_source_path(
        self,
        upload_id: uuid.UUID,
    ) -> Path:
        inspection_root = (
            ROOT_DIR / settings.upload_storage_path / "dataset-inspections"
        ).resolve()

        source_path = (inspection_root / str(upload_id) / "source.csv").resolve()

        try:
            source_path.relative_to(inspection_root)
        except ValueError as exc:
            raise DatasetInspectionNotFoundError(
                "The inspection upload path is invalid."
            ) from exc

        if not source_path.is_file():
            raise DatasetInspectionNotFoundError(
                "The inspected dataset could not be found. Inspect the file again."
            )

        return source_path

    def _validate_not_expired(
        self,
        source_path: Path,
    ) -> None:
        modified_at = datetime.fromtimestamp(
            source_path.stat().st_mtime,
            tz=timezone.utc,
        )

        expires_at = modified_at + timedelta(
            minutes=(settings.dataset_inspection_ttl_minutes)
        )

        if datetime.now(timezone.utc) > expires_at:
            raise DatasetInspectionExpiredError(
                "The inspected dataset has expired. Upload and inspect the file again."
            )

    def _detect_encoding(
        self,
        path: Path,
    ) -> str:
        raw_data = path.read_bytes()

        for encoding in (
            "utf-8-sig",
            "utf-8",
        ):
            try:
                raw_data.decode(
                    encoding,
                    errors="strict",
                )

                return encoding

            except UnicodeDecodeError:
                continue

        raise DatasetMappingValidationError("The inspected CSV is not valid UTF-8.")

    def _detect_delimiter(
        self,
        path: Path,
        encoding: str,
    ) -> str:
        sample = path.read_text(
            encoding=encoding,
            errors="strict",
        )[:65_536]

        try:
            dialect = csv.Sniffer().sniff(
                sample,
                delimiters=",;\t|",
            )

            return dialect.delimiter

        except csv.Error:
            return ","

    def _read_dataframe(
        self,
        *,
        path: Path,
        encoding: str,
        delimiter: str,
    ) -> pd.DataFrame:
        try:
            return pd.read_csv(
                path,
                encoding=encoding,
                sep=delimiter,
                low_memory=False,
            )

        except Exception as exc:
            raise DatasetMappingValidationError(
                "The inspected CSV could not be parsed."
            ) from exc

    def _validate_columns(
        self,
        *,
        dataframe: pd.DataFrame,
        text_column: str,
        label_column: str,
    ) -> None:
        available_columns = {str(column) for column in dataframe.columns}

        missing_columns = [
            column
            for column in (
                text_column,
                label_column,
            )
            if column not in available_columns
        ]

        if missing_columns:
            raise DatasetMappingColumnError(
                "Selected columns were not found: " + ", ".join(missing_columns)
            )

    def _canonical_label_value(
        self,
        value: Any,
    ) -> str:
        if value is None:
            return ""

        try:
            if pd.isna(value):
                return ""
        except (TypeError, ValueError):
            pass

        if isinstance(value, bool):
            return "1" if value else "0"

        if isinstance(value, int):
            return str(value)

        if isinstance(value, float):
            if math.isnan(value):
                return ""

            if value.is_integer():
                return str(int(value))

        text = str(value).strip()

        if text.endswith(".0"):
            numeric_part = text[:-2]

            if numeric_part.lstrip("-").isdigit():
                return numeric_part

        return text

    def _build_warnings(
        self,
        *,
        total_rows: int,
        valid_rows: int,
        empty_text_rows: int,
        empty_label_rows: int,
        unmapped_label_rows: int,
        duplicate_text_rows: int,
        replacement_character_rows: int,
        mapped_label_distribution: dict[
            str,
            int,
        ],
        exclude_replacement_character_rows: bool,
    ) -> list[str]:
        warnings: list[str] = []

        if empty_text_rows:
            warnings.append(f"{empty_text_rows} rows contain empty text.")

        if empty_label_rows:
            warnings.append(f"{empty_label_rows} rows contain empty labels.")

        if unmapped_label_rows:
            warnings.append(
                f"{unmapped_label_rows} rows contain label values that are not mapped."
            )

        if duplicate_text_rows:
            warnings.append(f"{duplicate_text_rows} duplicate text rows were detected.")

        if replacement_character_rows:
            action = (
                "will be excluded"
                if exclude_replacement_character_rows
                else "will currently be retained"
            )

            warnings.append(
                f"{replacement_character_rows} rows "
                "contain the Unicode replacement "
                f"character and {action}."
            )

        if len(mapped_label_distribution) < 2:
            warnings.append("The valid dataset contains fewer than two mapped labels.")

        if valid_rows < 20:
            warnings.append("Fewer than 20 valid rows remain.")

        if total_rows > 0:
            invalid_ratio = (total_rows - valid_rows) / total_rows

            if invalid_ratio > 0.20:
                warnings.append("More than 20% of the uploaded rows would be excluded.")

        return warnings
