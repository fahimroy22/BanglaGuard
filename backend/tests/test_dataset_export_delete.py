import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.v1 import datasets
from app.api.dependencies import get_current_user
from app.db.session import get_db_session
from app.domain.enums import DatasetExportStatus, UserRole

@pytest.mark.parametrize('role,export_status,expected', [
    (UserRole.ADMIN, DatasetExportStatus.FAILED, 204),
    (UserRole.ADMIN, DatasetExportStatus.COMPLETED, 204),
    (UserRole.ADMIN, DatasetExportStatus.PENDING, 409),
    (UserRole.ADMIN, DatasetExportStatus.PROCESSING, 409),
    (UserRole.RESEARCHER, DatasetExportStatus.FAILED, 403),
    (UserRole.USER, DatasetExportStatus.FAILED, 403),
    (UserRole.ADMIN, None, 404),
])
def test_delete_export_permissions_and_state(monkeypatch, role, export_status, expected):
    app = FastAPI()
    app.include_router(datasets.router)
    record = SimpleNamespace(status=export_status) if export_status else None
    session = SimpleNamespace(scalars=AsyncMock(return_value=SimpleNamespace(first=lambda: record)), delete=AsyncMock())
    audit = AsyncMock()
    monkeypatch.setattr(datasets, 'AuditService', lambda session: SimpleNamespace(record=audit))
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=uuid.uuid4(), role=role)
    app.dependency_overrides[get_db_session] = lambda: session
    response = TestClient(app).delete(f'/datasets/exports/{uuid.uuid4()}')
    assert response.status_code == expected, response.text
    if expected == 204:
        session.delete.assert_awaited_once_with(record)
        assert audit.await_args.kwargs['action'] == 'dataset_export.deleted'
        assert audit.await_args.kwargs['details']['scope'] == 'history_only'
    else:
        session.delete.assert_not_awaited()
        audit.assert_not_awaited()
