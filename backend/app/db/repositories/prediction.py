import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Prediction
from app.db.repositories.base import BaseRepository


class PredictionRepository(
    BaseRepository[Prediction]
):
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        super().__init__(
            Prediction,
            session,
        )

    async def list_for_user(
        self,
        user_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Prediction]:
        statement = (
            select(Prediction)
            .where(Prediction.user_id == user_id)
            .order_by(Prediction.created_at.desc())
            .offset(offset)
            .limit(limit)
        )

        result = await self.session.scalars(statement)

        return list(result.all())

    async def get_for_user(
        self,
        prediction_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Prediction | None:
        statement = select(Prediction).where(
            Prediction.id == prediction_id,
            Prediction.user_id == user_id,
        )

        result = await self.session.scalars(statement)

        return result.first()