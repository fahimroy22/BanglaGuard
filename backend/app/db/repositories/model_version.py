import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ModelVersion
from app.db.repositories.base import BaseRepository
from app.domain.enums import AnalysisTask, ModelStatus


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

    async def activate(
        self,
        model_version_id: uuid.UUID,
    ) -> ModelVersion | None:
        model_version = await self.get(
            model_version_id
        )

        if model_version is None:
            return None

        await self.session.execute(
            update(ModelVersion)
            .where(
                ModelVersion.task
                == model_version.task,
                ModelVersion.id
                != model_version.id,
                ModelVersion.status
                == ModelStatus.ACTIVE,
            )
            .values(
                status=ModelStatus.RETIRED,
            )
        )

        model_version.status = ModelStatus.ACTIVE
        model_version.activated_at = datetime.now(
            timezone.utc
        )

        await self.session.commit()
        await self.session.refresh(model_version)

        return model_version