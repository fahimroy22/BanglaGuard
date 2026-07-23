import uuid

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.db.models import Prediction, User
from app.db.repositories.prediction import (
    PredictionRepository,
)
from app.db.session import get_db_session
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
async def create_prediction(
    payload: PredictionRequest,
    current_user: User = Depends(
        get_current_user
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> Prediction:
    service = PredictionService(session)

    try:
        return await service.predict(
            payload=payload,
            user=current_user,
        )

    except ActiveModelNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "No suitable model version is available "
                "for the selected analysis task"
            ),
        )


@router.get(
    "",
    response_model=list[PredictionRead],
)
async def list_my_predictions(
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
    current_user: User = Depends(
        get_current_user
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
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
async def get_my_prediction(
    prediction_id: uuid.UUID,
    current_user: User = Depends(
        get_current_user
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
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

@router.post(
    "/batch",
    response_model=BatchPredictionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_batch_prediction(
    payload: BatchPredictionRequest,
    current_user: User = Depends(
        get_current_user
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> BatchPredictionResponse:
    service = PredictionService(session)

    try:
        return await service.predict_batch(
            payload=payload,
            user=current_user,
        )

    except ActiveModelNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "No suitable active model is "
                "available for the selected task"
            ),
        )