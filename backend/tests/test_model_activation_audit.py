"""The legacy activation endpoint cannot bypass the reasoned promotion workflow."""

import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from app.api.v1 import model_versions


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["draft", "active"])
async def test_legacy_activation_requires_promotion_review(status):
    with pytest.raises(HTTPException) as exc:
        await model_versions.activate_model_version(
            uuid.uuid4(),
            SimpleNamespace(),
            SimpleNamespace(id=uuid.uuid4()),
            SimpleNamespace(),
        )
    assert exc.value.status_code == 409
    assert "promotion" in exc.value.detail
