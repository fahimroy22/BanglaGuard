from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    Query,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_admin
from app.db.models import User
from app.db.repositories.audit_log import (
    AuditLogRepository,
)
from app.db.session import get_db_session
from app.schemas.audit_log import AuditLogResponse


router = APIRouter(
    prefix="/audit-logs",
    tags=["Audit Logs"],
)


@router.get(
    "",
    response_model=list[AuditLogResponse],
)
async def list_audit_logs(
    limit: Annotated[
        int,
        Query(
            ge=1,
            le=500,
        ),
    ] = 100,
    offset: Annotated[
        int,
        Query(ge=0),
    ] = 0,
    session: AsyncSession = Depends(
        get_db_session
    ),
    _: User = Depends(
        require_admin
    ),
) -> list[AuditLogResponse]:
    repository = AuditLogRepository(
        session
    )

    records = await repository.list(
        limit=limit,
        offset=offset,
    )

    return [
        AuditLogResponse.model_validate(
            record
        )
        for record in records
    ]