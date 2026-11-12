from __future__ import annotations

from typing import Literal

from sqlalchemy import (
    String,
    cast,
    func,
    or_,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DatasetVersion
from app.db.repositories.base import BaseRepository
from app.domain.enums import AnalysisTask


DatasetSortField = Literal[
    "created_at",
    "updated_at",
    "name",
    "version",
    "total_samples",
]

DatasetSortOrder = Literal[
    "asc",
    "desc",
]


class DatasetVersionRepository(BaseRepository[DatasetVersion]):
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        super().__init__(
            DatasetVersion,
            session,
        )

    async def get_by_identity(
        self,
        *,
        name: str,
        version: str,
        task: AnalysisTask,
    ) -> DatasetVersion | None:
        statement = select(DatasetVersion).where(
            func.lower(DatasetVersion.name) == name.strip().lower(),
            DatasetVersion.version == version.strip(),
            DatasetVersion.task == task,
        )

        result = await self.session.scalar(statement)

        return result

    async def list_filtered(
        self,
        *,
        search: str | None = None,
        task: AnalysisTask | None = None,
        limit: int = 50,
        offset: int = 0,
        sort_by: DatasetSortField = "created_at",
        sort_order: DatasetSortOrder = "desc",
    ) -> tuple[list[DatasetVersion], int]:
        filters = []

        normalized_search = search.strip() if search else ""

        if normalized_search:
            pattern = f"%{normalized_search}%"

            filters.append(
                or_(
                    DatasetVersion.name.ilike(pattern),
                    DatasetVersion.version.ilike(pattern),
                    DatasetVersion.description.ilike(pattern),
                    DatasetVersion.source_name.ilike(pattern),
                    DatasetVersion.license_name.ilike(pattern),
                    cast(
                        DatasetVersion.task,
                        String,
                    ).ilike(pattern),
                )
            )

        if task is not None:
            filters.append(DatasetVersion.task == task)

        count_statement = select(func.count(DatasetVersion.id))

        if filters:
            count_statement = count_statement.where(*filters)

        total_result = await self.session.scalar(count_statement)

        total = int(total_result or 0)

        sort_columns = {
            "created_at": DatasetVersion.created_at,
            "updated_at": DatasetVersion.updated_at,
            "name": DatasetVersion.name,
            "version": DatasetVersion.version,
            "total_samples": (DatasetVersion.total_samples),
        }

        sort_column = sort_columns[sort_by]

        ordering = sort_column.asc() if sort_order == "asc" else sort_column.desc()

        statement = (
            select(DatasetVersion)
            .order_by(
                ordering,
                DatasetVersion.id.asc(),
            )
            .offset(offset)
            .limit(limit)
        )

        if filters:
            statement = statement.where(*filters)

        result = await self.session.scalars(statement)

        return (
            list(result.all()),
            total,
        )

    async def get_summary(
        self,
    ) -> dict[str, int]:
        statement = select(
            func.count(DatasetVersion.id).label("total_datasets"),
            func.count(DatasetVersion.id)
            .filter(DatasetVersion.task == AnalysisTask.HATE_SPEECH)
            .label("hate_speech_datasets"),
            func.count(DatasetVersion.id)
            .filter(DatasetVersion.task == AnalysisTask.SENTIMENT)
            .label("sentiment_datasets"),
            func.coalesce(
                func.sum(DatasetVersion.total_samples),
                0,
            ).label("total_samples"),
            func.coalesce(
                func.sum(DatasetVersion.train_samples),
                0,
            ).label("train_samples"),
            func.coalesce(
                func.sum(DatasetVersion.validation_samples),
                0,
            ).label("validation_samples"),
            func.coalesce(
                func.sum(DatasetVersion.test_samples),
                0,
            ).label("test_samples"),
            func.count(DatasetVersion.id)
            .filter(DatasetVersion.manifest_path.is_not(None))
            .label("datasets_with_manifest"),
            func.count(DatasetVersion.id)
            .filter(DatasetVersion.checksum.is_not(None))
            .label("datasets_with_checksum"),
        )

        result = await self.session.execute(statement)

        row = result.one()

        return {
            "total_datasets": int(row.total_datasets or 0),
            "hate_speech_datasets": int(row.hate_speech_datasets or 0),
            "sentiment_datasets": int(row.sentiment_datasets or 0),
            "total_samples": int(row.total_samples or 0),
            "train_samples": int(row.train_samples or 0),
            "validation_samples": int(row.validation_samples or 0),
            "test_samples": int(row.test_samples or 0),
            "datasets_with_manifest": int(row.datasets_with_manifest or 0),
            "datasets_with_checksum": int(row.datasets_with_checksum or 0),
        }
