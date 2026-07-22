from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.config import settings
from app.db.models import User
from app.db.session import get_db_session
from app.domain.services.auth import (
    AuthService,
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
)
from app.schemas.auth import (
    RegisterRequest,
    TokenResponse,
)
from app.schemas.user import UserRead


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
async def register_user(
    payload: RegisterRequest,
    session: AsyncSession = Depends(get_db_session),
) -> User:
    service = AuthService(session)

    try:
        return await service.register(payload)

    except EmailAlreadyRegisteredError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )


@router.post(
    "/login",
    response_model=TokenResponse,
)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    service = AuthService(session)

    try:
        user = await service.authenticate(
            email=form_data.username,
            password=form_data.password,
        )

    except InvalidCredentialsError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = service.issue_access_token(user)

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=(
            settings.access_token_expire_minutes * 60
        ),
        user=UserRead.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserRead,
)
async def get_my_account(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user