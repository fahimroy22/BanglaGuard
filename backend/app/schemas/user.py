import uuid
from datetime import datetime

from pydantic import EmailStr, Field

from app.domain.enums import UserRole
from app.schemas.common import ORMModel


class UserCreate(ORMModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=150)
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.USER


class UserUpdate(ORMModel):
    full_name: str | None = Field(
        default=None,
        min_length=2,
        max_length=150,
    )

    email: EmailStr | None = None


class UserRead(ORMModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AvatarUpdateResponse(ORMModel):
    message: str
    has_avatar: bool
