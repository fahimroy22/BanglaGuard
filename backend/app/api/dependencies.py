import uuid
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import AuditLog

from app.core.security import decode_access_token
from app.db.models import User
from app.db.repositories.user import UserRepository
from app.db.session import get_db_session
from app.domain.enums import UserRole


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login",
)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_db_session),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(token)

        if payload.get("type") != "access":
            raise credentials_error

        user_id = uuid.UUID(payload["sub"])

    except (
        jwt.InvalidTokenError,
        KeyError,
        TypeError,
        ValueError,
    ):
        raise credentials_error

    repository = UserRepository(session)

    user = await repository.get_active_by_id(user_id)

    if user is None:
        raise credentials_error

    revoked_at = await session.scalar(
        select(AuditLog.created_at).where(
            AuditLog.action == "admin.sessions_revoked",
            AuditLog.resource_type == "user",
            AuditLog.resource_id == str(user.id),
        ).order_by(AuditLog.created_at.desc()).limit(1)
    )
    if revoked_at is not None and float(payload["iat"]) <= revoked_at.timestamp():
        raise credentials_error

    return user


def require_roles(
    *allowed_roles: UserRole,
) -> Callable:
    async def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )

        return current_user

    return role_checker


require_admin = require_roles(UserRole.ADMIN)

require_researcher_or_admin = require_roles(
    UserRole.RESEARCHER,
    UserRole.ADMIN,
)