from __future__ import annotations

import csv
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import UploadFile

from app.core.config import (
    ROOT_DIR,
    settings,
)


class DatasetInspectionError(Exception):
    """Base exception for dataset inspection failures."""


class UnsupportedInspectionFileError(DatasetInspectionError):
    """Raised when the uploaded file is not supported."""


class DatasetInspectionFileTooLargeError(DatasetInspectionError):
    """Raised when the uploaded file exceeds the limit."""


class DatasetInspectionParseError(DatasetInspectionError):
    """Raised when the CSV cannot be parsed."""


class EmptyDatasetInspectionError(DatasetInspectionError):
    """Raised when a CSV has no usable columns or rows."""


def _validate_utf8_file(
    file_path: Path,
) -> None:
    """Validate the complete uploaded file as strict UTF-8.

    The whole byte sequence must be decoded together. Decoding individual
    chunks can incorrectly reject valid Bengali text when a multibyte UTF-8
    character crosses a chunk boundary.
    """
    try:
        file_path.read_text(
            encoding="utf-8",
            errors="strict",
        )
    except UnicodeDecodeError as exc:
        raise DatasetInspectionError("The CSV must use UTF-8 encoding.") from exc


class DatasetInspectionService:
    async def inspect(
        self,
        *,
        file: UploadFile,
    ) -> dict[str, Any]:
        filename = Path(file.filename or "dataset.csv").name

        if not filename.lower().endswith(".csv"):
            raise UnsupportedInspectionFileError(
                "Only CSV dataset files are supported."
            )

        upload_id = uuid.uuid4()

        inspection_directory = (
            ROOT_DIR
            / settings.upload_storage_path
            / "dataset-inspections"
            / str(upload_id)
        )

        inspection_directory.mkdir(
            parents=True,
            exist_ok=False,
        )

        source_path = inspection_directory / "source.csv"

        try:
            file_size_bytes = await self._save_upload(
                file=file,
                destination=source_path,
            )

            _validate_utf8_file(source_path)

            encoding = self._detect_encoding(source_path)

            delimiter = self._detect_delimiter(
                path=source_path,
                encoding=encoding,
            )

            dataframe = self._read_dataframe(
                path=source_path,
                encoding=encoding,
                delimiter=delimiter,
            )

            dataframe.columns = [str(column).strip() for column in dataframe.columns]

            if len(dataframe.columns) == 0 or len(dataframe) == 0:
                raise EmptyDatasetInspectionError(
                    "The uploaded CSV does not contain any data rows."
                )

            duplicate_columns = (
                dataframe.columns[dataframe.columns.duplicated()].astype(str).tolist()
            )

            if duplicate_columns:
                duplicate_names = ", ".join(sorted(set(duplicate_columns)))

                raise DatasetInspectionParseError(
                    f"The CSV contains duplicate column names: {duplicate_names}"
                )

            preview_limit = settings.dataset_inspection_preview_rows

            sample_rows = (
                dataframe.head(preview_limit)
                .where(
                    pd.notna(dataframe.head(preview_limit)),
                    None,
                )
                .to_dict(orient="records")
            )

            columns = [str(column) for column in dataframe.columns]

            column_profiles = self._build_column_profiles(dataframe)

            suggested_text_column = self._suggest_text_column(dataframe)

            suggested_label_columns = self._suggest_label_columns(
                dataframe=dataframe,
                text_column=(suggested_text_column),
            )

            expires_at = datetime.now(timezone.utc) + timedelta(
                minutes=(settings.dataset_inspection_ttl_minutes)
            )

            return {
                "upload_id": upload_id,
                "filename": filename,
                "content_type": (file.content_type),
                "file_size_bytes": (file_size_bytes),
                "encoding": encoding,
                "delimiter": delimiter,
                "total_rows": int(len(dataframe)),
                "total_columns": int(len(columns)),
                "columns": columns,
                "sample_rows": (self._make_json_safe(sample_rows)),
                "column_profiles": (column_profiles),
                "suggested_text_column": (suggested_text_column),
                "suggested_label_columns": (suggested_label_columns),
                "temporary_path": str(source_path),
                "temporary_file_expires_at": (expires_at),
            }

        except Exception:
            if inspection_directory.exists():
                shutil.rmtree(
                    inspection_directory,
                    ignore_errors=True,
                )

            raise

    async def _save_upload(
        self,
        *,
        file: UploadFile,
        destination: Path,
    ) -> int:
        maximum_size = settings.dataset_inspection_max_bytes

        total_size = 0
        chunk_size = 1024 * 1024

        with destination.open("wb") as output:
            while True:
                chunk = await file.read(chunk_size)

                if not chunk:
                    break

                total_size += len(chunk)

                if total_size > maximum_size:
                    maximum_megabytes = maximum_size // (1024 * 1024)

                    raise (
                        DatasetInspectionFileTooLargeError(
                            "The uploaded CSV exceeds "
                            f"the {maximum_megabytes} "
                            "MB limit."
                        )
                    )

                output.write(chunk)

        if total_size == 0:
            raise EmptyDatasetInspectionError("The uploaded CSV file is empty.")

        return total_size

    def _detect_encoding(
        self,
        path: Path,
    ) -> str:
        """Return the correct UTF-8 codec after whole-file validation."""
        with path.open("rb") as file:
            byte_order_mark = file.read(3)

        if byte_order_mark == b"\xef\xbb\xbf":
            return "utf-8-sig"

        return "utf-8"

    def _detect_delimiter(
        self,
        *,
        path: Path,
        encoding: str,
    ) -> str:
        try:
            sample = path.read_text(
                encoding=encoding,
                errors="strict",
            )[:65_536]

            dialect = csv.Sniffer().sniff(
                sample,
                delimiters=",;\t|",
            )

            return dialect.delimiter

        except csv.Error:
            return ","

        except UnicodeDecodeError as exc:
            raise DatasetInspectionParseError(
                "The CSV contains invalid text encoding."
            ) from exc

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
            raise DatasetInspectionParseError(
                "The uploaded file could not be parsed as a valid CSV."
            ) from exc

    def _build_column_profiles(
        self,
        dataframe: pd.DataFrame,
    ) -> list[dict[str, Any]]:
        profiles: list[dict[str, Any]] = []

        for column in dataframe.columns:
            series = dataframe[column]

            non_null_series = series.dropna()

            sample_values = non_null_series.head(5).tolist()

            profiles.append(
                {
                    "name": str(column),
                    "inferred_dtype": str(series.dtype),
                    "non_null_count": int(series.notna().sum()),
                    "null_count": int(series.isna().sum()),
                    "unique_count": int(non_null_series.astype(str).nunique()),
                    "sample_values": (self._make_json_safe(sample_values)),
                }
            )

        return profiles

    def _suggest_text_column(
        self,
        dataframe: pd.DataFrame,
    ) -> str | None:
        preferred_names = [
            "text",
            "sentence",
            "content",
            "comment",
            "post",
            "tweet",
            "message",
            "utterance",
            "review",
            "body",
        ]

        normalized_columns = {
            str(column).strip().lower(): str(column) for column in dataframe.columns
        }

        for preferred_name in preferred_names:
            if preferred_name in (normalized_columns):
                return normalized_columns[preferred_name]

        candidates: list[tuple[float, str]] = []

        for column in dataframe.columns:
            series = dataframe[column].dropna().astype(str).str.strip()

            if series.empty:
                continue

            average_length = float(series.str.len().mean())

            unique_ratio = float(series.nunique()) / float(len(series))

            score = average_length * max(
                unique_ratio,
                0.01,
            )

            candidates.append(
                (
                    score,
                    str(column),
                )
            )

        if not candidates:
            return None

        candidates.sort(reverse=True)

        return candidates[0][1]

    def _suggest_label_columns(
        self,
        *,
        dataframe: pd.DataFrame,
        text_column: str | None,
    ) -> list[str]:
        preferred_names = [
            "label",
            "target",
            "class",
            "category",
            "sentiment",
            "hate_speech",
            "type",
            "verdict",
        ]

        suggestions: list[str] = []

        normalized_columns = {
            str(column).strip().lower(): str(column) for column in dataframe.columns
        }

        for preferred_name in preferred_names:
            actual_name = normalized_columns.get(preferred_name)

            if (
                actual_name
                and actual_name != text_column
                and actual_name not in suggestions
            ):
                suggestions.append(actual_name)

        remaining_candidates: list[tuple[int, str]] = []

        for column in dataframe.columns:
            column_name = str(column)

            if column_name == text_column or column_name in suggestions:
                continue

            series = dataframe[column].dropna().astype(str).str.strip()

            if series.empty:
                continue

            unique_count = int(series.nunique())

            if 2 <= unique_count <= 100:
                remaining_candidates.append(
                    (
                        unique_count,
                        column_name,
                    )
                )

        remaining_candidates.sort(
            key=lambda item: (
                item[0],
                item[1],
            )
        )

        for _, column_name in remaining_candidates:
            suggestions.append(column_name)

        return suggestions[:10]

    def _make_json_safe(
        self,
        value: Any,
    ) -> Any:
        if isinstance(value, dict):
            return {str(key): self._make_json_safe(item) for key, item in value.items()}

        if isinstance(value, list):
            return [self._make_json_safe(item) for item in value]

        if pd.isna(value):
            return None

        if hasattr(value, "item"):
            try:
                return value.item()
            except (ValueError, TypeError):
                pass

        if isinstance(
            value,
            (
                str,
                int,
                float,
                bool,
            ),
        ):
            return value

        return str(value)
