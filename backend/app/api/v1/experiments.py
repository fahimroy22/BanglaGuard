from __future__ import annotations
from app.domain.services.platform_policy import require_permission

# FastAPI intentionally uses Depends and Query in parameter defaults.
# ruff: noqa: B008
import uuid
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field, ConfigDict

class ModelRegistrationIdentity(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(min_length=1, max_length=150)
    version: str = Field(min_length=1, max_length=50)


from app.db.models import (
    Experiment,
    User,
)
from app.db.repositories.dataset_version import (
    DatasetVersionRepository,
)
from app.db.repositories.experiment import (
    ExperimentRepository,
)
from app.db.session import get_db_session
from app.domain.enums import ExperimentStatus
from app.domain.services.audit import AuditService
from app.domain.services.classical_model_registration import (
    ClassicalModelRegistrationArtifactError,
    ClassicalModelRegistrationConflictError,
    ClassicalModelRegistrationError,
    ClassicalModelRegistrationService,
    ClassicalModelRegistrationStateError,
)
from app.domain.services.classical_training_execution import (
    ClassicalExperimentConfigurationError,
    ClassicalExperimentStateError,
    ClassicalTrainingArtifactError,
    ClassicalTrainingExecutionError,
    ClassicalTrainingExecutionService,
)
from app.domain.services.dataset_artifacts import (
    DatasetArtifactError,
)
from app.domain.services.experiment_preparation import (
    ExperimentPreparationError,
    ExperimentPreparationService,
    ExperimentWorkspaceConflictError,
)
from app.domain.services.training_readiness import (
    DatasetNotTrainingReadyError,
    TrainingDatasetArtifactError,
    TrainingReadinessError,
    TrainingReadinessService,
    TrainingTaskMismatchError,
)
from app.domain.services.transformer_experiment_preparation import (
    TransformerExperimentPreparationError,
    TransformerExperimentPreparationService,
    TransformerExperimentWorkspaceConflictError,
)
from app.domain.services.transformer_model_registration import (
    TransformerModelRegistrationArtifactError,
    TransformerModelRegistrationConflictError,
    TransformerModelRegistrationError,
    TransformerModelRegistrationService,
    TransformerModelRegistrationStateError,
)
from app.domain.services.transformer_training_execution import (
    TransformerDatasetPreparationError,
    TransformerDeviceError,
    TransformerExperimentConfigurationError,
    TransformerExperimentStateError,
    TransformerModelLoadingError,
    TransformerTrainerConfigurationError,
    TransformerTrainingArtifactError,
    TransformerTrainingExecutionError,
    TransformerTrainingExecutionService,
)
from app.schemas.experiment import (
    ExperimentCreate,
    ExperimentRead,
    ExperimentUpdate,
)
from app.schemas.training import (
    ClassicalModelRegistrationRead,
    ClassicalTrainingExecutionRead,
    ClassicalTrainingRequest,
    PreparedClassicalExperimentRead,
    PreparedTransformerExperimentRead,
    TrainingReadinessRead,
    TransformerModelRegistrationRead,
    TransformerTrainingExecutionRead,
    TransformerTrainingReadinessRead,
    TransformerTrainingRequest,
)

router = APIRouter(
    prefix="/experiments",
    tags=["Experiments"],
)


@router.post(
    "/prepare-classical",
    response_model=PreparedClassicalExperimentRead,
    status_code=status.HTTP_201_CREATED,
)
async def prepare_classical_experiment(
    payload: ClassicalTrainingRequest,
    request: Request,
    current_user: User = Depends(require_permission("experiment_create")),
    session: AsyncSession = Depends(get_db_session),
) -> PreparedClassicalExperimentRead:
    dataset_repository = DatasetVersionRepository(session)

    dataset = await dataset_repository.get(payload.dataset_version_id)

    if dataset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset version not found",
        )

    service = ExperimentPreparationService(session)

    try:
        result = await service.prepare_classical_experiment(
            dataset_version=dataset,
            payload=payload,
        )

    except DatasetNotTrainingReadyError as exc:
        raise HTTPException(
            status_code=(status.HTTP_409_CONFLICT),
            detail=str(exc),
        ) from exc

    except (
        TrainingDatasetArtifactError,
        TrainingTaskMismatchError,
        TrainingReadinessError,
        ExperimentPreparationError,
    ) as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        ) from exc

    except ExperimentWorkspaceConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="experiment.classical_prepared",
        user_id=current_user.id,
        resource_type="experiment",
        resource_id=str(result["experiment_id"]),
        details={
            "dataset_version_id": str(result["dataset_version_id"]),
            "status": result["status"],
            "task": result["task"],
            "quality_score": (result["quality_score"]),
            "workspace_created": True,
        },
    )

    return PreparedClassicalExperimentRead(**result)


@router.post(
    "",
    response_model=ExperimentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_experiment(
    payload: ExperimentCreate,
    current_user: User = Depends(require_permission("experiment_create")),
    session: AsyncSession = Depends(get_db_session),
) -> Experiment:
    repository = ExperimentRepository(session)

    experiment = Experiment(
        name=payload.name,
        description=payload.description,
        status=ExperimentStatus.PLANNED,
        dataset_version_id=(payload.dataset_version_id),
        model_version_id=(payload.model_version_id),
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
    dataset_version_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(require_permission("research_view")),
    session: AsyncSession = Depends(get_db_session),
) -> list[Experiment]:
    repository = ExperimentRepository(session)

    if dataset_version_id is not None:
        return await repository.list_by_dataset(dataset_version_id)

    return await repository.list()


@router.post(
    "/training-readiness",
    response_model=TrainingReadinessRead,
)
async def evaluate_classical_training_readiness(
    payload: ClassicalTrainingRequest,
    request: Request,
    current_user: User = Depends(require_permission("experiment_create")),
    session: AsyncSession = Depends(get_db_session),
) -> TrainingReadinessRead:
    dataset_repository = DatasetVersionRepository(session)

    dataset = await dataset_repository.get(payload.dataset_version_id)

    if dataset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset version not found",
        )

    readiness_service = TrainingReadinessService()

    try:
        result = readiness_service.evaluate(
            dataset_version=dataset,
            payload=payload,
        )

    except TrainingTaskMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except DatasetNotTrainingReadyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    except TrainingDatasetArtifactError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    except (
        TrainingReadinessError,
        DatasetArtifactError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="experiment.training_readiness_evaluated",
        user_id=current_user.id,
        resource_type="dataset_version",
        resource_id=str(dataset.id),
        details={
            "experiment_name": (payload.experiment_name),
            "model_name": payload.model_name,
            "model_version": payload.model_version,
            "model_family": payload.model_family,
            "task": result["task"],
            "training_ready": (result["training_ready"]),
            "quality_status": (result["quality_status"]),
            "quality_score": (result["quality_score"]),
            "train_samples": (result["train_samples"]),
            "validation_samples": (result["validation_samples"]),
            "test_samples": (result["test_samples"]),
        },
    )

    return TrainingReadinessRead(**result)


# PHASE 22.4.4.1F: TRANSFORMER FASTAPI ROUTES


@router.post(
    "/transformer-training-readiness",
    response_model=TransformerTrainingReadinessRead,
)
async def evaluate_transformer_training_readiness(
    payload: TransformerTrainingRequest,
    request: Request,
    current_user: User = Depends(require_permission("experiment_create")),
    session: AsyncSession = Depends(get_db_session),
) -> TransformerTrainingReadinessRead:
    dataset_repository = DatasetVersionRepository(session)

    dataset = await dataset_repository.get(payload.dataset_version_id)

    if dataset is None:
        raise HTTPException(
            status_code=(status.HTTP_404_NOT_FOUND),
            detail=("Dataset version not found"),
        )

    readiness_service = TrainingReadinessService()

    try:
        readiness = readiness_service.evaluate(
            dataset_version=dataset,
            payload=payload,
        )

        execution_service = TransformerTrainingExecutionService(session)

        (
            requested_device,
            resolved_device,
        ) = execution_service._resolve_device(payload.model_dump(mode="json"))

    except TrainingTaskMismatchError as exc:
        raise HTTPException(
            status_code=(status.HTTP_400_BAD_REQUEST),
            detail=str(exc),
        ) from exc

    except DatasetNotTrainingReadyError as exc:
        raise HTTPException(
            status_code=(status.HTTP_409_CONFLICT),
            detail=str(exc),
        ) from exc

    except (
        TrainingDatasetArtifactError,
        TrainingReadinessError,
        DatasetArtifactError,
        TransformerDeviceError,
    ) as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        ) from exc

    tokenizer_name = (
        payload.model.tokenizer_name_or_path
        or payload.model.pretrained_model_name_or_path
    )

    result = {
        **readiness,
        "requested_device": (requested_device),
        "resolved_device": (resolved_device),
        "pretrained_model_name_or_path": (payload.model.pretrained_model_name_or_path),
        "tokenizer_name_or_path": (tokenizer_name),
    }

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action=("experiment.transformer_training_readiness_evaluated"),
        user_id=current_user.id,
        resource_type=("dataset_version"),
        resource_id=str(dataset.id),
        details={
            "experiment_name": (payload.experiment_name),
            "model_name": (payload.model_name),
            "model_version": (payload.model_version),
            "model_family": (payload.model_family),
            "task": result["task"],
            "training_ready": (result["training_ready"]),
            "quality_status": (result["quality_status"]),
            "quality_score": (result["quality_score"]),
            "requested_device": (requested_device),
            "resolved_device": (resolved_device),
        },
    )

    return TransformerTrainingReadinessRead(**result)


@router.post(
    "/prepare-transformer",
    response_model=(PreparedTransformerExperimentRead),
    status_code=(status.HTTP_201_CREATED),
)
async def prepare_transformer_experiment(
    payload: TransformerTrainingRequest,
    request: Request,
    current_user: User = Depends(require_permission("experiment_create")),
    session: AsyncSession = Depends(get_db_session),
) -> PreparedTransformerExperimentRead:
    dataset_repository = DatasetVersionRepository(session)

    dataset = await dataset_repository.get(payload.dataset_version_id)

    if dataset is None:
        raise HTTPException(
            status_code=(status.HTTP_404_NOT_FOUND),
            detail=("Dataset version not found"),
        )

    service = TransformerExperimentPreparationService(session)

    try:
        result = await service.prepare(
            dataset_version=dataset,
            payload=payload,
        )

    except DatasetNotTrainingReadyError as exc:
        raise HTTPException(
            status_code=(status.HTTP_409_CONFLICT),
            detail=str(exc),
        ) from exc

    except (
        TrainingDatasetArtifactError,
        TrainingTaskMismatchError,
        TrainingReadinessError,
        TransformerExperimentPreparationError,
        TransformerDeviceError,
    ) as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        ) from exc

    except TransformerExperimentWorkspaceConflictError as exc:
        raise HTTPException(
            status_code=(status.HTTP_409_CONFLICT),
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action=("experiment.transformer_prepared"),
        user_id=current_user.id,
        resource_type="experiment",
        resource_id=str(result["experiment_id"]),
        details={
            "dataset_version_id": str(result["dataset_version_id"]),
            "status": result["status"],
            "task": result["task"],
            "model_family": (result["model_family"]),
            "quality_score": (result["quality_score"]),
            "requested_device": (result["requested_device"]),
            "resolved_device": (result["resolved_device"]),
            "workspace_created": True,
        },
    )

    return PreparedTransformerExperimentRead(**result)


@router.post("/{experiment_id}/execute-transformer", status_code=202)
async def execute_transformer_experiment(
    experiment_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("training_execute")),
    session: AsyncSession = Depends(get_db_session),
):
    from app.api.v1.experiment_jobs import queue_experiment
    from app.domain.services.training_jobs import JobStore
    experiment = await ExperimentRepository(session).get(experiment_id)
    if experiment is None:
        raise HTTPException(404, "Experiment not found")
    is_transformer = (experiment.configuration or {}).get("model_family") == "banglabert_sequence_classification"
    if is_transformer != True:
        raise HTTPException(422, "Execution route does not match the experiment model family.")
    previous = JobStore().list(experiment_id=experiment_id, limit=1)
    if previous and previous[0]["owner"] != str(current_user.id) and str(current_user.role) != "admin":
        raise HTTPException(403, "Only the original researcher or an admin may retry this experiment.")
    job = await queue_experiment(experiment, current_user, session)
    await AuditService(session).record(request=request, action="experiment.training_queued", user_id=current_user.id, resource_type="experiment", resource_id=str(experiment_id), details={"job_id":job["id"]})
    return job


@router.post(
    "/{experiment_id}/register-transformer-model",
    response_model=(TransformerModelRegistrationRead),
    status_code=(status.HTTP_201_CREATED),
)
async def register_transformer_model(
    experiment_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("model_register")),
    session: AsyncSession = Depends(get_db_session),
    identity: ModelRegistrationIdentity | None = None,
) -> TransformerModelRegistrationRead:
    repository = ExperimentRepository(session)

    experiment = await repository.get(experiment_id)

    if experiment is None:
        raise HTTPException(
            status_code=(status.HTTP_404_NOT_FOUND),
            detail=("Experiment not found"),
        )

    service = TransformerModelRegistrationService(session)

    try:
        result = await service.register(experiment=experiment, identity=identity.model_dump() if identity else None)

    except (
        TransformerModelRegistrationConflictError,
        TransformerModelRegistrationStateError,
    ) as exc:
        raise HTTPException(
            status_code=(status.HTTP_409_CONFLICT),
            detail=str(exc),
        ) from exc

    except (
        TransformerModelRegistrationArtifactError,
        TransformerModelRegistrationError,
    ) as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action=("experiment.transformer_model_registered"),
        user_id=current_user.id,
        resource_type="model_version",
        resource_id=str(result["model_version_id"]),
        details={
            "experiment_id": str(result["experiment_id"]),
            "model_name": (result["name"]),
            "model_version": (result["version"]),
            "task": result["task"],
            "architecture": (result["architecture"]),
            "status": result["status"],
            "experiment_linked": (result["experiment_linked"]),
        },
    )

    return TransformerModelRegistrationRead(**result)


@router.post("/{experiment_id}/execute-classical", status_code=202)
async def execute_classical_experiment(
    experiment_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("training_execute")),
    session: AsyncSession = Depends(get_db_session),
):
    from app.api.v1.experiment_jobs import queue_experiment
    from app.domain.services.training_jobs import JobStore
    experiment = await ExperimentRepository(session).get(experiment_id)
    if experiment is None:
        raise HTTPException(404, "Experiment not found")
    is_transformer = (experiment.configuration or {}).get("model_family") == "banglabert_sequence_classification"
    if is_transformer != False:
        raise HTTPException(422, "Execution route does not match the experiment model family.")
    previous = JobStore().list(experiment_id=experiment_id, limit=1)
    if previous and previous[0]["owner"] != str(current_user.id) and str(current_user.role) != "admin":
        raise HTTPException(403, "Only the original researcher or an admin may retry this experiment.")
    job = await queue_experiment(experiment, current_user, session)
    await AuditService(session).record(request=request, action="experiment.training_queued", user_id=current_user.id, resource_type="experiment", resource_id=str(experiment_id), details={"job_id":job["id"]})
    return job


@router.post(
    "/{experiment_id}/register-classical-model",
    response_model=ClassicalModelRegistrationRead,
    status_code=status.HTTP_201_CREATED,
)
async def register_classical_model(
    experiment_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("model_register")),
    session: AsyncSession = Depends(get_db_session),
    identity: ModelRegistrationIdentity | None = None,
) -> ClassicalModelRegistrationRead:
    repository = ExperimentRepository(session)

    experiment = await repository.get(experiment_id)

    if experiment is None:
        raise HTTPException(
            status_code=(status.HTTP_404_NOT_FOUND),
            detail="Experiment not found",
        )

    service = ClassicalModelRegistrationService(session)

    try:
        result = await service.register(experiment=experiment, identity=identity.model_dump() if identity else None)

    except (
        ClassicalModelRegistrationConflictError,
        ClassicalModelRegistrationStateError,
    ) as exc:
        raise HTTPException(
            status_code=(status.HTTP_409_CONFLICT),
            detail=str(exc),
        ) from exc

    except (
        ClassicalModelRegistrationArtifactError,
        ClassicalModelRegistrationError,
    ) as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action=("experiment.classical_model_registered"),
        user_id=current_user.id,
        resource_type="model_version",
        resource_id=str(result["model_version_id"]),
        details={
            "experiment_id": str(result["experiment_id"]),
            "model_name": result["name"],
            "model_version": (result["version"]),
            "task": result["task"],
            "architecture": (result["architecture"]),
            "status": result["status"],
            "experiment_linked": (result["experiment_linked"]),
        },
    )

    return ClassicalModelRegistrationRead(**result)


@router.get(
    "/{experiment_id}",
    response_model=ExperimentRead,
)
async def get_experiment(
    experiment_id: uuid.UUID,
    current_user: User = Depends(require_permission("research_view")),
    session: AsyncSession = Depends(get_db_session),
) -> Experiment:
    repository = ExperimentRepository(session)

    experiment = await repository.get(experiment_id)

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
    current_user: User = Depends(require_permission("experiment_create")),
    session: AsyncSession = Depends(get_db_session),
) -> Experiment:
    repository = ExperimentRepository(session)

    experiment = await repository.get(experiment_id)

    if experiment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )

    from app.domain.services.training_jobs import JobStore
    if experiment.status != ExperimentStatus.PLANNED or JobStore().list(experiment_id=experiment_id, active=True):
        raise HTTPException(409, "Duplicate the experiment to change a queued, running or finished configuration.")
    if payload.status is not None and payload.status != ExperimentStatus.PLANNED:
        raise HTTPException(409, "Training job controls manage experiment status.")
    updates = payload.model_dump(exclude_unset=True)

    for field_name, value in updates.items():
        setattr(
            experiment,
            field_name,
            value,
        )

    if payload.status == ExperimentStatus.RUNNING and experiment.started_at is None:
        experiment.started_at = datetime.now(timezone.utc)

    if payload.status in {
        ExperimentStatus.COMPLETED,
        ExperimentStatus.FAILED,
    }:
        experiment.completed_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(experiment)

    return experiment
