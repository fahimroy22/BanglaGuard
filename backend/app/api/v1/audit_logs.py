# ruff: noqa: B008
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_admin
from app.db.models import AuditLog, User
from app.db.repositories.audit_log import (
    AuditLogRepository,
)
from app.db.session import get_db_session
from app.schemas.audit_log import (
    AuditLogListResponse,
    AuditLogResponse,
)

router = APIRouter(
    prefix="/audit-logs",
    tags=["Audit Logs"],
)


def _serialize_audit_log(
    record: AuditLog,
    *,
    user_full_name: str | None,
    user_email: str | None,
) -> AuditLogResponse:
    return AuditLogResponse(
        id=record.id,
        user_id=record.user_id,
        user_full_name=user_full_name,
        user_email=user_email,
        action=record.action,
        resource_type=(record.resource_type),
        resource_id=record.resource_id,
        request_id=record.request_id,
        ip_address=record.ip_address,
        user_agent=record.user_agent,
        details=record.details or {},
        created_at=record.created_at,
    )


@router.get(
    "",
    response_model=AuditLogListResponse,
)
async def list_audit_logs(
    search: Annotated[
        str | None,
        Query(
            min_length=1,
            max_length=200,
        ),
    ] = None,
    action: Annotated[
        str | None,
        Query(
            min_length=1,
            max_length=100,
        ),
    ] = None,
    resource_type: Annotated[
        str | None,
        Query(
            min_length=1,
            max_length=100,
        ),
    ] = None,
    user_id: Annotated[
        UUID | None,
        Query(),
    ] = None,
    created_from: Annotated[
        datetime | None,
        Query(),
    ] = None,
    created_to: Annotated[
        datetime | None,
        Query(),
    ] = None,
    limit: Annotated[
        int,
        Query(
            ge=1,
            le=500,
        ),
    ] = 50,
    offset: Annotated[
        int,
        Query(
            ge=0,
        ),
    ] = 0,
    session: AsyncSession = Depends(
        get_db_session,
    ),
    _: User = Depends(
        require_admin,
    ),
) -> AuditLogListResponse:
    if (
        created_from is not None
        and created_to is not None
        and created_from > created_to
    ):
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=("created_from must be " "earlier than or equal " "to created_to"),
        )

    repository = AuditLogRepository(
        session,
    )

    rows, total = await repository.list_filtered(
        search=search,
        action=action,
        resource_type=resource_type,
        user_id=user_id,
        created_from=created_from,
        created_to=created_to,
        limit=limit,
        offset=offset,
    )

    items = [
        _serialize_audit_log(
            record,
            user_full_name=full_name,
            user_email=email,
        )
        for (
            record,
            full_name,
            email,
        ) in rows
    ]

    return AuditLogListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        has_previous=offset > 0,
        has_next=(offset + len(items) < total),
    )


@router.get(
    "/{audit_log_id}",
    response_model=AuditLogResponse,
)
async def get_audit_log(
    audit_log_id: UUID,
    session: AsyncSession = Depends(
        get_db_session,
    ),
    _: User = Depends(
        require_admin,
    ),
) -> AuditLogResponse:
    repository = AuditLogRepository(
        session,
    )

    result = await repository.get_with_user(
        audit_log_id,
    )

    if result is None:
        raise HTTPException(
            status_code=(status.HTTP_404_NOT_FOUND),
            detail="Audit log not found",
        )

    record, full_name, email = result

    return _serialize_audit_log(
        record,
        user_full_name=full_name,
        user_email=email,
    )
