from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.db.models import User
from app.db.repositories.user import UserRepository
from app.domain.enums import UserRole
from app.schemas.auth import RegisterRequest


class EmailAlreadyRegisteredError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


class AuthService:
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self.session = session
        self.users = UserRepository(session)

    async def register(
        self,
        payload: RegisterRequest,
    ) -> User:
        existing_user = await self.users.get_by_email(
            payload.email,
        )

        if existing_user is not None:
            raise EmailAlreadyRegisteredError

        user = User(
            email=payload.email.lower(),
            full_name=payload.full_name.strip(),
            hashed_password=hash_password(
                payload.password,
            ),
            role=UserRole.USER,
            is_active=True,
        )

        return await self.users.add(user)

    async def authenticate(
        self,
        email: str,
        password: str,
    ) -> User:
        user = await self.users.get_by_email(email)

        if user is None:
            raise InvalidCredentialsError

        if not user.is_active:
            raise InvalidCredentialsError

        if not verify_password(
            password,
            user.hashed_password,
        ):
            raise InvalidCredentialsError

        return user

    def issue_access_token(
        self,
        user: User,
    ) -> str:
        return create_access_token(
            user_id=user.id,
            role=user.role.value,
        )