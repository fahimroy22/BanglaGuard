import uuid
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    require_researcher_or_admin,
)
from app.db.models import Experiment, User
from app.db.repositories.experiment import (
    ExperimentRepository,
)
from app.db.session import get_db_session
from app.domain.enums import ExperimentStatus
from app.schemas.experiment import (
    ExperimentCreate,
    ExperimentRead,
    ExperimentUpdate,
)


router = APIRouter(
    prefix="/experiments",
    tags=["Experiments"],
)


@router.post(
    "",
    response_model=ExperimentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_experiment(
    payload: ExperimentCreate,
    current_user: User = Depends(
        require_researcher_or_admin
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> Experiment:
    repository = ExperimentRepository(session)

    experiment = Experiment(
        name=payload.name,
        description=payload.description,
        status=ExperimentStatus.PLANNED,
        dataset_version_id=(
            payload.dataset_version_id
        ),
        model_version_id=(
            payload.model_version_id
        ),
        random_seed=payload.random_seed,
        code_version=payload.code_version,
        configuration=payload.configuration,
        results=payload.results,
    )

    return await repository.add(experiment)


@router.get(
    "",
    response_model=list[ExperimentRead],
)
async def list_experiments(
    dataset_version_id: uuid.UUID | None = Query(
        default=None
    ),
    current_user: User = Depends(
        require_researcher_or_admin
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> list[Experiment]:
    repository = ExperimentRepository(session)

    if dataset_version_id is not None:
        return await repository.list_by_dataset(
            dataset_version_id
        )

    return await repository.list()


@router.get(
    "/{experiment_id}",
    response_model=ExperimentRead,
)
async def get_experiment(
    experiment_id: uuid.UUID,
    current_user: User = Depends(
        require_researcher_or_admin
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> Experiment:
    repository = ExperimentRepository(session)

    experiment = await repository.get(
        experiment_id
    )

    if experiment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    return experiment


@router.patch(
    "/{experiment_id}",
    response_model=ExperimentRead,
)
async def update_experiment(
    experiment_id: uuid.UUID,
    payload: ExperimentUpdate,
    current_user: User = Depends(
        require_researcher_or_admin
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> Experiment:
    repository = ExperimentRepository(session)

    experiment = await repository.get(
        experiment_id
    )

    if experiment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    updates = payload.model_dump(
        exclude_unset=True
    )

    for field_name, value in updates.items():
        setattr(
            experiment,
            field_name,
            value,
        )

    if (
        payload.status
        == ExperimentStatus.RUNNING
        and experiment.started_at is None
    ):
        experiment.started_at = datetime.now(
            timezone.utc
        )

    if payload.status in {
        ExperimentStatus.COMPLETED,
        ExperimentStatus.FAILED,
    }:
        experiment.completed_at = datetime.now(
            timezone.utc
        )

    await session.commit()
    await session.refresh(experiment)

    return experiment