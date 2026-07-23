from datetime import (
    UTC,
    datetime,
)
from uuid import uuid4

from app.schemas.audit_log import (
    AuditLogResponse,
)


def test_audit_log_response_schema() -> None:
    item = AuditLogResponse(
        id=uuid4(),
        user_id=uuid4(),
        action="prediction.created",
        resource_type="prediction",
        resource_id=str(
            uuid4()
        ),
        request_id="request-123",
        ip_address="127.0.0.1",
        user_agent="pytest",
        details={
            "task": "hate_speech"
        },
        created_at=datetime.now(
            UTC
        ),
    )

    assert (
        item.action
        == "prediction.created"
    )