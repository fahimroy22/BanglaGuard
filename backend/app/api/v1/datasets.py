import uuid

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    require_researcher_or_admin,
)
from app.db.models import DatasetVersion, User
from app.db.repositories.dataset_version import (
    DatasetVersionRepository,
)
from app.db.session import get_db_session
from app.domain.enums import AnalysisTask
from app.domain.services.dataset import (
    DatasetService,
    UnsupportedDatasetFileError,
)
from app.ml.dataset_processing import (
    DatasetValidationError,
)
from app.schemas.dataset_version import (
    DatasetVersionRead,
)


router = APIRouter(
    prefix="/datasets",
    tags=["Datasets"],
)


@router.post(
    "/upload",
    response_model=DatasetVersionRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_dataset(
    file: UploadFile = File(...),
    name: str = Form(...),
    version: str = Form(...),
    task: AnalysisTask = Form(...),
    description: str | None = Form(default=None),
    source_name: str | None = Form(default=None),
    source_url: str | None = Form(default=None),
    license_name: str | None = Form(default=None),
    current_user: User = Depends(
        require_researcher_or_admin
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> DatasetVersion:
    service = DatasetService(session)

    try:
        return await service.upload_and_register(
            file=file,
            name=name,
            version=version,
            task=task,
            description=description,
            source_name=source_name,
            source_url=source_url,
            license_name=license_name,
        )

    except UnsupportedDatasetFileError:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only CSV dataset files are supported",
        )

    except DatasetValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    finally:
        await file.close()


@router.get(
    "",
    response_model=list[DatasetVersionRead],
)
async def list_datasets(
    current_user: User = Depends(
        require_researcher_or_admin
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> list[DatasetVersion]:
    repository = DatasetVersionRepository(session)

    return await repository.list()


@router.get(
    "/{dataset_version_id}",
    response_model=DatasetVersionRead,
)
async def get_dataset(
    dataset_version_id: uuid.UUID,
    current_user: User = Depends(
        require_researcher_or_admin
    ),
    session: AsyncSession = Depends(
        get_db_session
    ),
) -> DatasetVersion:
    repository = DatasetVersionRepository(session)

    dataset = await repository.get(
        dataset_version_id
    )

    if dataset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset version not found",
        )

    return dataset