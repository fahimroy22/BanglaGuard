import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Feedback
from app.db.repositories.base import BaseRepository


class FeedbackRepository(
    BaseRepository[Feedback]
):
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        super().__init__(
            Feedback,
            session,
        )

    async def get_by_prediction_and_user(
        self,
        prediction_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Feedback | None:
        statement = select(Feedback).where(
            Feedback.prediction_id
            == prediction_id,
            Feedback.user_id == user_id,
        )

        result = await self.session.scalars(
            statement
        )

        return result.first()

    async def list_for_user(
        self,
        user_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Feedback]:
        statement = (
            select(Feedback)
            .where(
                Feedback.user_id == user_id
            )
            .order_by(
                Feedback.created_at.desc()
            )
            .offset(offset)
            .limit(limit)
        )

        result = await self.session.scalars(
            statement
        )

        return list(result.all())

    async def list_for_review(
        self,
        status_value: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Feedback]:
        statement = select(Feedback)

        if status_value is not None:
            statement = statement.where(
                Feedback.status == status_value
            )

        statement = (
            statement
            .order_by(
                Feedback.created_at.desc()
            )
            .offset(offset)
            .limit(limit)
        )

        result = await self.session.scalars(
            statement
        )

        return list(result.all())