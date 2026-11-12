from __future__ import annotations

# FastAPI intentionally uses Depends in parameter defaults.
# ruff: noqa: B008
import uuid

from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    require_admin,
    require_researcher_or_admin,
)
from app.db.models import ModelVersion, User
from app.db.repositories.model_version import (
    ModelVersionRepository,
)
from app.db.session import get_db_session
from app.domain.services.audit import AuditService
from app.domain.services.model_activation import (
    ModelActivationArtifactError,
    ModelActivationService,
    UnsupportedModelArchitectureError,
)
from app.schemas.model_version import (
    ModelActivationReadinessRead,
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
    request: Request,
    payload: ModelVersionCreate,
    current_admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_db_session),
) -> ModelVersion:
    repository = ModelVersionRepository(session)

    data = payload.model_dump()
    # Promotion history is server-owned; registration cannot import an approval.
    if isinstance(data.get("configuration"), dict):
        data["configuration"] = {k: v for k, v in data["configuration"].items() if k != "promotion"}
    model_version = ModelVersion(**data)

    created_model = await repository.add(model_version)

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="model_version.created",
        user_id=current_admin.id,
        resource_type="model_version",
        resource_id=str(created_model.id),
        details={
            "name": created_model.name,
            "version": created_model.version,
            "task": getattr(
                created_model.task,
                "value",
                str(created_model.task),
            ),
            "architecture": created_model.architecture,
            "is_explainable": created_model.is_explainable,
        },
    )

    return created_model


@router.get(
    "",
    response_model=list[ModelVersionRead],
)
async def list_model_versions(
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(
        require_researcher_or_admin,
    ),
    session: AsyncSession = Depends(get_db_session),
) -> ModelVersion:
    repository = ModelVersionRepository(session)

    model_version = await repository.get(
        model_version_id,
    )

    if model_version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model version not found",
        )

    return model_version


@router.get(
    "/{model_version_id}/activation-readiness",
    response_model=ModelActivationReadinessRead,
)
async def get_model_activation_readiness(
    model_version_id: uuid.UUID,
    current_admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_db_session),
) -> ModelActivationReadinessRead:
    repository = ModelVersionRepository(session)

    model_version = await repository.get(
        model_version_id,
    )

    if model_version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model version not found",
        )

    activation_service = ModelActivationService()

    try:
        activation_service.validate(
            model_version,
        )

    except (
        UnsupportedModelArchitectureError,
        ModelActivationArtifactError,
    ) as exc:
        return ModelActivationReadinessRead(
            model_version_id=model_version.id,
            task=model_version.task,
            architecture=model_version.architecture,
            status=model_version.status,
            ready=False,
            reason=str(exc),
        )

    return ModelActivationReadinessRead(
        model_version_id=model_version.id,
        task=model_version.task,
        architecture=model_version.architecture,
        status=model_version.status,
        ready=True,
        reason=None,
    )


@router.patch(
    "/{model_version_id}/activate",
    response_model=ModelVersionRead,
)
async def activate_model_version(
    model_version_id: uuid.UUID,
    request: Request,
    current_admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_db_session),
) -> ModelVersion:
    raise HTTPException(409, "Open the model promotion review to request approval and record an activation reason.")


class ModelArchiveUpdate(BaseModel):
    archived: bool


@router.patch("/{model_version_id}/archive", response_model=ModelVersionRead)
async def archive_model_version(
    model_version_id: uuid.UUID,
    payload: ModelArchiveUpdate,
    request: Request,
    current_admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_db_session),
) -> ModelVersion:
    try:
        model = await ModelVersionRepository(session).set_archived(model_version_id, payload.archived)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if model is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    await AuditService(session).record(
        request=request, user_id=current_admin.id,
        action="model_version.archived" if payload.archived else "model_version.restored",
        resource_type="model_version", resource_id=str(model.id),
        details={"is_archived": model.is_archived},
    )
    await session.commit()
    await session.refresh(model)
    return model
