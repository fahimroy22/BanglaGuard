from __future__ import annotations

import csv
import hashlib
import json
import mimetypes
from collections import Counter
from pathlib import Path
from typing import Any

from app.core.config import ROOT_DIR
from app.db.models import DatasetVersion


class DatasetArtifactError(Exception):
    """Base exception for dataset artifact failures."""


class DatasetManifestNotFoundError(DatasetArtifactError):
    """Raised when a dataset manifest cannot be found."""


class DatasetArtifactPathError(DatasetArtifactError):
    """Raised when a stored artifact path is unsafe."""


class DatasetManifestParseError(DatasetArtifactError):
    """Raised when a manifest cannot be parsed."""


class DatasetArtifactKeyError(DatasetArtifactError):
    """Raised when a requested artifact key is not permitted."""


class DatasetArtifactFileNotFoundError(DatasetArtifactError):
    """Raised when a requested artifact file is unavailable."""


class DatasetArtifactPreviewError(DatasetArtifactError):
    """Raised when a dataset artifact cannot be previewed."""


class DatasetArtifactStatisticsError(DatasetArtifactError):
    """Raised when dataset artifact statistics cannot be generated."""


class DatasetQualityReportError(DatasetArtifactError):
    """Raised when a dataset quality report cannot be generated."""


class DatasetArtifactService:
    def __init__(
        self,
        *,
        root_directory: Path = ROOT_DIR,
    ) -> None:
        self.root_directory = root_directory.resolve()

        self.allowed_roots = [
            (self.root_directory / "research" / "data" / "processed").resolve(),
            (self.root_directory / "research" / "data" / "external").resolve(),
            (self.root_directory / "storage" / "dataset-exports").resolve(),
        ]

    def get_manifest(
        self,
        *,
        dataset_version: DatasetVersion,
    ) -> dict[str, Any]:
        manifest_path = self._resolve_manifest_path(dataset_version.manifest_path)

        manifest = self._read_manifest(manifest_path)

        return {
            "dataset_version_id": dataset_version.id,
            "manifest_type": self._detect_manifest_type(manifest),
            "manifest_path": str(manifest_path),
            "manifest": manifest,
        }

    def get_file_inventory(
        self,
        *,
        dataset_version: DatasetVersion,
    ) -> dict[str, Any]:
        manifest_path = self._resolve_manifest_path(dataset_version.manifest_path)

        manifest = self._read_manifest(manifest_path)

        manifest_type = self._detect_manifest_type(manifest)

        file_candidates: list[tuple[str, Path]] = [
            (
                "manifest",
                manifest_path,
            )
        ]

        if manifest_type == "processed_dataset":
            file_candidates.extend(self._extract_processed_files(manifest))

        elif manifest_type == "dataset_export":
            file_candidates.extend(self._extract_export_files(manifest))

        else:
            file_candidates.extend(self._extract_generic_files(manifest))

        inventory: list[dict[str, Any]] = []
        seen_paths: set[Path] = set()

        for key, candidate in file_candidates:
            resolved_path = self._resolve_artifact_candidate(candidate)

            if resolved_path in seen_paths:
                continue

            seen_paths.add(resolved_path)

            exists = resolved_path.exists() and resolved_path.is_file()

            inventory.append(
                {
                    "key": key,
                    "path": str(resolved_path),
                    "filename": resolved_path.name,
                    "exists": exists,
                    "size_bytes": (resolved_path.stat().st_size if exists else None),
                    "checksum_sha256": (
                        self._calculate_checksum(resolved_path) if exists else None
                    ),
                    "media_type": (
                        mimetypes.guess_type(resolved_path.name)[0]
                        or "application/octet-stream"
                    ),
                }
            )

        missing_files = [item["key"] for item in inventory if not item["exists"]]

        return {
            "dataset_version_id": dataset_version.id,
            "manifest_type": manifest_type,
            "total_files": len(inventory),
            "available_files": (len(inventory) - len(missing_files)),
            "missing_files": missing_files,
            "files": inventory,
        }

    def get_download_file(
        self,
        *,
        dataset_version: DatasetVersion,
        file_key: str,
    ) -> dict[str, Any]:
        normalized_key = file_key.strip().lower()

        allowed_keys = {
            "manifest",
            "processed",
            "train",
            "validation",
            "test",
        }

        if normalized_key not in allowed_keys:
            raise DatasetArtifactKeyError(
                "The requested dataset artifact key is not supported."
            )

        inventory = self.get_file_inventory(
            dataset_version=dataset_version,
        )

        matching_file = next(
            (
                item
                for item in inventory["files"]
                if str(item["key"]).lower() == normalized_key
            ),
            None,
        )

        if matching_file is None:
            raise DatasetArtifactFileNotFoundError(
                "The requested dataset artifact is not registered "
                "for this dataset version."
            )

        if not matching_file["exists"]:
            raise DatasetArtifactFileNotFoundError(
                "The requested dataset artifact was not found on disk."
            )

        artifact_path = self._resolve_artifact_candidate(
            Path(str(matching_file["path"]))
        )

        if not artifact_path.is_file():
            raise DatasetArtifactFileNotFoundError(
                "The requested dataset artifact was not found on disk."
            )

        return {
            **matching_file,
            "key": normalized_key,
            "path": str(artifact_path),
        }

    def preview_file(
        self,
        *,
        dataset_version: DatasetVersion,
        file_key: str,
        limit: int,
        offset: int,
    ) -> dict[str, Any]:
        normalized_key = file_key.strip().lower()

        previewable_keys = {
            "processed",
            "train",
            "validation",
            "test",
        }

        if normalized_key not in previewable_keys:
            raise DatasetArtifactKeyError(
                "Only processed, train, validation, and test "
                "dataset files can be previewed."
            )

        if limit < 1 or limit > 100:
            raise DatasetArtifactPreviewError(
                "The preview limit must be between 1 and 100."
            )

        if offset < 0:
            raise DatasetArtifactPreviewError(
                "The preview offset must be zero or greater."
            )

        artifact = self.get_download_file(
            dataset_version=dataset_version,
            file_key=normalized_key,
        )

        artifact_path = Path(str(artifact["path"]))

        if artifact_path.suffix.lower() != ".csv":
            raise DatasetArtifactPreviewError(
                "Only CSV dataset artifacts can be previewed."
            )

        try:
            with artifact_path.open(
                "r",
                encoding="utf-8-sig",
                errors="strict",
                newline="",
            ) as file:
                reader = csv.DictReader(file)

                if reader.fieldnames is None:
                    raise DatasetArtifactPreviewError(
                        "The dataset CSV does not contain a header row."
                    )

                columns = [str(column).strip() for column in reader.fieldnames]

                if not columns or any(not column for column in columns):
                    raise DatasetArtifactPreviewError(
                        "The dataset CSV contains invalid column names."
                    )

                rows: list[dict[str, Any]] = []

                total_rows = 0

                preview_end = offset + limit

                for row_index, row in enumerate(reader):
                    if offset <= row_index < preview_end:
                        rows.append(
                            {
                                str(key): (value if value is not None else "")
                                for key, value in row.items()
                                if key is not None
                            }
                        )

                    total_rows += 1

        except DatasetArtifactPreviewError:
            raise

        except UnicodeDecodeError as exc:
            raise DatasetArtifactPreviewError(
                "The dataset artifact is not valid UTF-8."
            ) from exc

        except csv.Error as exc:
            raise DatasetArtifactPreviewError(
                "The dataset artifact could not be parsed as CSV."
            ) from exc

        except OSError as exc:
            raise DatasetArtifactPreviewError(
                "The dataset artifact could not be read."
            ) from exc

        return {
            "dataset_version_id": dataset_version.id,
            "file_key": normalized_key,
            "filename": artifact["filename"],
            "columns": columns,
            "rows": rows,
            "total_rows": total_rows,
            "limit": limit,
            "offset": offset,
            "has_previous": offset > 0,
            "has_next": (offset + len(rows)) < total_rows,
        }

    def get_file_statistics(
        self,
        *,
        dataset_version: DatasetVersion,
        file_key: str,
    ) -> dict[str, Any]:
        normalized_key = file_key.strip().lower()

        analyzable_keys = {
            "processed",
            "train",
            "validation",
            "test",
        }

        if normalized_key not in analyzable_keys:
            raise DatasetArtifactKeyError(
                "Only processed, train, validation, and test "
                "dataset files can be analyzed."
            )

        artifact = self.get_download_file(
            dataset_version=dataset_version,
            file_key=normalized_key,
        )

        artifact_path = Path(str(artifact["path"]))

        if artifact_path.suffix.lower() != ".csv":
            raise DatasetArtifactStatisticsError(
                "Only CSV dataset artifacts can be analyzed."
            )

        try:
            with artifact_path.open(
                "r",
                encoding="utf-8-sig",
                errors="strict",
                newline="",
            ) as file:
                reader = csv.DictReader(file)

                if reader.fieldnames is None:
                    raise DatasetArtifactStatisticsError(
                        "The dataset CSV does not contain a header row."
                    )

                columns = [str(column).strip() for column in reader.fieldnames]

                if not columns or any(not column for column in columns):
                    raise DatasetArtifactStatisticsError(
                        "The dataset CSV contains invalid column names."
                    )

                normalized_columns = {column.lower(): column for column in columns}

                text_column = normalized_columns.get("text")

                label_column = normalized_columns.get("label")

                missing_values = {column: 0 for column in columns}

                unique_values: dict[str, set[str]] = {
                    column: set() for column in columns
                }

                label_counter: Counter[str] = Counter()

                seen_texts: set[str] = set()

                total_rows = 0
                duplicate_text_rows = 0
                replacement_character_rows = 0

                text_lengths: list[int] = []

                for row in reader:
                    total_rows += 1

                    normalized_row: dict[str, str] = {}

                    for column in columns:
                        raw_value = row.get(
                            column,
                            "",
                        )

                        value = raw_value if raw_value is not None else ""

                        cleaned = str(value).strip()

                        normalized_row[column] = cleaned

                        if cleaned == "":
                            missing_values[column] += 1
                        else:
                            unique_values[column].add(cleaned)

                    if label_column is not None:
                        label_value = normalized_row[label_column]

                        if label_value:
                            label_counter[label_value] += 1

                    if text_column is not None:
                        text_value = normalized_row[text_column]

                        if text_value:
                            text_lengths.append(len(text_value))

                            if text_value in seen_texts:
                                duplicate_text_rows += 1
                            else:
                                seen_texts.add(text_value)

                            if "\ufffd" in text_value:
                                replacement_character_rows += 1

        except DatasetArtifactStatisticsError:
            raise

        except UnicodeDecodeError as exc:
            raise DatasetArtifactStatisticsError(
                "The dataset artifact is not valid UTF-8."
            ) from exc

        except csv.Error as exc:
            raise DatasetArtifactStatisticsError(
                "The dataset artifact could not be parsed as CSV."
            ) from exc

        except OSError as exc:
            raise DatasetArtifactStatisticsError(
                "The dataset artifact could not be read."
            ) from exc

        label_distribution = {
            label: count
            for label, count in sorted(
                label_counter.items(),
                key=lambda item: (
                    -item[1],
                    item[0],
                ),
            )
        }

        label_percentages = {
            label: round(
                (count / total_rows * 100) if total_rows else 0.0,
                4,
            )
            for label, count in label_distribution.items()
        }

        unique_counts = {
            column: len(values) for column, values in unique_values.items()
        }

        if text_lengths:
            minimum_text_length = min(text_lengths)

            maximum_text_length = max(text_lengths)

            average_text_length = round(
                sum(text_lengths) / len(text_lengths),
                4,
            )

        else:
            minimum_text_length = None
            maximum_text_length = None
            average_text_length = None

        return {
            "dataset_version_id": (dataset_version.id),
            "file_key": normalized_key,
            "filename": artifact["filename"],
            "columns": columns,
            "total_rows": total_rows,
            "total_columns": len(columns),
            "text_column": text_column,
            "label_column": label_column,
            "missing_values": missing_values,
            "unique_values": unique_counts,
            "unique_text_rows": (len(seen_texts) if text_column is not None else None),
            "duplicate_text_rows": (
                duplicate_text_rows if text_column is not None else None
            ),
            "replacement_character_rows": (
                replacement_character_rows if text_column is not None else None
            ),
            "label_distribution": (label_distribution),
            "label_percentages": (label_percentages),
            "text_length": {
                "count": len(text_lengths),
                "minimum": (minimum_text_length),
                "maximum": (maximum_text_length),
                "average": (average_text_length),
            },
        }

    def get_quality_report(
        self,
        *,
        dataset_version: DatasetVersion,
    ) -> dict[str, Any]:
        manifest_result = self.get_manifest(
            dataset_version=dataset_version,
        )

        manifest = manifest_result["manifest"]

        manifest_type = manifest_result["manifest_type"]

        if manifest_type != "processed_dataset":
            raise DatasetQualityReportError(
                "Quality reports currently require a processed dataset manifest."
            )

        inventory = self.get_file_inventory(
            dataset_version=dataset_version,
        )

        required_file_keys = {
            "manifest",
            "processed",
            "train",
            "validation",
            "test",
        }

        inventory_by_key = {
            str(item["key"]).lower(): item for item in inventory["files"]
        }

        missing_required_files = sorted(
            key
            for key in required_file_keys
            if (key not in inventory_by_key or not inventory_by_key[key]["exists"])
        )

        checks: list[dict[str, Any]] = []
        warnings: list[str] = []
        errors: list[str] = []

        def add_check(
            *,
            key: str,
            passed: bool,
            severity: str,
            message: str,
            expected: Any = None,
            actual: Any = None,
        ) -> None:
            checks.append(
                {
                    "key": key,
                    "passed": passed,
                    "severity": severity,
                    "message": message,
                    "expected": expected,
                    "actual": actual,
                }
            )

            if passed:
                return

            if severity == "error":
                errors.append(message)
            else:
                warnings.append(message)

        add_check(
            key="manifest_type",
            passed=(manifest_type == "processed_dataset"),
            severity="error",
            message=("The dataset uses a processed-dataset manifest."),
            expected="processed_dataset",
            actual=manifest_type,
        )

        add_check(
            key="required_files_available",
            passed=not missing_required_files,
            severity="error",
            message=(
                "All required dataset files are available."
                if not missing_required_files
                else (
                    "Required dataset files are missing: "
                    + ", ".join(missing_required_files)
                    + "."
                )
            ),
            expected=sorted(required_file_keys),
            actual=sorted(
                key
                for key in required_file_keys
                if (key in inventory_by_key and inventory_by_key[key]["exists"])
            ),
        )

        manifest_samples = manifest.get(
            "samples",
            {},
        )

        if not isinstance(
            manifest_samples,
            dict,
        ):
            raise DatasetQualityReportError(
                "The processed dataset manifest does not "
                "contain a valid samples object."
            )

        expected_counts = {
            "processed": int(
                manifest_samples.get(
                    "total",
                    0,
                )
            ),
            "train": int(
                manifest_samples.get(
                    "train",
                    0,
                )
            ),
            "validation": int(
                manifest_samples.get(
                    "validation",
                    0,
                )
            ),
            "test": int(
                manifest_samples.get(
                    "test",
                    0,
                )
            ),
        }

        registered_counts = {
            "processed": int(
                getattr(
                    dataset_version,
                    "total_samples",
                    0,
                )
                or 0
            ),
            "train": int(
                getattr(
                    dataset_version,
                    "train_samples",
                    0,
                )
                or 0
            ),
            "validation": int(
                getattr(
                    dataset_version,
                    "validation_samples",
                    0,
                )
                or 0
            ),
            "test": int(
                getattr(
                    dataset_version,
                    "test_samples",
                    0,
                )
                or 0
            ),
        }

        registered_counts_match = registered_counts == expected_counts

        add_check(
            key="registered_counts_match_manifest",
            passed=registered_counts_match,
            severity="error",
            message=(
                "Registered sample counts match the manifest."
                if registered_counts_match
                else ("Registered sample counts do not match the dataset manifest.")
            ),
            expected=expected_counts,
            actual=registered_counts,
        )

        manifest_split_sum = (
            expected_counts["train"]
            + expected_counts["validation"]
            + expected_counts["test"]
        )

        split_sum_matches = manifest_split_sum == expected_counts["processed"]

        add_check(
            key="manifest_split_sum_matches_total",
            passed=split_sum_matches,
            severity="error",
            message=(
                "Manifest split counts add up to the total sample count."
                if split_sum_matches
                else (
                    "Manifest train, validation, and test counts "
                    "do not add up to the total count."
                )
            ),
            expected=expected_counts["processed"],
            actual=manifest_split_sum,
        )

        split_reports: dict[
            str,
            dict[str, Any],
        ] = {}

        actual_counts: dict[str, int] = {}

        total_replacement_rows = 0
        total_duplicate_rows = 0
        total_missing_required_values = 0

        analyzed_keys = (
            "processed",
            "train",
            "validation",
            "test",
        )

        for file_key in analyzed_keys:
            if file_key in missing_required_files:
                continue

            statistics = self.get_file_statistics(
                dataset_version=dataset_version,
                file_key=file_key,
            )

            actual_rows = int(statistics["total_rows"])

            expected_rows = expected_counts[file_key]

            counts_match = actual_rows == expected_rows

            actual_counts[file_key] = actual_rows

            text_missing = int(
                statistics["missing_values"].get(
                    "text",
                    0,
                )
            )

            label_missing = int(
                statistics["missing_values"].get(
                    "label",
                    0,
                )
            )

            duplicate_rows = int(statistics["duplicate_text_rows"] or 0)

            replacement_rows = int(statistics["replacement_character_rows"] or 0)

            replacement_percentage = round(
                (replacement_rows / actual_rows * 100) if actual_rows else 0.0,
                4,
            )

            label_percentages = dict(statistics["label_percentages"])

            minimum_label_percentage = (
                min(label_percentages.values()) if label_percentages else 0.0
            )

            split_reports[file_key] = {
                "file_key": file_key,
                "filename": statistics["filename"],
                "expected_rows": (expected_rows),
                "actual_rows": actual_rows,
                "counts_match": counts_match,
                "columns": list(statistics["columns"]),
                "missing_text_rows": (text_missing),
                "missing_label_rows": (label_missing),
                "duplicate_text_rows": (duplicate_rows),
                "replacement_character_rows": (replacement_rows),
                "replacement_character_percentage": (replacement_percentage),
                "label_distribution": dict(statistics["label_distribution"]),
                "label_percentages": (label_percentages),
                "minimum_label_percentage": (
                    round(
                        minimum_label_percentage,
                        4,
                    )
                ),
                "text_length": dict(statistics["text_length"]),
            }

            add_check(
                key=(f"{file_key}_row_count"),
                passed=counts_match,
                severity="error",
                message=(
                    f"{file_key}.csv row count matches the manifest."
                    if counts_match
                    else (f"{file_key}.csv row count does not match the manifest.")
                ),
                expected=expected_rows,
                actual=actual_rows,
            )

            total_replacement_rows += replacement_rows

            total_duplicate_rows += duplicate_rows

            total_missing_required_values += text_missing + label_missing

        processed_inventory = inventory_by_key.get("processed")

        actual_processed_checksum = (
            processed_inventory.get("checksum_sha256") if processed_inventory else None
        )

        manifest_checksum = manifest.get("checksum_sha256")

        registered_checksum = getattr(
            dataset_version,
            "checksum",
            None,
        )

        checksum_values_available = bool(
            actual_processed_checksum and manifest_checksum and registered_checksum
        )

        checksums_match = (
            checksum_values_available
            and actual_processed_checksum == manifest_checksum == registered_checksum
        )

        add_check(
            key="processed_checksum_integrity",
            passed=checksums_match,
            severity="error",
            message=(
                "The processed dataset checksum matches the manifest and registry."
                if checksums_match
                else (
                    "The processed dataset checksum does not "
                    "match the manifest and registry."
                )
            ),
            expected={
                "manifest": manifest_checksum,
                "registered": (registered_checksum),
            },
            actual=actual_processed_checksum,
        )

        processed_report = split_reports.get("processed")

        required_columns_present = bool(
            processed_report
            and {
                "text",
                "label",
            }.issubset(set(processed_report["columns"]))
        )

        add_check(
            key="required_columns_present",
            passed=required_columns_present,
            severity="error",
            message=(
                "The processed dataset contains text and label columns."
                if required_columns_present
                else ("The processed dataset must contain text and label columns.")
            ),
            expected=[
                "text",
                "label",
            ],
            actual=(processed_report["columns"] if processed_report else []),
        )

        no_missing_required_values = total_missing_required_values == 0

        add_check(
            key="no_missing_required_values",
            passed=no_missing_required_values,
            severity="error",
            message=(
                "No text or label values are missing."
                if no_missing_required_values
                else ("The dataset contains missing text or label values.")
            ),
            expected=0,
            actual=(total_missing_required_values),
        )

        no_duplicate_text = total_duplicate_rows == 0

        add_check(
            key="no_duplicate_text",
            passed=no_duplicate_text,
            severity="warning",
            message=(
                "No duplicate text rows were detected."
                if no_duplicate_text
                else ("Duplicate text rows were detected across dataset artifacts.")
            ),
            expected=0,
            actual=total_duplicate_rows,
        )

        processed_rows = processed_report["actual_rows"] if processed_report else 0

        processed_replacement_rows = (
            processed_report["replacement_character_rows"] if processed_report else 0
        )

        processed_replacement_percentage = round(
            (processed_replacement_rows / processed_rows * 100)
            if processed_rows
            else 0.0,
            4,
        )

        replacement_characters_acceptable = processed_replacement_percentage < 1.0

        add_check(
            key="replacement_character_threshold",
            passed=(replacement_characters_acceptable),
            severity="error",
            message=(
                "Unicode replacement-character damage is below 1%."
                if replacement_characters_acceptable
                else (
                    "Unicode replacement-character damage is "
                    "1% or higher; create a cleaned dataset "
                    "version before training."
                )
            ),
            expected="< 1%",
            actual=(f"{processed_replacement_percentage}%"),
        )

        processed_label_percentages = (
            processed_report["label_percentages"] if processed_report else {}
        )

        minimum_label_percentage = (
            min(processed_label_percentages.values())
            if processed_label_percentages
            else 0.0
        )

        labels_available = len(processed_label_percentages) >= 2

        add_check(
            key="minimum_distinct_labels",
            passed=labels_available,
            severity="error",
            message=(
                "The processed dataset contains at least two labels."
                if labels_available
                else ("The processed dataset must contain at least two labels.")
            ),
            expected="at least 2",
            actual=len(processed_label_percentages),
        )

        severe_imbalance = bool(
            processed_label_percentages and minimum_label_percentage < 10.0
        )

        moderate_imbalance = bool(
            processed_label_percentages and 10.0 <= minimum_label_percentage < 25.0
        )

        add_check(
            key="class_balance",
            passed=not severe_imbalance,
            severity="error",
            message=(
                "No class contains less than 10% of the processed dataset."
                if not severe_imbalance
                else (
                    "At least one class contains less than "
                    "10% of the processed dataset."
                )
            ),
            expected="minimum class share >= 10%",
            actual=round(
                minimum_label_percentage,
                4,
            ),
        )

        if moderate_imbalance:
            warnings.append(
                "At least one class represents less than 25% of the processed dataset."
            )

        score = 100.0

        error_deductions = {
            "required_files_available": 25.0,
            "registered_counts_match_manifest": 10.0,
            "manifest_split_sum_matches_total": 10.0,
            "processed_checksum_integrity": 20.0,
            "required_columns_present": 20.0,
            "no_missing_required_values": 15.0,
            "replacement_character_threshold": 15.0,
            "minimum_distinct_labels": 20.0,
            "class_balance": 10.0,
        }

        warning_deductions = {
            "no_duplicate_text": 5.0,
        }

        for check in checks:
            if check["passed"]:
                continue

            if check["severity"] == "error":
                score -= error_deductions.get(
                    check["key"],
                    5.0,
                )
            else:
                score -= warning_deductions.get(
                    check["key"],
                    2.5,
                )

        if moderate_imbalance:
            score -= 5.0

        score = round(
            max(
                0.0,
                min(
                    score,
                    100.0,
                ),
            ),
            2,
        )

        training_ready = len(errors) == 0

        if errors:
            status = "not_ready"
        elif warnings:
            status = "warning"
        else:
            status = "ready"

        recommendations: list[str] = []

        if not replacement_characters_acceptable:
            recommendations.append(
                "Create a new dataset version that excludes or "
                "repairs rows containing the Unicode replacement character."
            )

        if total_duplicate_rows:
            recommendations.append("Remove duplicate text rows before training.")

        if total_missing_required_values:
            recommendations.append(
                "Remove or correct rows with missing text or labels."
            )

        if severe_imbalance or moderate_imbalance:
            recommendations.append(
                "Review class balance and consider class weighting "
                "or additional minority-class data."
            )

        if not checksums_match:
            recommendations.append(
                "Regenerate or re-register the dataset artifacts "
                "to restore checksum integrity."
            )

        if training_ready:
            recommendations.append(
                "The dataset may proceed to experiment configuration."
            )

        return {
            "dataset_version_id": (dataset_version.id),
            "dataset_name": str(
                getattr(
                    dataset_version,
                    "name",
                    "",
                )
            ),
            "dataset_version": str(
                getattr(
                    dataset_version,
                    "version",
                    "",
                )
            ),
            "manifest_type": manifest_type,
            "status": status,
            "training_ready": training_ready,
            "quality_score": score,
            "checks": checks,
            "registered_counts": (registered_counts),
            "manifest_counts": (expected_counts),
            "actual_counts": actual_counts,
            "missing_required_files": (missing_required_files),
            "checksum": {
                "registered": (registered_checksum),
                "manifest": (manifest_checksum),
                "actual_processed": (actual_processed_checksum),
                "matches": checksums_match,
            },
            "splits": split_reports,
            "summary": {
                "total_missing_required_values": (total_missing_required_values),
                "total_duplicate_text_rows": (total_duplicate_rows),
                "processed_replacement_character_rows": (processed_replacement_rows),
                "processed_replacement_character_percentage": (
                    processed_replacement_percentage
                ),
                "minimum_label_percentage": (
                    round(
                        minimum_label_percentage,
                        4,
                    )
                ),
            },
            "warnings": warnings,
            "errors": errors,
            "recommendations": recommendations,
        }

    def _resolve_manifest_path(
        self,
        stored_path: str | None,
    ) -> Path:
        if not stored_path:
            raise DatasetManifestNotFoundError(
                "This dataset does not have a registered manifest."
            )

        candidate = Path(stored_path)

        if not candidate.is_absolute():
            candidate = self.root_directory / candidate

        resolved_path = candidate.expanduser().resolve()

        self._validate_allowed_path(resolved_path)

        if not resolved_path.exists() or not resolved_path.is_file():
            raise DatasetManifestNotFoundError(
                "The registered dataset manifest was not found on disk."
            )

        return resolved_path

    def _resolve_artifact_candidate(
        self,
        candidate: Path,
    ) -> Path:
        if not candidate.is_absolute():
            candidate = self.root_directory / candidate

        resolved_path = candidate.expanduser().resolve()

        self._validate_allowed_path(resolved_path)

        return resolved_path

    def _validate_allowed_path(
        self,
        path: Path,
    ) -> None:
        for allowed_root in self.allowed_roots:
            try:
                path.relative_to(allowed_root)
                return

            except ValueError:
                continue

        raise DatasetArtifactPathError(
            "The stored dataset artifact path "
            "is outside the permitted storage directories."
        )

    def _read_manifest(
        self,
        manifest_path: Path,
    ) -> dict[str, Any]:
        try:
            content = manifest_path.read_text(encoding="utf-8")

            parsed = json.loads(content)

        except (
            OSError,
            UnicodeDecodeError,
            json.JSONDecodeError,
        ) as exc:
            raise DatasetManifestParseError(
                "The dataset manifest could not be parsed as valid UTF-8 JSON."
            ) from exc

        if not isinstance(
            parsed,
            dict,
        ):
            raise DatasetManifestParseError(
                "The dataset manifest root must be a JSON object."
            )

        return parsed

    def _detect_manifest_type(
        self,
        manifest: dict[str, Any],
    ) -> str:
        files = manifest.get("files")

        if isinstance(
            files,
            dict,
        ):
            return "processed_dataset"

        if (
            "artifact" in manifest
            or "export_format" in manifest
            or "export_id" in manifest
        ):
            return "dataset_export"

        return "unknown"

    def _extract_processed_files(
        self,
        manifest: dict[str, Any],
    ) -> list[tuple[str, Path]]:
        files = manifest.get("files")

        if not isinstance(
            files,
            dict,
        ):
            return []

        extracted: list[tuple[str, Path]] = []

        for key, value in files.items():
            if (
                isinstance(
                    value,
                    str,
                )
                and value.strip()
            ):
                extracted.append(
                    (
                        str(key),
                        Path(value),
                    )
                )

        return extracted

    def _extract_export_files(
        self,
        manifest: dict[str, Any],
    ) -> list[tuple[str, Path]]:
        extracted: list[tuple[str, Path]] = []

        artifact = manifest.get("artifact")

        if (
            isinstance(
                artifact,
                str,
            )
            and artifact.strip()
        ):
            extracted.append(
                (
                    "artifact",
                    Path(artifact),
                )
            )

        elif isinstance(
            artifact,
            dict,
        ):
            artifact_path = artifact.get("path")

            if (
                isinstance(
                    artifact_path,
                    str,
                )
                and artifact_path.strip()
            ):
                extracted.append(
                    (
                        "artifact",
                        Path(artifact_path),
                    )
                )

        for key in (
            "artifact_path",
            "manifest_path",
        ):
            value = manifest.get(key)

            if (
                isinstance(
                    value,
                    str,
                )
                and value.strip()
            ):
                extracted.append(
                    (
                        key,
                        Path(value),
                    )
                )

        return extracted

    def _extract_generic_files(
        self,
        manifest: dict[str, Any],
    ) -> list[tuple[str, Path]]:
        extracted: list[tuple[str, Path]] = []

        for key, value in manifest.items():
            if not isinstance(
                value,
                str,
            ):
                continue

            stripped = value.strip()

            if not stripped:
                continue

            if key.endswith(
                (
                    "_path",
                    "_file",
                    "_filename",
                )
            ):
                extracted.append(
                    (
                        str(key),
                        Path(stripped),
                    )
                )

        return extracted

    def _calculate_checksum(
        self,
        file_path: Path,
    ) -> str:
        digest = hashlib.sha256()

        with file_path.open("rb") as file:
            while True:
                chunk = file.read(1024 * 1024)

                if not chunk:
                    break

                digest.update(chunk)

        return digest.hexdigest()
