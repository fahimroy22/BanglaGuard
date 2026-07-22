import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.db.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        super().__init__(User, session)

    async def get_by_email(
        self,
        email: str,
    ) -> User | None:
        statement = select(User).where(
            User.email == email.lower(),
        )

        result = await self.session.scalars(statement)

        return result.first()

    async def get_active_by_id(
        self,
        user_id: uuid.UUID,
    ) -> User | None:
        statement = select(User).where(
            User.id == user_id,
            User.is_active.is_(True),
        )

        result = await self.session.scalars(statement)

        return result.first()