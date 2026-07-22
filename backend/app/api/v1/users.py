from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_admin
from app.db.models import User
from app.db.repositories.user import UserRepository
from app.db.session import get_db_session
from app.schemas.user import UserRead


router = APIRouter(
    prefix="/users",
    tags=["Users"],
)


@router.get(
    "",
    response_model=list[UserRead],
)
async def list_users(
    current_admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_db_session),
) -> list[User]:
    repository = UserRepository(session)

    return await repository.list()