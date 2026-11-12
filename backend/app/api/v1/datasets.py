from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.api.dependencies import require_admin
from app.domain.enums import DatasetExportStatus

from app.domain.services.platform_policy import require_permission
from app.core.config import ROOT_DIR
from app.db.models import (
    DatasetExport,
    DatasetVersion,
    User,
)
from app.db.repositories.dataset_export import (
    DatasetExportRepository,
)
from app.db.repositories.dataset_version import (
    DatasetVersionRepository,
)
from app.db.session import get_db_session
from app.domain.enums import AnalysisTask
from app.domain.services.audit import AuditService
from app.domain.services.dataset_artifacts import (
    DatasetArtifactFileNotFoundError,
    DatasetArtifactKeyError,
    DatasetArtifactPathError,
    DatasetArtifactPreviewError,
    DatasetArtifactService,
    DatasetArtifactStatisticsError,
    DatasetManifestNotFoundError,
    DatasetManifestParseError,
    DatasetQualityReportError,
)
from app.domain.services.dataset import (
    DatasetRegistrationError,
    DatasetService,
    UnsupportedDatasetFileError,
)
from app.domain.services.dataset_cleaning import (
    DatasetCleaningError,
    DatasetCleaningInsufficientRowsError,
    DatasetCleaningLabelsError,
    DatasetCleaningService,
    DatasetCleaningVersionConflictError,
)
from app.domain.services.dataset_export import (
    DatasetExportEmptyError,
    DatasetExportSelectionError,
    DatasetExportService,
    DatasetExportTaskMismatchError,
)
from app.domain.services.dataset_mapping import (
    DatasetInspectionExpiredError,
    DatasetInspectionNotFoundError,
    DatasetMappingColumnError,
    DatasetMappingService,
    DatasetMappingValidationError,
)
from app.domain.services.dataset_inspection import (
    DatasetInspectionFileTooLargeError,
    DatasetInspectionParseError,
    DatasetInspectionService,
    EmptyDatasetInspectionError,
    UnsupportedInspectionFileError,
)
from app.ml.dataset_processing import (
    DatasetValidationError,
)
from app.schemas.dataset_cleaning import (
    DatasetCleanedVersionCreate,
    DatasetCleanedVersionRead,
)
from app.schemas.dataset_export import (
    DatasetExportCreate,
    DatasetExportRead,
)
from app.schemas.dataset_mapping import (
    DatasetMappingValidationRequest,
    DatasetMappingValidationResponse,
    DatasetRegistrationRequest,
)
from app.schemas.dataset_inspection import (
    DatasetInspectionRead,
)
from app.schemas.dataset_version import (
    DatasetManifestRead,
    DatasetFilesRead,
    DatasetFilePreviewRead,
    DatasetFileStatisticsRead,
    DatasetRegistryRead,
    DatasetRegistrySummary,
    DatasetQualityReportRead,
    DatasetVersionRead,
)

router = APIRouter(
    prefix="/datasets",
    tags=["Datasets"],
)


def _resolve_export_file(
    stored_path: str | None,
) -> Path:
    if not stored_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export file is not available",
        )

    candidate = Path(stored_path)

    if not candidate.is_absolute():
        candidate = ROOT_DIR / candidate

    try:
        resolved_path = candidate.resolve(strict=True)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export file was not found on disk",
        ) from exc

    export_root = (ROOT_DIR / "storage" / "dataset-exports").resolve()

    try:
        resolved_path.relative_to(export_root)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Stored export path is invalid",
        ) from exc

    if not resolved_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export file was not found on disk",
        )

    return resolved_path


async def _get_user_export_or_404(
    *,
    export_id: uuid.UUID,
    current_user: User,
    session: AsyncSession,
) -> DatasetExport:
    repository = DatasetExportRepository(session)

    export_record = await repository.get_for_user(
        export_id=export_id,
        user_id=current_user.id,
    )

    if export_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset export not found",
        )

    return export_record


@router.post("/import-splits", response_model=DatasetVersionRead, status_code=201)
async def import_predefined_splits(
    train: UploadFile = File(...), validation: UploadFile = File(...), test: UploadFile = File(...),
    name: str = Form(..., min_length=2, max_length=150), version: str = Form(..., min_length=1, max_length=50),
    task: AnalysisTask = Form(...), text_column: str = Form("Data"), label_column: str = Form("Label"),
    label_mapping: str = Form("{}"), source_name: str | None = Form(None), source_url: str | None = Form(None),
    license_name: str | None = Form(None),
    current_user: User = Depends(require_permission("dataset_upload")),
    session: AsyncSession = Depends(get_db_session),
):
    import json
    from app.domain.services.dataset_splits import import_splits
    try:
        mapping = json.loads(label_mapping)
        if not isinstance(mapping, dict) or any(not isinstance(k, str) or not isinstance(v, str) or not v.strip() for k, v in mapping.items()):
            raise ValueError("Label mapping must be a JSON object with nonempty text values.")
        if not name.strip() or not version.strip():
            raise ValueError("Dataset name and version are required.")
        return await import_splits(session, {"train": train, "validation": validation, "test": test},
            {"name": name, "version": version, "task": task, "description": "Imported predefined splits; original row membership preserved.", "source_name": source_name, "source_url": source_url, "license_name": license_name}, text_column, label_column, mapping)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        await train.close()
        await validation.close()
        await test.close()


@router.post(
    "/inspect",
    response_model=DatasetInspectionRead,
    status_code=status.HTTP_201_CREATED,
)
async def inspect_dataset(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(require_permission("dataset_upload")),
    session: AsyncSession = Depends(get_db_session),
) -> DatasetInspectionRead:
    service = DatasetInspectionService()

    try:
        result = await service.inspect(
            file=file,
        )

    except UnsupportedInspectionFileError as exc:
        raise HTTPException(
            status_code=(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE),
            detail=str(exc),
        ) from exc

    except DatasetInspectionFileTooLargeError as exc:
        raise HTTPException(
            status_code=(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE),
            detail=str(exc),
        ) from exc

    except (
        DatasetInspectionParseError,
        EmptyDatasetInspectionError,
    ) as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        ) from exc

    finally:
        await file.close()

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="dataset.inspected",
        user_id=current_user.id,
        resource_type="dataset_inspection",
        resource_id=str(result["upload_id"]),
        details={
            "filename": result["filename"],
            "file_size_bytes": (result["file_size_bytes"]),
            "total_rows": (result["total_rows"]),
            "total_columns": (result["total_columns"]),
            "suggested_text_column": (result["suggested_text_column"]),
            "suggested_label_columns": (result["suggested_label_columns"]),
        },
    )

    return DatasetInspectionRead(**result)


@router.post(
    "/validate-mapping",
    response_model=DatasetMappingValidationResponse,
)
async def validate_dataset_mapping(
    payload: DatasetMappingValidationRequest,
    request: Request,
    current_user: User = Depends(require_permission("dataset_upload")),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    service = DatasetMappingService()

    try:
        result = service.validate_mapping(
            payload=payload,
        )

    except DatasetInspectionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    except DatasetInspectionExpiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail=str(exc),
        ) from exc

    except DatasetMappingColumnError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    except DatasetMappingValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="dataset.mapping_validated",
        user_id=current_user.id,
        resource_type="dataset_inspection",
        resource_id=str(payload.upload_id),
        details={
            "text_column": payload.text_column,
            "label_column": payload.label_column,
            "label_mapping": payload.label_mapping,
            "total_rows": result["total_rows"],
            "valid_rows": result["valid_rows"],
            "invalid_rows": result["invalid_rows"],
            "can_register": result["can_register"],
        },
    )

    return result


@router.post(
    "/register",
    response_model=DatasetVersionRead,
    status_code=status.HTTP_201_CREATED,
)
async def register_inspected_dataset(
    payload: DatasetRegistrationRequest,
    request: Request,
    current_user: User = Depends(require_permission("dataset_upload")),
    session: AsyncSession = Depends(get_db_session),
) -> DatasetVersion:
    service = DatasetService(session)

    try:
        dataset_version = await service.register_inspected_dataset(
            payload=payload,
        )

    except DatasetInspectionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    except DatasetInspectionExpiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail=str(exc),
        ) from exc

    except DatasetMappingColumnError as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        ) from exc

    except DatasetMappingValidationError as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        ) from exc

    except (
        DatasetRegistrationError,
        DatasetValidationError,
    ) as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="dataset.registered",
        user_id=current_user.id,
        resource_type="dataset_version",
        resource_id=str(dataset_version.id),
        details={
            "name": dataset_version.name,
            "version": (dataset_version.version),
            "task": (
                dataset_version.task.value
                if hasattr(
                    dataset_version.task,
                    "value",
                )
                else str(dataset_version.task)
            ),
            "total_samples": (dataset_version.total_samples),
            "train_samples": (dataset_version.train_samples),
            "validation_samples": (dataset_version.validation_samples),
            "test_samples": (dataset_version.test_samples),
            "inspection_upload_id": str(payload.upload_id),
            "text_column": (payload.text_column),
            "label_column": (payload.label_column),
            "label_mapping": dict(payload.label_mapping),
        },
    )

    return dataset_version


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
    current_user: User = Depends(require_permission("dataset_upload")),
    session: AsyncSession = Depends(get_db_session),
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
            status_code=(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE),
            detail=("Only CSV dataset files are supported"),
        )

    except DatasetValidationError as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        )

    finally:
        await file.close()


@router.post(
    "/exports",
    response_model=DatasetExportRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_dataset_export(
    payload: DatasetExportCreate,
    request: Request,
    current_user: User = Depends(require_permission("dataset_export")),
    session: AsyncSession = Depends(get_db_session),
) -> DatasetExport:
    service = DatasetExportService(session)

    try:
        export_record = await service.create_export(
            payload=payload,
            created_by_id=current_user.id,
        )

    except DatasetExportSelectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    except DatasetExportTaskMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    except DatasetExportEmptyError as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="dataset_export.created",
        user_id=current_user.id,
        resource_type="dataset_export",
        resource_id=str(export_record.id),
        details={
            "name": export_record.name,
            "version": export_record.version,
            "task": (
                export_record.task.value
                if hasattr(
                    export_record.task,
                    "value",
                )
                else str(export_record.task)
            ),
            "export_format": (
                export_record.export_format.value
                if hasattr(
                    export_record.export_format,
                    "value",
                )
                else str(export_record.export_format)
            ),
            "selected_records": (export_record.selected_records),
            "exported_records": (export_record.exported_records),
            "skipped_records": (export_record.skipped_records),
            "dataset_version_id": (
                str(export_record.dataset_version_id)
                if export_record.dataset_version_id
                else None
            ),
        },
    )

    return export_record


@router.get(
    "/exports",
    response_model=list[DatasetExportRead],
)
async def list_dataset_exports(
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
    current_user: User = Depends(require_permission("dataset_export")),
    session: AsyncSession = Depends(get_db_session),
) -> list[DatasetExport]:
    repository = DatasetExportRepository(session)

    return await repository.list_for_user(
        user_id=current_user.id,
        limit=limit,
        offset=offset,
    )


@router.delete("/exports/{export_id}", status_code=204)
async def delete_dataset_export(
    export_id: uuid.UUID,
    request: Request,
    current_admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    result = await session.scalars(
        select(DatasetExport).where(DatasetExport.id == export_id).with_for_update()
    )
    record = result.first()
    if record is None:
        raise HTTPException(status_code=404, detail="Export history entry not found")
    if record.status not in {DatasetExportStatus.COMPLETED, DatasetExportStatus.FAILED}:
        raise HTTPException(status_code=409, detail="Pending or processing exports cannot be deleted.")
    previous_status = record.status.value
    await session.delete(record)
    # AuditService commits the deletion and audit record in the same transaction.
    await AuditService(session).record(
        request=request, user_id=current_admin.id,
        action="dataset_export.deleted", resource_type="dataset_export",
        resource_id=str(export_id), details={"status": previous_status, "scope": "history_only"},
    )


@router.get(
    "/exports/{export_id}",
    response_model=DatasetExportRead,
)
async def get_dataset_export(
    export_id: uuid.UUID,
    current_user: User = Depends(require_permission("dataset_export")),
    session: AsyncSession = Depends(get_db_session),
) -> DatasetExport:
    return await _get_user_export_or_404(
        export_id=export_id,
        current_user=current_user,
        session=session,
    )


@router.get(
    "/exports/{export_id}/download",
    response_class=FileResponse,
)
async def download_dataset_export(
    export_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("dataset_export")),
    session: AsyncSession = Depends(get_db_session),
) -> FileResponse:
    export_record = await _get_user_export_or_404(
        export_id=export_id,
        current_user=current_user,
        session=session,
    )

    status_value = (
        export_record.status.value
        if hasattr(
            export_record.status,
            "value",
        )
        else str(export_record.status).lower()
    )

    if status_value != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=("Dataset export is not completed"),
        )

    artifact_path = _resolve_export_file(export_record.artifact_path)

    format_value = (
        export_record.export_format.value
        if hasattr(
            export_record.export_format,
            "value",
        )
        else str(export_record.export_format).lower()
    )

    media_type = (
        "text/csv; charset=utf-8" if format_value == "csv" else "application/x-ndjson"
    )

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="dataset_export.downloaded",
        user_id=current_user.id,
        resource_type="dataset_export",
        resource_id=str(export_record.id),
        details={
            "filename": artifact_path.name,
            "export_format": format_value,
            "checksum": export_record.checksum,
        },
    )

    return FileResponse(
        path=artifact_path,
        media_type=media_type,
        filename=artifact_path.name,
    )


@router.get(
    "/exports/{export_id}/manifest",
    response_class=FileResponse,
)
async def download_dataset_export_manifest(
    export_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("dataset_export")),
    session: AsyncSession = Depends(get_db_session),
) -> FileResponse:
    export_record = await _get_user_export_or_404(
        export_id=export_id,
        current_user=current_user,
        session=session,
    )

    manifest_path = _resolve_export_file(export_record.manifest_path)

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action=("dataset_export.manifest_downloaded"),
        user_id=current_user.id,
        resource_type="dataset_export",
        resource_id=str(export_record.id),
        details={
            "filename": manifest_path.name,
            "checksum": export_record.checksum,
        },
    )

    return FileResponse(
        path=manifest_path,
        media_type="application/json",
        filename=(f"{export_record.name}-{export_record.version}-manifest.json"),
    )


@router.get(
    "",
    response_model=DatasetRegistryRead,
)
async def list_datasets(
    search: str | None = Query(
        default=None,
        min_length=1,
        max_length=150,
    ),
    task: AnalysisTask | None = Query(
        default=None,
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=200,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
    sort_by: str = Query(
        default="created_at",
        pattern=("^(created_at|updated_at|name|version|total_samples)$"),
    ),
    sort_order: str = Query(
        default="desc",
        pattern="^(asc|desc)$",
    ),
    current_user: User = Depends(require_permission("research_view")),
    session: AsyncSession = Depends(get_db_session),
) -> DatasetRegistryRead:
    repository = DatasetVersionRepository(session)

    items, total = await repository.list_filtered(
        search=search,
        task=task,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    return DatasetRegistryRead(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        has_previous=offset > 0,
        has_next=(offset + len(items)) < total,
    )


@router.get(
    "/summary",
    response_model=DatasetRegistrySummary,
)
async def get_dataset_registry_summary(
    current_user: User = Depends(require_permission("research_view")),
    session: AsyncSession = Depends(get_db_session),
) -> DatasetRegistrySummary:
    repository = DatasetVersionRepository(session)

    summary = await repository.get_summary()

    return DatasetRegistrySummary(**summary)


@router.post(
    "/{dataset_version_id}/cleaned-version",
    response_model=DatasetCleanedVersionRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_cleaned_dataset_version(
    dataset_version_id: uuid.UUID,
    payload: DatasetCleanedVersionCreate,
    request: Request,
    current_user: User = Depends(require_permission("dataset_upload")),
    session: AsyncSession = Depends(get_db_session),
) -> DatasetCleanedVersionRead:
    repository = DatasetVersionRepository(session)

    source_dataset = await repository.get(dataset_version_id)

    if source_dataset is None:
        raise HTTPException(
            status_code=(status.HTTP_404_NOT_FOUND),
            detail="Dataset version not found",
        )

    service = DatasetCleaningService(session)

    try:
        (
            cleaned_dataset,
            cleaning_counts,
        ) = await service.create_cleaned_version(
            source_dataset=source_dataset,
            payload=payload,
        )

    except DatasetCleaningVersionConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    except (
        DatasetArtifactFileNotFoundError,
        DatasetManifestNotFoundError,
    ) as exc:
        raise HTTPException(
            status_code=(status.HTTP_404_NOT_FOUND),
            detail=str(exc),
        ) from exc

    except (
        DatasetArtifactPathError,
        DatasetManifestParseError,
        DatasetCleaningError,
        DatasetCleaningInsufficientRowsError,
        DatasetCleaningLabelsError,
        DatasetValidationError,
    ) as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action=("dataset.cleaned_version_created"),
        user_id=current_user.id,
        resource_type="dataset_version",
        resource_id=str(cleaned_dataset.id),
        details={
            "source_dataset_version_id": (str(source_dataset.id)),
            "source_dataset_version": (source_dataset.version),
            "cleaned_dataset_version": (cleaned_dataset.version),
            "source_rows": (cleaning_counts["source_rows"]),
            "cleaned_rows": (cleaning_counts["cleaned_rows"]),
            "removed_rows": (cleaning_counts["removed_rows"]),
            "removed_replacement_character_rows": (
                cleaning_counts["removed_replacement_character_rows"]
            ),
            "removed_duplicate_text_rows": (
                cleaning_counts["removed_duplicate_text_rows"]
            ),
        },
    )

    return DatasetCleanedVersionRead(
        source_dataset_version_id=(source_dataset.id),
        cleaned_dataset=cleaned_dataset,
        cleaning_counts=cleaning_counts,
        source_version_preserved=True,
    )


@router.get(
    "/{dataset_version_id}/quality-report",
    response_model=DatasetQualityReportRead,
)
async def get_dataset_quality_report(
    dataset_version_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("research_view")),
    session: AsyncSession = Depends(get_db_session),
) -> DatasetQualityReportRead:
    repository = DatasetVersionRepository(session)

    dataset = await repository.get(dataset_version_id)

    if dataset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset version not found",
        )

    service = DatasetArtifactService()

    try:
        result = service.get_quality_report(
            dataset_version=dataset,
        )

    except (
        DatasetManifestNotFoundError,
        DatasetArtifactFileNotFoundError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    except (
        DatasetArtifactPathError,
        DatasetManifestParseError,
        DatasetArtifactStatisticsError,
        DatasetQualityReportError,
    ) as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="dataset.quality_report_viewed",
        user_id=current_user.id,
        resource_type="dataset_version",
        resource_id=str(dataset.id),
        details={
            "status": result["status"],
            "training_ready": (result["training_ready"]),
            "quality_score": (result["quality_score"]),
            "warning_count": len(result["warnings"]),
            "error_count": len(result["errors"]),
            "processed_replacement_character_rows": (
                result["summary"]["processed_replacement_character_rows"]
            ),
        },
    )

    return DatasetQualityReportRead(**result)


@router.get(
    "/{dataset_version_id}/manifest",
    response_model=DatasetManifestRead,
)
async def get_dataset_manifest(
    dataset_version_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("research_view")),
    session: AsyncSession = Depends(get_db_session),
) -> DatasetManifestRead:
    repository = DatasetVersionRepository(session)

    dataset = await repository.get(dataset_version_id)

    if dataset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset version not found",
        )

    service = DatasetArtifactService()

    try:
        result = service.get_manifest(
            dataset_version=dataset,
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="dataset.manifest_viewed",
        user_id=current_user.id,
        resource_type="dataset_version",
        resource_id=str(dataset.id),
        details={
            "manifest_type": (result["manifest_type"]),
            "manifest_path": (result["manifest_path"]),
        },
    )

    return DatasetManifestRead(**result)


@router.get(
    "/{dataset_version_id}/files",
    response_model=DatasetFilesRead,
)
async def get_dataset_files(
    dataset_version_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_permission("research_view")),
    session: AsyncSession = Depends(get_db_session),
) -> DatasetFilesRead:
    repository = DatasetVersionRepository(session)

    dataset = await repository.get(dataset_version_id)

    if dataset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset version not found",
        )

    service = DatasetArtifactService()

    try:
        result = service.get_file_inventory(
            dataset_version=dataset,
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="dataset.files_viewed",
        user_id=current_user.id,
        resource_type="dataset_version",
        resource_id=str(dataset.id),
        details={
            "manifest_type": (result["manifest_type"]),
            "total_files": (result["total_files"]),
            "available_files": (result["available_files"]),
            "missing_files": (result["missing_files"]),
        },
    )

    return DatasetFilesRead(**result)


@router.get(
    "/{dataset_version_id}/files/{file_key}/preview",
    response_model=DatasetFilePreviewRead,
)
async def preview_dataset_file(
    dataset_version_id: uuid.UUID,
    file_key: str,
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
    current_user: User = Depends(require_permission("research_view")),
    session: AsyncSession = Depends(get_db_session),
) -> DatasetFilePreviewRead:
    repository = DatasetVersionRepository(session)

    dataset = await repository.get(dataset_version_id)

    if dataset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset version not found",
        )

    service = DatasetArtifactService()

    try:
        result = service.preview_file(
            dataset_version=dataset,
            file_key=file_key,
            limit=limit,
            offset=offset,
        )

    except DatasetArtifactKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except (
        DatasetArtifactFileNotFoundError,
        DatasetManifestNotFoundError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    except (
        DatasetArtifactPathError,
        DatasetManifestParseError,
        DatasetArtifactPreviewError,
    ) as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="dataset.file_previewed",
        user_id=current_user.id,
        resource_type="dataset_version",
        resource_id=str(dataset.id),
        details={
            "file_key": result["file_key"],
            "filename": result["filename"],
            "total_rows": result["total_rows"],
            "returned_rows": len(result["rows"]),
            "limit": result["limit"],
            "offset": result["offset"],
        },
    )

    return DatasetFilePreviewRead(**result)


@router.get(
    "/{dataset_version_id}/files/{file_key}/statistics",
    response_model=DatasetFileStatisticsRead,
)
async def get_dataset_file_statistics(
    dataset_version_id: uuid.UUID,
    file_key: str,
    request: Request,
    current_user: User = Depends(require_permission("research_view")),
    session: AsyncSession = Depends(get_db_session),
) -> DatasetFileStatisticsRead:
    repository = DatasetVersionRepository(session)

    dataset = await repository.get(dataset_version_id)

    if dataset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset version not found",
        )

    service = DatasetArtifactService()

    try:
        result = service.get_file_statistics(
            dataset_version=dataset,
            file_key=file_key,
        )

    except DatasetArtifactKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except (
        DatasetArtifactFileNotFoundError,
        DatasetManifestNotFoundError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    except (
        DatasetArtifactPathError,
        DatasetManifestParseError,
        DatasetArtifactStatisticsError,
    ) as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action=("dataset.file_statistics_viewed"),
        user_id=current_user.id,
        resource_type="dataset_version",
        resource_id=str(dataset.id),
        details={
            "file_key": result["file_key"],
            "filename": result["filename"],
            "total_rows": result["total_rows"],
            "total_columns": (result["total_columns"]),
            "duplicate_text_rows": (result["duplicate_text_rows"]),
            "replacement_character_rows": (result["replacement_character_rows"]),
            "label_distribution": (result["label_distribution"]),
        },
    )

    return DatasetFileStatisticsRead(**result)


@router.get(
    "/{dataset_version_id}/files/{file_key}/download",
    response_class=FileResponse,
)
async def download_dataset_file(
    dataset_version_id: uuid.UUID,
    file_key: str,
    request: Request,
    current_user: User = Depends(require_permission("dataset_export")),
    session: AsyncSession = Depends(get_db_session),
) -> FileResponse:
    repository = DatasetVersionRepository(session)

    dataset = await repository.get(dataset_version_id)

    if dataset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset version not found",
        )

    service = DatasetArtifactService()

    try:
        artifact = service.get_download_file(
            dataset_version=dataset,
            file_key=file_key,
        )

    except DatasetArtifactKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except (
        DatasetArtifactFileNotFoundError,
        DatasetManifestNotFoundError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    except (
        DatasetArtifactPathError,
        DatasetManifestParseError,
    ) as exc:
        raise HTTPException(
            status_code=(status.HTTP_422_UNPROCESSABLE_ENTITY),
            detail=str(exc),
        ) from exc

    audit_service = AuditService(session)

    await audit_service.record(
        request=request,
        action="dataset.file_downloaded",
        user_id=current_user.id,
        resource_type="dataset_version",
        resource_id=str(dataset.id),
        details={
            "file_key": artifact["key"],
            "filename": artifact["filename"],
            "size_bytes": artifact["size_bytes"],
            "checksum_sha256": (artifact["checksum_sha256"]),
            "media_type": artifact["media_type"],
        },
    )

    return FileResponse(
        path=artifact["path"],
        media_type=artifact["media_type"],
        filename=artifact["filename"],
    )


@router.get(
    "/{dataset_version_id}",
    response_model=DatasetVersionRead,
)
async def get_dataset(
    dataset_version_id: uuid.UUID,
    current_user: User = Depends(require_permission("research_view")),
    session: AsyncSession = Depends(get_db_session),
) -> DatasetVersion:
    repository = DatasetVersionRepository(session)

    dataset = await repository.get(dataset_version_id)

    if dataset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset version not found",
        )

    return dataset
