from __future__ import annotations
from app.domain.services.platform_policy import require_permission

# FastAPI intentionally uses Depends and Query in parameter defaults.
# ruff: noqa: B008
import uuid

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.rate_limit import limiter
from app.db.models import Prediction, User
from app.db.repositories.prediction import PredictionRepository
from app.db.session import get_db_session
from app.domain.services.audit import AuditService
from app.domain.services.prediction import (
    ActiveModelNotFoundError,
    PredictionService,
)
from app.schemas.prediction import (
    BatchPredictionRequest,
    BatchPredictionResponse,
    PredictionRead,
    PredictionRequest,
)

router = APIRouter(
    prefix="/predictions",
    tags=["Predictions"],
)


@router.post(
    "",
    response_model=PredictionRead,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute")
async def create_prediction(
    request: Request,
    payload: PredictionRequest,
    current_user: User = Depends(require_permission("prediction_run")),
    session: AsyncSession = Depends(get_db_session),
) -> Prediction:
    service = PredictionService(session)

    try:
        prediction = await service.predict(
            payload=payload,
            user=current_user,
        )

    except ActiveModelNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "No suitable model version is available for the selected analysis task"
            ),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="prediction.created",
        user_id=current_user.id,
        resource_type="prediction",
        resource_id=str(prediction.id),
        details={
            "task": getattr(
                prediction.task,
                "value",
                str(prediction.task),
            ),
            "model_version_id": str(prediction.model_version_id),
            "include_explanation": payload.include_explanation,
        },
    )

    return prediction


@router.post(
    "/batch",
    response_model=BatchPredictionResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
async def create_batch_prediction(
    request: Request,
    payload: BatchPredictionRequest,
    current_user: User = Depends(require_permission("prediction_run")),
    session: AsyncSession = Depends(get_db_session),
) -> BatchPredictionResponse:
    service = PredictionService(session)

    try:
        result = await service.predict_batch(
            payload=payload,
            user=current_user,
        )

    except ActiveModelNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=("No suitable active model is available for the selected task"),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="prediction.batch_created",
        user_id=current_user.id,
        resource_type="prediction_batch",
        resource_id=None,
        details={
            "task": getattr(
                result.task,
                "value",
                str(result.task),
            ),
            "model_version_id": str(result.model_version_id),
            "total_items": result.total_items,
            "completed_items": result.completed_items,
            "failed_items": result.failed_items,
            "include_explanation": payload.include_explanation,
        },
    )

    return result


@router.get(
    "",
    response_model=list[PredictionRead],
)
@limiter.limit("60/minute")
async def list_my_predictions(
    request: Request,
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[Prediction]:
    repository = PredictionRepository(session)

    return await repository.list_for_user(
        user_id=current_user.id,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{prediction_id}",
    response_model=PredictionRead,
)
@limiter.limit("60/minute")
async def get_my_prediction(
    request: Request,
    prediction_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Prediction:
    repository = PredictionRepository(session)

    prediction = await repository.get_for_user(
        prediction_id=prediction_id,
        user_id=current_user.id,
    )

    if prediction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prediction not found",
        )

    return prediction
