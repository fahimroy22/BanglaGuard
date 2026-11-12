from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import ROOT_DIR
from app.db.models import DatasetVersion
from app.db.repositories.dataset_version import (
    DatasetVersionRepository,
)
from app.domain.services.dataset_artifacts import (
    DatasetArtifactService,
)
from app.ml.dataset_processing import process_dataset
from app.schemas.dataset_cleaning import (
    DatasetCleanedVersionCreate,
)


class DatasetCleaningError(Exception):
    """Base exception for cleaned dataset creation failures."""


class DatasetCleaningVersionConflictError(DatasetCleaningError):
    """Raised when the requested dataset version already exists."""


class DatasetCleaningInsufficientRowsError(DatasetCleaningError):
    """Raised when too few rows remain after cleaning."""


class DatasetCleaningLabelsError(DatasetCleaningError):
    """Raised when fewer than two labels remain after cleaning."""


class DatasetCleaningService:
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self.session = session

        self.repository = DatasetVersionRepository(session)

        self.artifact_service = DatasetArtifactService()

    async def create_cleaned_version(
        self,
        *,
        source_dataset: DatasetVersion,
        payload: DatasetCleanedVersionCreate,
    ) -> tuple[
        DatasetVersion,
        dict[str, int],
    ]:
        target_name = payload.name.strip() if payload.name else source_dataset.name

        target_version = payload.version.strip()

        existing = await self.repository.get_by_identity(
            name=target_name,
            version=target_version,
            task=source_dataset.task,
        )

        if existing is not None:
            raise DatasetCleaningVersionConflictError(
                "A dataset with the same name, version, and task already exists."
            )

        source_artifact = self.artifact_service.get_download_file(
            dataset_version=source_dataset,
            file_key="processed",
        )

        source_path = Path(str(source_artifact["path"]))

        dataframe = self._read_source_dataframe(source_path)

        cleaned_dataframe, cleaning_counts = self.clean_dataframe(
            dataframe=dataframe,
            remove_replacement_character_rows=(
                payload.remove_replacement_character_rows
            ),
            drop_empty_text=(payload.drop_empty_text),
            drop_empty_label=(payload.drop_empty_label),
            drop_duplicates=(payload.drop_duplicates),
        )

        if len(cleaned_dataframe) < 20:
            raise DatasetCleaningInsufficientRowsError(
                "Fewer than 20 valid rows remain after dataset cleaning."
            )

        if cleaned_dataframe["label"].nunique() < 2:
            raise DatasetCleaningLabelsError(
                "The cleaned dataset must contain at least two distinct labels."
            )

        cleaning_id = uuid.uuid4()

        raw_directory = ROOT_DIR / "research" / "data" / "external" / str(cleaning_id)

        processed_directory = (
            ROOT_DIR / "research" / "data" / "processed" / str(cleaning_id)
        )

        raw_directory.mkdir(
            parents=True,
            exist_ok=False,
        )

        original_source_path = raw_directory / "original-processed.csv"

        cleaned_source_path = raw_directory / "source.csv"

        try:
            shutil.copy2(
                source_path,
                original_source_path,
            )

            cleaned_dataframe.to_csv(
                cleaned_source_path,
                index=False,
                encoding="utf-8",
            )

            result = process_dataset(
                source_path=cleaned_source_path,
                output_directory=processed_directory,
                random_seed=payload.random_seed,
            )

            description = self._build_description(
                source_dataset=source_dataset,
                payload=payload,
            )

            preprocessing_config = {
                "workflow": ("derived_dataset_cleaning"),
                "parent_dataset_version_id": (str(source_dataset.id)),
                "parent_dataset": {
                    "name": source_dataset.name,
                    "version": (source_dataset.version),
                    "task": (
                        source_dataset.task.value
                        if hasattr(
                            source_dataset.task,
                            "value",
                        )
                        else str(source_dataset.task)
                    ),
                    "manifest_path": (source_dataset.manifest_path),
                    "checksum": (source_dataset.checksum),
                },
                "cleaning": {
                    "remove_replacement_character_rows": (
                        payload.remove_replacement_character_rows
                    ),
                    "drop_empty_text": (payload.drop_empty_text),
                    "drop_empty_label": (payload.drop_empty_label),
                    "drop_duplicates": (payload.drop_duplicates),
                },
                "cleaning_counts": dict(cleaning_counts),
                "duplicate_key": "text",
                "random_seed": (payload.random_seed),
                "split": {
                    "train": 0.80,
                    "validation": 0.10,
                    "test": 0.10,
                },
                "original_processed_path": (str(original_source_path)),
                "cleaned_source_path": (str(cleaned_source_path)),
            }

            cleaned_dataset = DatasetVersion(
                name=target_name,
                version=target_version,
                description=description,
                source_name=(source_dataset.source_name),
                source_url=(source_dataset.source_url),
                license_name=(source_dataset.license_name),
                task=source_dataset.task,
                total_samples=(result.total_samples),
                train_samples=(result.train_samples),
                validation_samples=(result.validation_samples),
                test_samples=(result.test_samples),
                manifest_path=(result.manifest_path),
                checksum=result.checksum,
                label_schema=(result.label_schema),
                preprocessing_config=(preprocessing_config),
            )

            registered_dataset = await self.repository.add(cleaned_dataset)

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

        return (
            registered_dataset,
            cleaning_counts,
        )

    def clean_dataframe(
        self,
        *,
        dataframe: pd.DataFrame,
        remove_replacement_character_rows: bool,
        drop_empty_text: bool,
        drop_empty_label: bool,
        drop_duplicates: bool,
    ) -> tuple[
        pd.DataFrame,
        dict[str, int],
    ]:
        required_columns = {
            "text",
            "label",
        }

        missing_columns = required_columns - set(dataframe.columns)

        if missing_columns:
            raise DatasetCleaningError(
                "The source processed dataset is "
                "missing required columns: " + ", ".join(sorted(missing_columns))
            )

        working = dataframe[
            [
                "text",
                "label",
            ]
        ].copy()

        source_rows = int(len(working))

        working["text"] = working["text"].astype("string").fillna("").str.strip()

        working["label"] = working["label"].astype("string").fillna("").str.strip()

        empty_text_mask = working["text"] == ""

        empty_label_mask = working["label"] == ""

        replacement_mask = working["text"].str.contains(
            "\ufffd",
            regex=False,
            na=False,
        )

        duplicate_mask = (
            working["text"].duplicated(
                keep="first",
            )
            & ~empty_text_mask
        )

        valid_mask = pd.Series(
            True,
            index=working.index,
        )

        if drop_empty_text:
            valid_mask &= ~empty_text_mask

        if drop_empty_label:
            valid_mask &= ~empty_label_mask

        if remove_replacement_character_rows:
            valid_mask &= ~replacement_mask

        if drop_duplicates:
            valid_mask &= ~duplicate_mask

        cleaned = (
            working.loc[
                valid_mask,
                [
                    "text",
                    "label",
                ],
            ]
            .copy()
            .reset_index(drop=True)
        )

        cleaned_rows = int(len(cleaned))

        counts = {
            "source_rows": source_rows,
            "cleaned_rows": cleaned_rows,
            "removed_rows": (source_rows - cleaned_rows),
            "removed_replacement_character_rows": (
                int(replacement_mask.sum()) if remove_replacement_character_rows else 0
            ),
            "removed_empty_text_rows": (
                int(empty_text_mask.sum()) if drop_empty_text else 0
            ),
            "removed_empty_label_rows": (
                int(empty_label_mask.sum()) if drop_empty_label else 0
            ),
            "removed_duplicate_text_rows": (
                int(duplicate_mask.sum()) if drop_duplicates else 0
            ),
        }

        return cleaned, counts

    def _read_source_dataframe(
        self,
        source_path: Path,
    ) -> pd.DataFrame:
        try:
            return pd.read_csv(
                source_path,
                encoding="utf-8-sig",
                low_memory=False,
            )

        except Exception as exc:
            raise DatasetCleaningError(
                "The registered processed dataset could not be read as UTF-8 CSV."
            ) from exc

    def _build_description(
        self,
        *,
        source_dataset: DatasetVersion,
        payload: DatasetCleanedVersionCreate,
    ) -> str:
        if payload.description:
            return payload.description.strip()

        source_description = (
            source_dataset.description.strip() if source_dataset.description else ""
        )

        derived_note = (
            "Cleaned derivative of dataset "
            f"{source_dataset.name} "
            f"version {source_dataset.version}. "
            "Rows containing the Unicode "
            "replacement character were excluded "
            "and dataset splits were regenerated."
        )

        if source_description:
            return f"{source_description}\n\n{derived_note}"

        return derived_note
