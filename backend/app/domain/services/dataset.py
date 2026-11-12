from __future__ import annotations

import math
import shutil
import uuid
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import ROOT_DIR
from app.db.models import DatasetVersion
from app.db.repositories.dataset_version import (
    DatasetVersionRepository,
)
from app.domain.enums import AnalysisTask
from app.domain.services.dataset_mapping import (
    DatasetMappingService,
)
from app.ml.dataset_processing import (
    DatasetProcessingResult,
    process_dataset,
)
from app.schemas.dataset_mapping import (
    DatasetRegistrationRequest,
)


class UnsupportedDatasetFileError(Exception):
    pass


class DatasetRegistrationError(Exception):
    """Raised when an inspected dataset cannot be registered."""


class DatasetService:
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self.session = session

        self.repository = DatasetVersionRepository(session)

    async def upload_and_register(
        self,
        file: UploadFile,
        name: str,
        version: str,
        task: AnalysisTask,
        description: str | None,
        source_name: str | None,
        source_url: str | None,
        license_name: str | None,
    ) -> DatasetVersion:
        original_filename = file.filename or "dataset.csv"

        if not original_filename.lower().endswith(".csv"):
            raise UnsupportedDatasetFileError

        upload_id = uuid.uuid4()

        raw_directory = ROOT_DIR / "research" / "data" / "external" / str(upload_id)

        processed_directory = (
            ROOT_DIR / "research" / "data" / "processed" / str(upload_id)
        )

        raw_directory.mkdir(
            parents=True,
            exist_ok=True,
        )

        source_path = raw_directory / "source.csv"

        try:
            with source_path.open("wb") as destination:
                shutil.copyfileobj(
                    file.file,
                    destination,
                )

            result = process_dataset(
                source_path=source_path,
                output_directory=(processed_directory),
            )

            dataset_version = self._build_dataset_version(
                name=name,
                version=version,
                task=task,
                description=description,
                source_name=source_name,
                source_url=source_url,
                license_name=license_name,
                result=result,
                preprocessing_config={
                    "workflow": ("legacy_direct_upload"),
                    "duplicate_key": "text",
                    "missing_rows_removed": True,
                    "random_seed": 42,
                    "split": {
                        "train": 0.80,
                        "validation": 0.10,
                        "test": 0.10,
                    },
                },
            )

            return await self.repository.add(dataset_version)

        except Exception:
            shutil.rmtree(
                raw_directory,
                ignore_errors=True,
            )

            shutil.rmtree(
                processed_directory,
                ignore_errors=True,
            )

            raise

    async def register_inspected_dataset(
        self,
        *,
        payload: DatasetRegistrationRequest,
    ) -> DatasetVersion:
        mapping_service = DatasetMappingService()

        validation = mapping_service.validate_mapping(
            payload=payload,
        )

        if not bool(
            validation.get(
                "can_register",
                False,
            )
        ):
            raise DatasetRegistrationError(
                "The selected mapping does not produce a registerable dataset."
            )

        source_path = mapping_service._resolve_source_path(payload.upload_id)

        mapping_service._validate_not_expired(source_path)

        registration_id = uuid.uuid4()

        raw_directory = (
            ROOT_DIR / "research" / "data" / "external" / str(registration_id)
        )

        processed_directory = (
            ROOT_DIR / "research" / "data" / "processed" / str(registration_id)
        )

        inspection_directory = source_path.parent

        raw_directory.mkdir(
            parents=True,
            exist_ok=False,
        )

        original_path = raw_directory / "original.csv"

        normalized_source_path = raw_directory / "source.csv"

        try:
            shutil.copy2(
                source_path,
                original_path,
            )

            normalized_dataframe = self._prepare_mapped_dataframe(
                source_path=source_path,
                payload=payload,
                mapping_service=(mapping_service),
            )

            normalized_dataframe.to_csv(
                normalized_source_path,
                index=False,
                encoding="utf-8",
            )

            result = process_dataset(
                source_path=(normalized_source_path),
                output_directory=(processed_directory),
            )

            task = AnalysisTask(payload.task)

            preprocessing_config = {
                "workflow": ("inspection_mapping_registration"),
                "inspection_upload_id": (str(payload.upload_id)),
                "source_filename": (validation["filename"]),
                "source_columns": {
                    "text": (payload.text_column),
                    "label": (payload.label_column),
                },
                "label_mapping": dict(validation["label_mapping"]),
                "cleaning": {
                    "drop_empty_text": (payload.drop_empty_text),
                    "drop_empty_label": (payload.drop_empty_label),
                    "drop_duplicates": (payload.drop_duplicates),
                    "exclude_replacement_character_rows": (
                        payload.exclude_replacement_character_rows
                    ),
                },
                "mapping_validation": {
                    "total_rows": (validation["total_rows"]),
                    "valid_rows": (validation["valid_rows"]),
                    "invalid_rows": (validation["invalid_rows"]),
                    "empty_text_rows": (validation["empty_text_rows"]),
                    "empty_label_rows": (validation["empty_label_rows"]),
                    "unmapped_label_rows": (validation["unmapped_label_rows"]),
                    "duplicate_text_rows": (validation["duplicate_text_rows"]),
                    "replacement_character_rows": (
                        validation["replacement_character_rows"]
                    ),
                    "warnings": list(validation["warnings"]),
                },
                "duplicate_key": "text",
                "random_seed": 42,
                "split": {
                    "train": 0.80,
                    "validation": 0.10,
                    "test": 0.10,
                },
                "original_file_path": str(original_path),
                "normalized_source_path": str(normalized_source_path),
            }

            dataset_version = self._build_dataset_version(
                name=payload.name,
                version=payload.version,
                task=task,
                description=(payload.description),
                source_name=(payload.source_name),
                source_url=(payload.source_url),
                license_name=(payload.license_name),
                result=result,
                preprocessing_config=(preprocessing_config),
            )

            registered_dataset = await self.repository.add(dataset_version)

        except Exception:
            await self.session.rollback()

            shutil.rmtree(
                raw_directory,
                ignore_errors=True,
            )

            shutil.rmtree(
                processed_directory,
                ignore_errors=True,
            )

            raise

        shutil.rmtree(
            inspection_directory,
            ignore_errors=True,
        )

        return registered_dataset

    def _prepare_mapped_dataframe(
        self,
        *,
        source_path: Path,
        payload: DatasetRegistrationRequest,
        mapping_service: DatasetMappingService,
    ) -> pd.DataFrame:
        encoding = mapping_service._detect_encoding(source_path)

        delimiter = mapping_service._detect_delimiter(
            source_path,
            encoding,
        )

        dataframe = mapping_service._read_dataframe(
            path=source_path,
            encoding=encoding,
            delimiter=delimiter,
        )

        dataframe.columns = [str(column).strip() for column in dataframe.columns]

        mapping_service._validate_columns(
            dataframe=dataframe,
            text_column=(payload.text_column),
            label_column=(payload.label_column),
        )

        working = dataframe[
            [
                payload.text_column,
                payload.label_column,
            ]
        ].copy()

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

        normalized_mapping = {
            self._canonical_label_value(source): target.strip()
            for source, target in payload.label_mapping.items()
        }

        working["_label"] = working["_source_label"].map(normalized_mapping)

        working["_contains_replacement_character"] = working["_text"].str.contains(
            "\ufffd",
            regex=False,
            na=False,
        )

        valid_mask = pd.Series(
            True,
            index=working.index,
        )

        if payload.drop_empty_text:
            valid_mask &= working["_text"] != ""

        if payload.drop_empty_label:
            valid_mask &= working["_source_label"] != ""

        valid_mask &= working["_label"].notna()

        if payload.drop_duplicates:
            duplicate_mask = working["_text"].duplicated(keep="first") & (
                working["_text"] != ""
            )

            valid_mask &= ~duplicate_mask

        if payload.exclude_replacement_character_rows:
            valid_mask &= ~working["_contains_replacement_character"]

        prepared = working.loc[
            valid_mask,
            [
                "_text",
                "_label",
            ],
        ].copy()

        prepared.columns = [
            "text",
            "label",
        ]

        prepared["text"] = prepared["text"].astype("string").fillna("").str.strip()

        prepared["label"] = prepared["label"].astype("string").fillna("").str.strip()

        prepared = prepared[
            (prepared["text"] != "") & (prepared["label"] != "")
        ].reset_index(drop=True)

        if len(prepared) < 20:
            raise DatasetRegistrationError(
                "Fewer than 20 valid rows remain after processing."
            )

        if prepared["label"].nunique() < 2:
            raise DatasetRegistrationError(
                "The registered dataset must contain at least two labels."
            )

        return prepared

    def _canonical_label_value(
        self,
        value: Any,
    ) -> str:
        if value is None:
            return ""

        try:
            if pd.isna(value):
                return ""
        except (
            TypeError,
            ValueError,
        ):
            pass

        if isinstance(
            value,
            bool,
        ):
            return "1" if value else "0"

        if isinstance(
            value,
            int,
        ):
            return str(value)

        if isinstance(
            value,
            float,
        ):
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

    def _build_dataset_version(
        self,
        *,
        name: str,
        version: str,
        task: AnalysisTask,
        description: str | None,
        source_name: str | None,
        source_url: str | None,
        license_name: str | None,
        result: DatasetProcessingResult,
        preprocessing_config: dict[
            str,
            Any,
        ],
    ) -> DatasetVersion:
        return DatasetVersion(
            name=name.strip(),
            version=version.strip(),
            description=description,
            source_name=source_name,
            source_url=source_url,
            license_name=license_name,
            task=task,
            total_samples=(result.total_samples),
            train_samples=(result.train_samples),
            validation_samples=(result.validation_samples),
            test_samples=(result.test_samples),
            manifest_path=(result.manifest_path),
            checksum=result.checksum,
            label_schema=(result.label_schema),
            preprocessing_config=(preprocessing_config),
        )
