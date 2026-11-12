from __future__ import annotations

import uuid
from typing import Any

from pydantic import Field, field_validator, model_validator

from app.schemas.common import ORMModel


class DatasetMappingValidationRequest(ORMModel):
    upload_id: uuid.UUID

    text_column: str = Field(
        min_length=1,
        max_length=255,
    )

    label_column: str = Field(
        min_length=1,
        max_length=255,
    )

    label_mapping: dict[str, str] = Field(
        min_length=2,
    )

    drop_empty_text: bool = True
    drop_empty_label: bool = True
    drop_duplicates: bool = True

    exclude_replacement_character_rows: bool = False

    preview_rows: int = Field(
        default=20,
        ge=1,
        le=100,
    )

    @field_validator(
        "text_column",
        "label_column",
    )
    @classmethod
    def clean_column_name(
        cls,
        value: str,
    ) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError("Column names must not be empty.")

        return cleaned

    @field_validator("label_mapping")
    @classmethod
    def clean_label_mapping(
        cls,
        value: dict[str, str],
    ) -> dict[str, str]:
        cleaned: dict[str, str] = {}

        for source_value, target_label in value.items():
            source = str(source_value).strip()
            target = str(target_label).strip()

            if not source:
                raise ValueError("Label mapping source values must not be empty.")

            if not target:
                raise ValueError("Mapped labels must not be empty.")

            cleaned[source] = target

        if len(cleaned) < 2:
            raise ValueError("At least two label mappings are required.")

        if len(set(cleaned.values())) < 2:
            raise ValueError("The mapping must produce at least two distinct labels.")

        return cleaned

    @model_validator(mode="after")
    def validate_different_columns(
        self,
    ) -> "DatasetMappingValidationRequest":
        if self.text_column == self.label_column:
            raise ValueError("The text column and label column must be different.")

        return self


class DatasetMappingPreviewRow(ORMModel):
    source_row_number: int
    text: str
    source_label: str
    label: str

    contains_replacement_character: bool


class DatasetMappingValidationResponse(ORMModel):
    upload_id: uuid.UUID

    filename: str
    encoding: str
    delimiter: str

    text_column: str
    label_column: str

    total_rows: int
    valid_rows: int
    invalid_rows: int

    empty_text_rows: int
    empty_label_rows: int
    unmapped_label_rows: int
    duplicate_text_rows: int
    replacement_character_rows: int

    source_label_distribution: dict[str, int]
    mapped_label_distribution: dict[str, int]

    label_mapping: dict[str, str]

    preview_rows: list[DatasetMappingPreviewRow]

    warnings: list[str]
    can_register: bool

    validation_configuration: dict[str, Any]


class DatasetRegistrationRequest(DatasetMappingValidationRequest):
    name: str = Field(
        min_length=2,
        max_length=150,
    )

    version: str = Field(
        min_length=1,
        max_length=50,
    )

    task: str = Field(
        pattern="^(hate_speech|sentiment)$",
    )

    description: str | None = Field(
        default=None,
        max_length=5000,
    )

    source_name: str | None = Field(
        default=None,
        max_length=255,
    )

    source_url: str | None = Field(
        default=None,
        max_length=500,
    )

    license_name: str | None = Field(
        default=None,
        max_length=150,
    )

    @field_validator(
        "name",
        "version",
    )
    @classmethod
    def clean_required_metadata(
        cls,
        value: str,
    ) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError("Dataset name and version must not be empty.")

        return cleaned

    @field_validator(
        "description",
        "source_name",
        "source_url",
        "license_name",
    )
    @classmethod
    def clean_optional_metadata(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        cleaned = value.strip()

        return cleaned or None
