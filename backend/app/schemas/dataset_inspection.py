import uuid
from datetime import datetime
from typing import Any

from app.schemas.common import ORMModel


class DatasetColumnProfile(ORMModel):
    name: str
    inferred_dtype: str
    non_null_count: int
    null_count: int
    unique_count: int
    sample_values: list[Any]


class DatasetInspectionRead(ORMModel):
    upload_id: uuid.UUID

    filename: str
    content_type: str | None
    file_size_bytes: int

    encoding: str
    delimiter: str

    total_rows: int
    total_columns: int
    columns: list[str]

    sample_rows: list[dict[str, Any]]
    column_profiles: list[DatasetColumnProfile]

    suggested_text_column: str | None
    suggested_label_columns: list[str]

    temporary_path: str
    temporary_file_expires_at: datetime
