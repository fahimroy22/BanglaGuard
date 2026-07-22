import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Experiment
from app.db.repositories.base import BaseRepository


class ExperimentRepository(
    BaseRepository[Experiment]
):
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        super().__init__(
            Experiment,
            session,
        )

    async def list_by_dataset(
        self,
        dataset_version_id: uuid.UUID,
    ) -> list[Experiment]:
        statement = (
            select(Experiment)
            .where(
                Experiment.dataset_version_id
                == dataset_version_id
            )
            .order_by(
                Experiment.created_at.desc()
            )
        )

        result = await self.session.scalars(
            statement
        )

        return list(result.all())