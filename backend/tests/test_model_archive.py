import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from app.db.repositories.model_version import ModelVersionRepository
from app.domain.enums import ModelStatus
from app.domain.services.model_activation import ModelActivationService, ModelActivationArtifactError
from app.domain.services.prediction import PredictionService, ActiveModelNotFoundError
from app.api.v1.model_versions import archive_model_version, ModelArchiveUpdate

@pytest.mark.asyncio
@pytest.mark.parametrize('status',[ModelStatus.DRAFT,ModelStatus.RETIRED])
async def test_archive_restore_preserves_model(status):
 model=SimpleNamespace(status=status,is_archived=False,artifact_path='unchanged',metrics={'accuracy':.7})
 session=SimpleNamespace(scalars=AsyncMock(return_value=SimpleNamespace(first=lambda:model)),flush=AsyncMock())
 repo=ModelVersionRepository(session)
 await repo.set_archived(uuid.uuid4(),True)
 assert model.is_archived and model.status==status
 await repo.set_archived(uuid.uuid4(),False)
 assert not model.is_archived and model.artifact_path=='unchanged' and model.metrics=={'accuracy':.7}

@pytest.mark.asyncio
async def test_active_archive_rejected():
 model=SimpleNamespace(status=ModelStatus.ACTIVE,is_archived=False)
 session=SimpleNamespace(scalars=AsyncMock(return_value=SimpleNamespace(first=lambda:model)),flush=AsyncMock())
 with pytest.raises(ValueError): await ModelVersionRepository(session).set_archived(uuid.uuid4(),True)
 session.flush.assert_not_awaited()
 assert not model.is_archived

@pytest.mark.asyncio
async def test_missing_model():
 session=SimpleNamespace(scalars=AsyncMock(return_value=SimpleNamespace(first=lambda:None)))
 with pytest.raises(HTTPException) as err:
  await archive_model_version(uuid.uuid4(),ModelArchiveUpdate(archived=True),None,None,session)
 assert err.value.status_code==404

def test_archived_readiness_rejected():
 with pytest.raises(ModelActivationArtifactError,match='Restore'):
  ModelActivationService().validate(SimpleNamespace(is_archived=True))

@pytest.mark.asyncio
async def test_archived_activation_rejected_in_locked_repository():
 model=SimpleNamespace(is_archived=True,task='sentiment')
 session=SimpleNamespace(scalars=AsyncMock(return_value=SimpleNamespace(first=lambda:model)),execute=AsyncMock())
 with pytest.raises(ValueError,match='Restore'): await ModelVersionRepository(session).activate(uuid.uuid4())

@pytest.mark.asyncio
async def test_archived_prediction_rejected():
 service=PredictionService(None)
 service.models=SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(task='sentiment',is_archived=True)))
 with pytest.raises(ActiveModelNotFoundError):
  await service.predict(SimpleNamespace(model_version_id=uuid.uuid4(),task='sentiment'),None)
