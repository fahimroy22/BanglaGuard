import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ModelVersion
from app.db.repositories.base import BaseRepository
from app.domain.enums import AnalysisTask, ModelStatus


class ModelVersionRepository(BaseRepository[ModelVersion]):
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
            ModelVersion.is_archived.is_(False),
        )

        result = await self.session.scalars(statement)

        return result.first()

    async def activate(
        self,
        model_version_id: uuid.UUID,
    ) -> ModelVersion | None:
        target_statement = (
            select(ModelVersion)
            .where(ModelVersion.id == model_version_id)
            .with_for_update()
        )

        result = await self.session.scalars(target_statement)

        model_version = result.first()

        if model_version is None:
            return None

        task_lock_statement = (
            select(ModelVersion.id)
            .where(ModelVersion.task == model_version.task)
            .with_for_update()
        )

        await self.session.execute(task_lock_statement)

        if model_version.is_archived:
            raise ValueError("Restore this archived model before activating it.")

        if model_version.status == ModelStatus.ACTIVE:
            return model_version

        await self.session.execute(
            update(ModelVersion)
            .where(
                ModelVersion.task == model_version.task,
                ModelVersion.id != model_version.id,
                ModelVersion.status == ModelStatus.ACTIVE,
            ModelVersion.is_archived.is_(False),
            )
            .values(
                status=ModelStatus.RETIRED,
            )
        )

        model_version.status = ModelStatus.ACTIVE

        model_version.activated_at = datetime.now(timezone.utc)

        await self.session.commit()
        await self.session.refresh(model_version)

        return model_version

    async def set_archived(self, model_version_id: uuid.UUID, archived: bool):
        result = await self.session.scalars(
            select(ModelVersion).where(ModelVersion.id == model_version_id)
            .with_for_update().execution_options(populate_existing=True)
        )
        model = result.first()
        if model is None:
            return None
        if archived and model.status == ModelStatus.ACTIVE:
            raise ValueError("Activate another model for this task before archiving the active model.")
        model.is_archived = archived
        await self.session.flush()
        return model
