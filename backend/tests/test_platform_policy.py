import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import insert

from app.domain.services.platform_policy import (
    PlatformPolicy, SecurityPolicy, require_permission, load_policy,
    check_login_limit, record_failed_login, login_key, records, save_policy,
)
from app.core.security import create_access_token, decode_access_token
from app.domain.services.auth import AuthService
from app.schemas.auth import RegisterRequest
import uuid


def test_defaults_and_validation():
    policy = PlatformPolicy()
    assert policy.permissions['prediction_run'] == ['researcher', 'user']
    assert policy.security.registration_enabled and not policy.security.approval_required
    assert policy.security.failed_login_limit == 0
    data = policy.model_dump()
    data['permissions']['research_view'] = []
    with pytest.raises(ValidationError):
        PlatformPolicy.model_validate(data)
    for value in [0, 10081]:
        with pytest.raises(ValidationError):
            SecurityPolicy(session_minutes=value)


def test_permission_enforcement():
    async def run():
        check = require_permission('training_execute')
        with patch('app.domain.services.platform_policy.load_policy', new=AsyncMock(return_value=PlatformPolicy())):
            for role in ['researcher', 'admin']:
                user = SimpleNamespace(role=SimpleNamespace(value=role))
                assert await check(user, AsyncMock()) is user
            with pytest.raises(HTTPException) as err:
                await check(SimpleNamespace(role=SimpleNamespace(value='user')), AsyncMock())
            assert err.value.status_code == 403
            policy = PlatformPolicy()
            policy.permissions['training_execute'] = []
            with patch('app.domain.services.platform_policy.load_policy', new=AsyncMock(return_value=policy)):
                with pytest.raises(HTTPException):
                    await check(SimpleNamespace(role=SimpleNamespace(value='researcher')), AsyncMock())
    asyncio.run(run())


def test_storage_and_conflict():
    async def run():
        session = AsyncMock()
        session.execute.return_value = SimpleNamespace(all=lambda: [('platform_policy.security.approval_required', 'true'), ('platform_policy.revision', '2')])
        result = await load_policy(session)
        assert result.security.approval_required and result.revision == 2
        with pytest.raises(HTTPException) as err:
            await save_policy(session, PlatformPolicy())
        assert err.value.status_code == 409
        statement = insert(records).values(id=uuid.uuid4(), name='test', value='true')
        assert 'ON CONFLICT' in str(statement.on_conflict_do_update(index_elements=[records.c.name], set_={'value': 'false'}).compile(dialect=postgresql.dialect()))
    asyncio.run(run())


def test_login_limits():
    async def run():
        redis = SimpleNamespace(get=AsyncMock(return_value='3'), ttl=AsyncMock(return_value=90), eval=AsyncMock())
        policy = SecurityPolicy(failed_login_limit=3)
        with patch('app.domain.services.platform_policy.redis_client', redis):
            with pytest.raises(HTTPException) as err:
                await check_login_limit('key', policy)
            assert err.value.status_code == 429 and err.value.headers['Retry-After'] == '90'
            redis.get.return_value = '2'
            await check_login_limit('key', policy)
            await record_failed_login('key', policy)
            assert redis.eval.await_count == 1
            redis.get.side_effect = ConnectionError()
            with pytest.raises(HTTPException) as err:
                await check_login_limit('key', policy)
            assert err.value.status_code == 503
            await check_login_limit('key', SecurityPolicy())
    assert login_key(' A@EXAMPLE.COM ', '1') == login_key('a@example.com', '1')
    assert login_key('a@example.com', '1') != login_key('a@example.com', '2')
    asyncio.run(run())


def test_approval_and_expiry():
    async def run():
        service = AuthService(AsyncMock())
        service.users = SimpleNamespace(get_by_email=AsyncMock(return_value=None), add=AsyncMock(side_effect=lambda user: user))
        user = await service.register(RegisterRequest(full_name='Test Account', email='test@example.com', password='test-pass-1234'), active=False)
        assert not user.is_active
    asyncio.run(run())
    token = create_access_token(uuid.uuid4(), 'user', expires_minutes=12)
    payload = decode_access_token(token)
    assert 719 <= payload['exp'] - payload['iat'] <= 720
