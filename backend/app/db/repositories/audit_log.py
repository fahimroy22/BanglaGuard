from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    String,
    cast,
    func,
    or_,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditLog, User


class AuditLogRepository:
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self.session = session

    async def create(
        self,
        *,
        action: str,
        user_id: UUID | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        request_id: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        details: dict | None = None,
    ) -> AuditLog:
        record = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            request_id=request_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details=details or {},
        )

        self.session.add(record)

        await self.session.commit()
        await self.session.refresh(record)

        return record

    async def list(
        self,
        *,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AuditLog]:
        statement = (
            select(AuditLog)
            .order_by(
                AuditLog.created_at.desc(),
                AuditLog.id.asc(),
            )
            .offset(offset)
            .limit(limit)
        )

        result = await self.session.execute(
            statement,
        )

        return list(
            result.scalars().all(),
        )

    async def list_filtered(
        self,
        *,
        search: str | None = None,
        action: str | None = None,
        resource_type: str | None = None,
        user_id: UUID | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[
        list[
            tuple[
                AuditLog,
                str | None,
                str | None,
            ]
        ],
        int,
    ]:
        filters = []

        normalized_search = search.strip() if search else ""

        normalized_action = action.strip() if action else ""

        normalized_resource_type = resource_type.strip() if resource_type else ""

        if normalized_search:
            pattern = f"%{normalized_search}%"

            filters.append(
                or_(
                    AuditLog.action.ilike(
                        pattern,
                    ),
                    AuditLog.resource_type.ilike(
                        pattern,
                    ),
                    AuditLog.resource_id.ilike(
                        pattern,
                    ),
                    AuditLog.request_id.ilike(
                        pattern,
                    ),
                    AuditLog.ip_address.ilike(
                        pattern,
                    ),
                    User.full_name.ilike(
                        pattern,
                    ),
                    User.email.ilike(
                        pattern,
                    ),
                    cast(
                        AuditLog.details,
                        String,
                    ).ilike(
                        pattern,
                    ),
                )
            )

        if normalized_action:
            filters.append(AuditLog.action == normalized_action)

        if normalized_resource_type:
            filters.append(AuditLog.resource_type == normalized_resource_type)

        if user_id is not None:
            filters.append(AuditLog.user_id == user_id)

        if created_from is not None:
            filters.append(AuditLog.created_at >= created_from)

        if created_to is not None:
            filters.append(AuditLog.created_at <= created_to)

        count_statement = (
            select(
                func.count(
                    AuditLog.id,
                )
            )
            .select_from(AuditLog)
            .outerjoin(
                User,
                AuditLog.user_id == User.id,
            )
        )

        if filters:
            count_statement = count_statement.where(*filters)

        total_result = await self.session.scalar(
            count_statement,
        )

        total = int(total_result or 0)

        statement = (
            select(
                AuditLog,
                User.full_name,
                User.email,
            )
            .select_from(AuditLog)
            .outerjoin(
                User,
                AuditLog.user_id == User.id,
            )
            .order_by(
                AuditLog.created_at.desc(),
                AuditLog.id.asc(),
            )
            .offset(offset)
            .limit(limit)
        )

        if filters:
            statement = statement.where(*filters)

        result = await self.session.execute(
            statement,
        )

        rows = [
            (
                row[0],
                row[1],
                row[2],
            )
            for row in result.all()
        ]

        return rows, total

    async def get_with_user(
        self,
        audit_log_id: UUID,
    ) -> (
        tuple[
            AuditLog,
            str | None,
            str | None,
        ]
        | None
    ):
        statement = (
            select(
                AuditLog,
                User.full_name,
                User.email,
            )
            .select_from(AuditLog)
            .outerjoin(
                User,
                AuditLog.user_id == User.id,
            )
            .where(AuditLog.id == audit_log_id)
        )

        result = await self.session.execute(
            statement,
        )

        row = result.first()

        if row is None:
            return None

        return (
            row[0],
            row[1],
            row[2],
        )
