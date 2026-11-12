"""Requests shared by upload analysis and immutable dataset preparation."""

import uuid
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ResearchSource(BaseModel):
    dataset_id: uuid.UUID | None = None
    upload_id: uuid.UUID | None = None
    task: Literal["sentiment", "hate_speech"] = "sentiment"
    text_column: str = "text"
    label_column: str = "label"
    group_column: str | None = None
    label_mapping: dict[str, str] = Field(default_factory=dict, max_length=100)

    @model_validator(mode="after")
    def one_source(self):
        if (self.dataset_id is None) == (self.upload_id is None):
            raise ValueError("Choose exactly one dataset or upload.")
        if self.text_column == self.label_column:
            raise ValueError("Text and label columns must differ.")
        return self


class Preparation(BaseModel):
    trim_whitespace: bool = False
    normalize_unicode: bool = False
    collapse_whitespace: bool = False
    drop_empty: bool = False
    drop_invalid_labels: bool = False
    drop_replacement: bool = False
    drop_duplicates: bool = False
    conflicts: dict[str, str] = Field(default_factory=dict, max_length=10000)
    split_strategy: Literal["preserve", "stratified", "grouped"] = "preserve"
    seed: int = Field(default=42, ge=0, le=2147483647)
    train_fraction: float = Field(default=0.8, gt=0, lt=1)
    validation_fraction: float = Field(default=0.1, gt=0, lt=1)

    @model_validator(mode="after")
    def fractions(self):
        if self.train_fraction + self.validation_fraction >= 1:
            raise ValueError(
                "Training and validation fractions must leave a test split."
            )
        return self


class ResearchRequest(BaseModel):
    source: ResearchSource
    preparation: Preparation = Field(default_factory=Preparation)


class RowsRequest(ResearchRequest):
    issue: str = ""
    label: str = ""
    split: str = ""
    search: str = Field(default="", max_length=500)
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=25, ge=1, le=100)


class ResearchRegister(ResearchRequest):
    preview_token: str
    name: str = Field(min_length=2, max_length=150)
    version: str = Field(min_length=1, max_length=50)
    source_name: str = Field(default="", max_length=255)
    source_url: str = Field(default="", max_length=500)
    license_name: str = Field(default="", max_length=150)
    collection_notes: str = Field(default="", max_length=4000)
    cleaning_notes: str = Field(default="", max_length=4000)
    limitations: str = Field(default="", max_length=4000)
    label_definitions: dict[str, str] = Field(default_factory=dict, max_length=100)

    @model_validator(mode="after")
    def identity(self):
        self.name, self.version = self.name.strip(), self.version.strip()
        if len(self.name) < 2 or not self.version:
            raise ValueError("Enter a dataset name and version.")
        return self
