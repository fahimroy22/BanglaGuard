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
from app.schemas.user import UserUpdate


class EmailAlreadyRegisteredError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


class InvalidCurrentPasswordError(Exception):
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
        active: bool = True,
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
            is_active=active,
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

    async def update_profile(
        self,
        *,
        user: User,
        payload: UserUpdate,
    ) -> User:
        update_data = payload.model_dump(
            exclude_unset=True,
        )

        if "full_name" in update_data:
            full_name = update_data["full_name"]

            if full_name is not None:
                user.full_name = full_name.strip()

        if "email" in update_data:
            email = update_data["email"]

            if email is not None:
                normalized_email = str(email).strip().lower()

                if normalized_email != user.email.lower():
                    existing_user = await self.users.get_by_email(
                        normalized_email,
                    )

                    if existing_user is not None and existing_user.id != user.id:
                        raise EmailAlreadyRegisteredError

                    user.email = normalized_email

        await self.session.commit()
        await self.session.refresh(user)

        return user

    async def change_password(
        self,
        *,
        user: User,
        current_password: str,
        new_password: str,
    ) -> None:
        if not verify_password(
            current_password,
            user.hashed_password,
        ):
            raise InvalidCurrentPasswordError

        user.hashed_password = hash_password(
            new_password,
        )

        await self.session.commit()
        await self.session.refresh(user)

    def issue_access_token(
        self,
        user: User,
        expires_minutes: int | None = None,
    ) -> str:
        return create_access_token(
            user_id=user.id,
            role=user.role.value,
            expires_minutes=expires_minutes,
        )
