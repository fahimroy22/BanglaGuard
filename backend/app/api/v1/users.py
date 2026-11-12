import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_admin
from app.db.models import User
from app.db.repositories.user import UserRepository
from app.db.session import get_db_session
from app.domain.enums import UserRole
from app.domain.services.audit import AuditService
from app.schemas.user import UserRead

router = APIRouter(prefix="/users", tags=["Users"])


class AccessUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: UserRole
    is_active: bool


@router.get("", response_model=list[UserRead])
async def list_users(current_admin: User = Depends(require_admin), session: AsyncSession = Depends(get_db_session)) -> list[User]:
    return await UserRepository(session).list()


async def locked_target(session: AsyncSession, user_id: uuid.UUID, actor: User) -> User:
    # Serialize administrative access changes, including concurrent demotions.
    users = list((await session.scalars(select(User).order_by(User.id).with_for_update().execution_options(populate_existing=True))).all())
    current = next((u for u in users if u.id == actor.id), None)
    if current is None or not current.is_active or current.role != UserRole.ADMIN:
        raise HTTPException(403, "Administrator access required")
    target = next((u for u in users if u.id == user_id), None)
    if target is None:
        raise HTTPException(404, "User not found")
    if target.id == actor.id:
        raise HTTPException(409, "Ask another administrator to change your access or revoke your sessions")
    return target


@router.patch("/{user_id}/access", response_model=UserRead)
async def update_access(user_id: uuid.UUID, payload: AccessUpdate, request: Request, actor: User = Depends(require_admin), session: AsyncSession = Depends(get_db_session)) -> User:
    target = await locked_target(session, user_id, actor)
    before = {"role": target.role.value, "is_active": target.is_active}
    after = {"role": payload.role.value, "is_active": payload.is_active}
    if before == after:
        return target
    target.role = payload.role
    target.is_active = payload.is_active
    # AuditService commits the access update and revocation record atomically.
    await AuditService(session).record(request=request, action="admin.sessions_revoked", user_id=actor.id, resource_type="user", resource_id=str(target.id), details={"reason": "access_changed", "before": before, "after": after})
    return target


@router.post("/{user_id}/revoke-sessions")
async def revoke_sessions(user_id: uuid.UUID, request: Request, actor: User = Depends(require_admin), session: AsyncSession = Depends(get_db_session)) -> dict[str, str]:
    target = await locked_target(session, user_id, actor)
    await AuditService(session).record(request=request, action="admin.sessions_revoked", user_id=actor.id, resource_type="user", resource_id=str(target.id), details={"reason": "administrator_request"})
    return {"message": "Existing sessions revoked. A fresh login is required."}
