from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
    )

    id: UUID
    user_id: UUID | None

    user_full_name: str | None = None
    user_email: str | None = None

    action: str
    resource_type: str | None
    resource_id: str | None

    request_id: str | None
    ip_address: str | None
    user_agent: str | None

    details: dict = Field(
        default_factory=dict,
    )

    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogResponse]

    total: int
    limit: int
    offset: int

    has_previous: bool
    has_next: bool
