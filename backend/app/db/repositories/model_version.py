from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ModelVersion
from app.domain.enums import AnalysisTask, ModelStatus
from app.db.repositories.base import BaseRepository


class ModelVersionRepository(
    BaseRepository[ModelVersion]
):
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        super().__init__(
            ModelVersion,
            session,
        )

    async def get_active_model(
        self,
        task: AnalysisTask,
    ) -> ModelVersion | None:
        statement = select(ModelVersion).where(
            ModelVersion.task == task,
            ModelVersion.status == ModelStatus.ACTIVE,
        )

        result = await self.session.scalars(statement)

        return result.first()