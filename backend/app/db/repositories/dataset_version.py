from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DatasetVersion
from app.db.repositories.base import BaseRepository


class DatasetVersionRepository(
    BaseRepository[DatasetVersion]
):
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        super().__init__(
            DatasetVersion,
            session,
        )