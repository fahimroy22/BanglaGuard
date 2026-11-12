from datetime import (
    UTC,
    datetime,
)
from uuid import uuid4

from app.schemas.audit_log import (
    AuditLogListResponse,
    AuditLogResponse,
)


def test_audit_log_response_schema() -> None:
    user_id = uuid4()

    item = AuditLogResponse(
        id=uuid4(),
        user_id=user_id,
        user_full_name=("MD. Fahim Ahmed"),
        user_email=("fahim@example.com"),
        action="prediction.created",
        resource_type="prediction",
        resource_id=str(uuid4()),
        request_id="request-123",
        ip_address="127.0.0.1",
        user_agent="pytest",
        details={"task": "hate_speech"},
        created_at=datetime.now(UTC),
    )

    assert item.action == "prediction.created"

    assert item.user_id == user_id

    assert item.user_full_name == "MD. Fahim Ahmed"

    assert item.user_email == "fahim@example.com"


def test_audit_log_list_schema() -> None:
    item = AuditLogResponse(
        id=uuid4(),
        user_id=None,
        action="system.test",
        resource_type=None,
        resource_id=None,
        request_id=None,
        ip_address=None,
        user_agent=None,
        details={},
        created_at=datetime.now(UTC),
    )

    response = AuditLogListResponse(
        items=[item],
        total=2,
        limit=1,
        offset=0,
        has_previous=False,
        has_next=True,
    )

    assert response.total == 2
    assert response.limit == 1
    assert response.offset == 0
    assert response.has_previous is False
    assert response.has_next is True
    assert len(response.items) == 1


def test_audit_log_details_default() -> None:
    item = AuditLogResponse(
        id=uuid4(),
        user_id=None,
        action="system.test",
        resource_type=None,
        resource_id=None,
        request_id=None,
        ip_address=None,
        user_agent=None,
        created_at=datetime.now(UTC),
    )

    assert item.details == {}
