import uuid

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    require_researcher_or_admin,
)
from app.db.models import Feedback, User
from app.db.repositories.feedback import (
    FeedbackRepository,
)
from app.db.repositories.prediction import (
    PredictionRepository,
)
from app.db.session import get_db_session
from app.schemas.feedback import (
    FeedbackCreate,
    FeedbackRead,
    FeedbackReview,
)


router = APIRouter(
    prefix="/feedback",
    tags=["Feedback"],
)


@router.post(
    "",
    response_model=FeedbackRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_feedback(
    payload: FeedbackCreate,
    current_user: User = Depends(
        get_current_user
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> Feedback:
    prediction_repository = (
        PredictionRepository(session)
    )

    feedback_repository = (
        FeedbackRepository(session)
    )

    prediction = (
        await prediction_repository.get_for_user(
            prediction_id=payload.prediction_id,
            user_id=current_user.id,
        )
    )

    if prediction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prediction not found",
        )

    existing_feedback = (
        await feedback_repository
        .get_by_prediction_and_user(
            prediction_id=payload.prediction_id,
            user_id=current_user.id,
        )
    )

    if existing_feedback is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Feedback has already been "
                "submitted for this prediction"
            ),
        )

    if (
        payload.feedback_type == "incorrect"
        and payload.corrected_label is None
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "corrected_label is required when "
                "feedback_type is incorrect"
            ),
        )

    feedback = Feedback(
        prediction_id=payload.prediction_id,
        user_id=current_user.id,
        feedback_type=payload.feedback_type,
        corrected_label=payload.corrected_label,
        comment=payload.comment,
        status="pending",
        reviewer_note=None,
    )

    return await feedback_repository.add(
        feedback
    )


@router.get(
    "/me",
    response_model=list[FeedbackRead],
)
async def list_my_feedback(
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
) -> list[Feedback]:
    repository = FeedbackRepository(session)

    return await repository.list_for_user(
        user_id=current_user.id,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/review",
    response_model=list[FeedbackRead],
)
async def list_feedback_for_review(
    status_value: str | None = Query(
        default=None,
        alias="status",
    ),
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
        require_researcher_or_admin
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> list[Feedback]:
    repository = FeedbackRepository(session)

    return await repository.list_for_review(
        status_value=status_value,
        limit=limit,
        offset=offset,
    )


@router.patch(
    "/{feedback_id}/review",
    response_model=FeedbackRead,
)
async def review_feedback(
    feedback_id: uuid.UUID,
    payload: FeedbackReview,
    current_user: User = Depends(
        require_researcher_or_admin
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> Feedback:
    repository = FeedbackRepository(session)

    feedback = await repository.get(
        feedback_id
    )

    if feedback is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feedback not found",
        )

    feedback.status = payload.status
    feedback.reviewer_note = (
        payload.reviewer_note
    )

    await session.commit()
    await session.refresh(feedback)

    return feedback