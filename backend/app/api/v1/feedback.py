# FastAPI intentionally uses Depends and Query in parameter defaults.
# ruff: noqa: B008
import uuid
from datetime import date, datetime, time, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from sqlalchemy import select
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
from app.domain.services.audit import AuditService
from app.schemas.feedback import (
    ActiveLearningItem,
    DatasetBuilderResponse,
    FeedbackCreate,
    FeedbackRead,
    FeedbackReview,
    FeedbackReviewItem,
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
    request: Request,
    payload: FeedbackCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Feedback:
    prediction_repository = PredictionRepository(session)

    feedback_repository = FeedbackRepository(session)

    prediction = await prediction_repository.get_for_user(
        prediction_id=payload.prediction_id,
        user_id=current_user.id,
    )

    if prediction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prediction not found",
        )

    existing_feedback = await feedback_repository.get_by_prediction_and_user(
        prediction_id=payload.prediction_id,
        user_id=current_user.id,
    )

    if existing_feedback is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=("Feedback has already been submitted for this prediction"),
        )

    feedback = Feedback(
        prediction_id=payload.prediction_id,
        user_id=current_user.id,
        reviewed_by_id=None,
        verdict=payload.verdict,
        status="pending",
        corrected_label=payload.corrected_label,
        comment=payload.comment,
        reviewer_note=None,
        reviewed_at=None,
    )

    created_feedback = await feedback_repository.add(feedback)

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="feedback.submitted",
        user_id=current_user.id,
        resource_type="feedback",
        resource_id=str(created_feedback.id),
        details={
            "prediction_id": str(created_feedback.prediction_id),
            "verdict": getattr(
                created_feedback.verdict,
                "value",
                str(created_feedback.verdict),
            ),
            "status": getattr(
                created_feedback.status,
                "value",
                str(created_feedback.status),
            ),
        },
    )

    return created_feedback


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
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[Feedback]:
    repository = FeedbackRepository(session)

    return await repository.list_for_user(
        user_id=current_user.id,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/review",
    response_model=list[FeedbackReviewItem],
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
    current_user: User = Depends(require_researcher_or_admin),
    session: AsyncSession = Depends(get_db_session),
) -> list[FeedbackReviewItem]:
    repository = FeedbackRepository(session)

    return await repository.list_review_items(
        status_value=status_value,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/active-learning",
    response_model=list[ActiveLearningItem],
)
async def list_active_learning_candidates(
    task_value: str | None = Query(
        default=None,
        alias="task",
        pattern=("^(hate_speech|sentiment)$"),
    ),
    priority_level: str | None = Query(
        default=None,
        alias="priority",
        pattern="^(high|medium|low)$",
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=100,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
    current_user: User = Depends(require_researcher_or_admin),
    session: AsyncSession = Depends(get_db_session),
) -> list[ActiveLearningItem]:
    repository = FeedbackRepository(session)

    return await repository.list_active_learning_candidates(
        task_value=task_value,
        priority_level=(priority_level),
        limit=limit,
        offset=offset,
    )


@router.get(
    "/dataset-builder",
    response_model=DatasetBuilderResponse,
)
async def list_dataset_builder_items(
    task_value: str | None = Query(
        default=None,
        alias="task",
        pattern=("^(hate_speech|sentiment)$"),
    ),
    status_value: str | None = Query(
        default=None,
        alias="status",
        pattern=("^(pending|reviewed|rejected)$"),
    ),
    final_label: str | None = Query(
        default=None,
        min_length=1,
        max_length=100,
    ),
    reviewer_id: uuid.UUID | None = Query(
        default=None,
    ),
    model_version_id: uuid.UUID | None = Query(
        default=None,
    ),
    reviewed_from: date | None = Query(
        default=None,
    ),
    reviewed_to: date | None = Query(
        default=None,
    ),
    ready_only: bool = Query(
        default=False,
    ),
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
    current_user: User = Depends(require_researcher_or_admin),
    session: AsyncSession = Depends(get_db_session),
) -> DatasetBuilderResponse:
    repository = FeedbackRepository(session)

    reviewed_from_datetime = (
        datetime.combine(
            reviewed_from,
            time.min,
            tzinfo=timezone.utc,
        )
        if reviewed_from
        else None
    )

    reviewed_to_datetime = (
        datetime.combine(
            reviewed_to,
            time.max,
            tzinfo=timezone.utc,
        )
        if reviewed_to
        else None
    )

    result = await repository.list_dataset_builder_items(
        task_value=task_value,
        status_value=status_value,
        final_label=final_label,
        reviewer_id=reviewer_id,
        model_version_id=(model_version_id),
        reviewed_from=(reviewed_from_datetime),
        reviewed_to=(reviewed_to_datetime),
        ready_only=ready_only,
        limit=limit,
        offset=offset,
    )

    return DatasetBuilderResponse(**result)


@router.patch(
    "/{feedback_id}/review",
    response_model=FeedbackRead,
)
async def review_feedback(
    feedback_id: uuid.UUID,
    request: Request,
    payload: FeedbackReview,
    current_user: User = Depends(require_researcher_or_admin),
    session: AsyncSession = Depends(get_db_session),
) -> Feedback:
    feedback = (
        await session.scalars(
            select(Feedback).where(Feedback.id == feedback_id).with_for_update()
        )
    ).first()

    if feedback is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feedback not found",
        )

    from app.domain.services.research_loop import LoopStore

    if LoopStore().get("reviews", feedback_id):
        raise HTTPException(
            409,
            "This correction uses independent project review. Use its assigned review form.",
        )

    previous_status = getattr(
        feedback.status,
        "value",
        str(feedback.status),
    )

    feedback.status = payload.status
    feedback.reviewer_note = payload.reviewer_note
    feedback.reviewed_by_id = current_user.id

    if payload.status in {
        "reviewed",
        "rejected",
    }:
        feedback.reviewed_at = datetime.now(timezone.utc)
    else:
        feedback.reviewed_at = None

    await session.commit()
    await session.refresh(feedback)

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="feedback.reviewed",
        user_id=current_user.id,
        resource_type="feedback",
        resource_id=str(feedback.id),
        details={
            "prediction_id": str(feedback.prediction_id),
            "previous_status": previous_status,
            "status": getattr(
                feedback.status,
                "value",
                str(feedback.status),
            ),
        },
    )

    return feedback
