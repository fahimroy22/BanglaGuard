# FastAPI intentionally uses Depends in parameter defaults.
# ruff: noqa: B008
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.domain.services.platform_policy import load_policy, login_key, check_login_limit, record_failed_login
from app.core.redis import redis_client
from app.core.rate_limit import limiter
from app.db.models import User
from app.db.session import get_db_session
from app.domain.services.audit import AuditService
from app.domain.services.auth import (
    AuthService,
    EmailAlreadyRegisteredError,
    InvalidCredentialsError,
    InvalidCurrentPasswordError,
)
from app.domain.services.profile_avatar import (
    AvatarNotFoundError,
    AvatarValidationError,
    ProfileAvatarService,
    avatar_media_type,
)
from app.schemas.auth import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.user import (
    AvatarUpdateResponse,
    UserRead,
    UserUpdate,
)

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
    request: Request,
    payload: RegisterRequest,
    session: AsyncSession = Depends(get_db_session),
) -> User:
    policy = (await load_policy(session)).security
    if not policy.registration_enabled:
        raise HTTPException(403, "Public registration is disabled. Contact an administrator.")
    service = AuthService(session)

    try:
        user = await service.register(payload, active=not policy.approval_required)

    except EmailAlreadyRegisteredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="auth.registered",
        user_id=user.id,
        resource_type="user",
        resource_id=str(user.id),
        details={
            "role": user.role.value,
        },
    )

    return user


@router.post(
    "/login",
    response_model=TokenResponse,
)
@limiter.limit("10/minute")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(
        get_db_session,
    ),
) -> TokenResponse:
    policy = (await load_policy(session)).security
    key = login_key(form_data.username, request.client.host if request.client else "unknown")
    await check_login_limit(key, policy)
    service = AuthService(session)

    try:
        user = await service.authenticate(
            email=form_data.username,
            password=form_data.password,
        )

    except InvalidCredentialsError as exc:
        await record_failed_login(key, policy)
        audit_service = AuditService(session)

        await audit_service.record(
            request=request,
            action="auth.login_failed",
            user_id=None,
            resource_type="authentication",
            resource_id=None,
            details={
                "reason": "invalid_credentials",
            },
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="auth.login_succeeded",
        user_id=user.id,
        resource_type="user",
        resource_id=str(user.id),
        details={
            "role": user.role.value,
        },
    )

    if policy.failed_login_limit:
        await redis_client.delete(key)
    token = service.issue_access_token(user, expires_minutes=policy.session_minutes)

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=(policy.session_minutes * 60),
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


@router.patch(
    "/me",
    response_model=UserRead,
)
async def update_my_account(
    request: Request,
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(
        get_db_session,
    ),
) -> User:
    service = AuthService(session)

    previous_full_name = current_user.full_name
    previous_email = current_user.email

    try:
        updated_user = await service.update_profile(
            user=current_user,
            payload=payload,
        )

    except EmailAlreadyRegisteredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        ) from exc

    changed_fields: list[str] = []

    if updated_user.full_name != previous_full_name:
        changed_fields.append("full_name")

    if updated_user.email != previous_email:
        changed_fields.append("email")

    if changed_fields:
        audit_service = AuditService(session)

        await audit_service.record(
            request=request,
            action="account.profile_updated",
            user_id=current_user.id,
            resource_type="user",
            resource_id=str(current_user.id),
            details={
                "changed_fields": changed_fields,
            },
        )

    return updated_user


@router.post(
    "/change-password",
    response_model=ChangePasswordResponse,
)
async def change_my_password(
    request: Request,
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(
        get_db_session,
    ),
) -> ChangePasswordResponse:
    service = AuthService(session)

    try:
        await service.change_password(
            user=current_user,
            current_password=payload.current_password,
            new_password=payload.new_password,
        )

    except InvalidCurrentPasswordError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="account.password_changed",
        user_id=current_user.id,
        resource_type="user",
        resource_id=str(current_user.id),
        details={},
    )

    return ChangePasswordResponse(
        message="Password changed successfully",
    )


@router.post(
    "/me/avatar",
    response_model=AvatarUpdateResponse,
)
async def upload_my_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(
        get_db_session,
    ),
) -> AvatarUpdateResponse:
    service = ProfileAvatarService(
        session,
    )

    had_avatar = current_user.avatar_path is not None

    try:
        await service.upload(
            user=current_user,
            file=file,
        )

    except AvatarValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="account.avatar_updated",
        user_id=current_user.id,
        resource_type="user",
        resource_id=str(current_user.id),
        details={
            "operation": ("replaced" if had_avatar else "uploaded"),
        },
    )

    return AvatarUpdateResponse(
        message="Profile picture updated successfully",
        has_avatar=True,
    )


@router.get(
    "/me/avatar",
)
async def get_my_avatar(
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    service = ProfileAvatarService(
        session=None,
    )

    try:
        avatar_path = service.get_avatar_path(
            user=current_user,
        )

        media_type = avatar_media_type(avatar_path)

    except AvatarNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile picture not found",
        ) from exc

    except AvatarValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return FileResponse(
        path=avatar_path,
        media_type=media_type,
        filename=avatar_path.name,
        headers={
            "Cache-Control": "private, no-cache",
        },
    )


@router.delete(
    "/me/avatar",
    response_model=AvatarUpdateResponse,
)
async def delete_my_avatar(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(
        get_db_session,
    ),
) -> AvatarUpdateResponse:
    service = ProfileAvatarService(
        session,
    )

    try:
        await service.remove(
            user=current_user,
        )

    except AvatarValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="account.avatar_removed",
        user_id=current_user.id,
        resource_type="user",
        resource_id=str(current_user.id),
        details={},
    )

    return AvatarUpdateResponse(
        message="Profile picture removed successfully",
        has_avatar=False,
    )
