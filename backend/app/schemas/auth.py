from pydantic import EmailStr, Field

from app.schemas.common import ORMModel
from app.schemas.user import UserRead


class RegisterRequest(ORMModel):
    email: EmailStr

    full_name: str = Field(
        min_length=2,
        max_length=150,
    )

    password: str = Field(
        min_length=8,
        max_length=128,
    )


class ChangePasswordRequest(ORMModel):
    current_password: str = Field(
        min_length=1,
        max_length=128,
    )

    new_password: str = Field(
        min_length=8,
        max_length=128,
    )


class ChangePasswordResponse(ORMModel):
    message: str


class TokenResponse(ORMModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead
