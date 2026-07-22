import uuid
from typing import Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base


ModelType = TypeVar(
    "ModelType",
    bound=Base,
)


class BaseRepository(Generic[ModelType]):
    def __init__(
        self,
        model: type[ModelType],
        session: AsyncSession,
    ) -> None:
        self.model = model
        self.session = session

    async def get(
        self,
        object_id: uuid.UUID,
    ) -> ModelType | None:
        return await self.session.get(
            self.model,
            object_id,
        )

    async def list(
        self,
        limit: int = 100,
        offset: int = 0,
    ) -> list[ModelType]:
        statement = (
            select(self.model)
            .offset(offset)
            .limit(limit)
        )

        result = await self.session.scalars(statement)

        return list(result.all())

    async def add(
        self,
        instance: ModelType,
    ) -> ModelType:
        self.session.add(instance)

        await self.session.commit()
        await self.session.refresh(instance)

        return instance

    async def delete(
        self,
        instance: ModelType,
    ) -> None:
        await self.session.delete(instance)
        await self.session.commit()