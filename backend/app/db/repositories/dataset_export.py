import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DatasetExport
from app.db.repositories.base import BaseRepository
from app.domain.enums import DatasetExportStatus


class DatasetExportRepository(
    BaseRepository[DatasetExport]
):
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        super().__init__(
            DatasetExport,
            session,
        )

    async def list_for_user(
        self,
        user_id: uuid.UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> list[DatasetExport]:
        statement = (
            select(DatasetExport)
            .where(
                DatasetExport.created_by_id
                == user_id
            )
            .order_by(
                DatasetExport.created_at.desc()
            )
            .offset(offset)
            .limit(limit)
        )

        result = await self.session.scalars(
            statement
        )

        return list(result.all())

    async def get_for_user(
        self,
        export_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> DatasetExport | None:
        statement = select(
            DatasetExport
        ).where(
            DatasetExport.id == export_id,
            DatasetExport.created_by_id
            == user_id,
        )

        result = await self.session.scalars(
            statement
        )

        return result.first()

    async def list_by_status(
        self,
        status_value: DatasetExportStatus,
        limit: int = 100,
        offset: int = 0,
    ) -> list[DatasetExport]:
        statement = (
            select(DatasetExport)
            .where(
                DatasetExport.status
                == status_value
            )
            .order_by(
                DatasetExport.created_at.desc()
            )
            .offset(offset)
            .limit(limit)
        )

        result = await self.session.scalars(
            statement
        )

        return list(result.all())
