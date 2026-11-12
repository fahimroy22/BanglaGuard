import uuid
from typing import Literal

from pydantic import Field, model_validator

from app.schemas.common import ORMModel
from app.schemas.dataset_version import DatasetVersionRead


class DatasetCleanedVersionCreate(ORMModel):
    version: str = Field(
        min_length=1,
        max_length=50,
    )

    name: str | None = Field(
        default=None,
        min_length=2,
        max_length=150,
    )

    description: str | None = Field(
        default=None,
        max_length=4000,
    )

    remove_replacement_character_rows: bool = True
    drop_empty_text: bool = True
    drop_empty_label: bool = True
    drop_duplicates: bool = True

    random_seed: int = Field(
        default=42,
        ge=0,
        le=2_147_483_647,
    )

    @model_validator(mode="after")
    def require_cleaning_operation(
        self,
    ) -> "DatasetCleanedVersionCreate":
        if not any(
            (
                self.remove_replacement_character_rows,
                self.drop_empty_text,
                self.drop_empty_label,
                self.drop_duplicates,
            )
        ):
            raise ValueError("At least one dataset-cleaning operation must be enabled.")

        return self


class DatasetCleaningCounts(ORMModel):
    source_rows: int
    cleaned_rows: int
    removed_rows: int

    removed_replacement_character_rows: int
    removed_empty_text_rows: int
    removed_empty_label_rows: int
    removed_duplicate_text_rows: int


class DatasetCleanedVersionRead(ORMModel):
    source_dataset_version_id: uuid.UUID
    cleaned_dataset: DatasetVersionRead

    cleaning_counts: DatasetCleaningCounts

    source_version_preserved: Literal[True] = True
