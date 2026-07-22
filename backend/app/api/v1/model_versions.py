import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ModelVersion
from app.db.repositories.model_version import (
    ModelVersionRepository,
)
from app.db.session import get_db_session
from app.schemas.model_version import (
    ModelVersionCreate,
    ModelVersionRead,
)


router = APIRouter(
    prefix="/model-versions",
    tags=["Model Versions"],
)


@router.post(
    "",
    response_model=ModelVersionRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_model_version(
    payload: ModelVersionCreate,
    session: AsyncSession = Depends(get_db_session),
) -> ModelVersion:
    repository = ModelVersionRepository(session)

    model_version = ModelVersion(
        **payload.model_dump(),
    )

    return await repository.add(model_version)


@router.get(
    "",
    response_model=list[ModelVersionRead],
)
async def list_model_versions(
    session: AsyncSession = Depends(get_db_session),
) -> list[ModelVersion]:
    repository = ModelVersionRepository(session)

    return await repository.list()


@router.get(
    "/{model_version_id}",
    response_model=ModelVersionRead,
)
async def get_model_version(
    model_version_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
) -> ModelVersion:
    repository = ModelVersionRepository(session)

    try:
        model_version = await repository.get(
            model_version_id,
        )
    except (TypeError, ValueError):
        model_version = None

    if model_version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model version not found",
        )

    return model_version