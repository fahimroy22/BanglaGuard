from __future__ import annotations

from uuid import UUID

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditLog
from app.db.repositories.audit_log import (
    AuditLogRepository,
)


class AuditService:
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self.repository = AuditLogRepository(
            session
        )

    async def record(
        self,
        *,
        request: Request,
        action: str,
        user_id: UUID | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        details: dict | None = None,
    ) -> AuditLog:
        request_id = getattr(
            request.state,
            "request_id",
            None,
        )

        client_ip = (
            request.client.host
            if request.client
            else None
        )

        return await self.repository.create(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            request_id=request_id,
            ip_address=client_ip,
            user_agent=request.headers.get(
                "user-agent"
            ),
            details=details,
        )