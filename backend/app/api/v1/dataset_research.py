"""Dataset analysis, upload review and immutable preparation endpoints."""

import csv
import json
import shutil
import uuid
from pathlib import Path
from typing import Annotated

from app.core.config import ROOT_DIR
from app.db.models import DatasetVersion, User
from app.db.repositories.dataset_version import DatasetVersionRepository
from app.db.session import get_db_session
from app.domain.enums import AnalysisTask
from app.domain.services.audit import AuditService
from app.domain.services.dataset_artifacts import DatasetArtifactError
from app.domain.services.dataset_research import (
    MAX_BYTES,
    MAX_ROWS,
    analyze,
    fingerprint,
    load_registered,
    preview,
    read_csv,
    write_version,
)
from app.domain.services.platform_policy import require_permission
from app.schemas.dataset_research import (
    ResearchRegister,
    ResearchRequest,
    ResearchSource,
    RowsRequest,
)
from app.schemas.dataset_version import DatasetVersionRead
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix="/dataset-research", tags=["Dataset research"])
Viewer = Annotated[User, Depends(require_permission("research_view"))]
Editor = Annotated[User, Depends(require_permission("dataset_upload"))]
Exporter = Annotated[User, Depends(require_permission("dataset_export"))]
Session = Annotated[AsyncSession, Depends(get_db_session)]

UPLOAD_ROOT = ROOT_DIR / "research/data/external/research-uploads"


async def dataset_or_404(session, identity):
    dataset = await DatasetVersionRepository(session).get(identity)
    if dataset is None:
        raise HTTPException(404, "Dataset not found.")
    return dataset


async def source_records(source, actor, session):
    if source.dataset_id:
        dataset = await dataset_or_404(session, source.dataset_id)
        try:
            records = await run_in_threadpool(load_registered, dataset)
        except (
            ValueError,
            OSError,
            UnicodeError,
            csv.Error,
            DatasetArtifactError,
        ) as exc:
            raise HTTPException(422, str(exc)) from exc
        return records, dataset.task.value, dataset
    folder = UPLOAD_ROOT / str(source.upload_id)
    try:
        metadata = json.loads((folder / "upload.json").read_text())
        if metadata["owner"] != str(actor.id):
            raise HTTPException(404, "Upload not found.")
        records = []
        for item in metadata["files"]:
            columns, rows = await run_in_threadpool(read_csv, folder / item["stored"])
            if not {source.text_column, source.label_column}.issubset(columns):
                raise ValueError(
                    "Selected text/label columns must exist in every file."
                )
            if source.group_column and source.group_column not in columns:
                raise ValueError("Selected group column must exist in every file.")
            for i, row in enumerate(rows, 2):
                label = row[source.label_column].strip()
                records.append(
                    {
                        "id": f"{item['split']}:{i}",
                        "row_number": i,
                        "split": item["split"],
                        "text": row[source.text_column],
                        "label": source.label_mapping.get(label, label),
                        "source_label": label,
                        "group": row.get(source.group_column, "")
                        if source.group_column
                        else "",
                    }
                )
        if len(records) > MAX_ROWS:
            raise ValueError("Maximum 100,000 rows across files.")
        return records, source.task, None
    except FileNotFoundError as exc:
        raise HTTPException(404, "Upload not found. Upload the files again.") from exc
    except (ValueError, OSError, UnicodeError, csv.Error) as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/upload")
async def upload(files: Annotated[list[UploadFile], File(...)], actor: Editor):
    if len(files) not in (1, 3):
        raise HTTPException(
            422, "Upload one CSV, or three files in train, validation, test order."
        )
    folder = UPLOAD_ROOT / str(uuid.uuid4())
    folder.mkdir(parents=True)
    metadata = {"owner": str(actor.id), "files": []}
    total = 0
    try:
        for i, upload_file in enumerate(files):
            if not (upload_file.filename or "").lower().endswith(".csv"):
                raise ValueError("Only UTF-8 CSV files are supported.")
            data = await upload_file.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise ValueError("Each CSV must be at most 50 MB.")
            path = folder / f"{i}.csv"
            path.write_bytes(data)
            columns, rows = await run_in_threadpool(read_csv, path)
            total += len(rows)
            if total > MAX_ROWS:
                raise ValueError("Maximum 100,000 rows across files.")
            metadata["files"].append(
                {
                    "stored": path.name,
                    "filename": upload_file.filename,
                    "split": ("train", "validation", "test")[i]
                    if len(files) == 3
                    else "unsplit",
                    "columns": columns,
                    "rows": len(rows),
                    "examples": rows[:5],
                }
            )
        (folder / "upload.json").write_text(json.dumps(metadata))
        return {
            "upload_id": folder.name,
            "files": [
                {k: v for k, v in f.items() if k != "stored"} for f in metadata["files"]
            ],
        }
    except (ValueError, OSError, UnicodeError, csv.Error) as exc:
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(422, str(exc)) from exc


@router.post("/analysis")
async def analysis(payload: ResearchRequest, actor: Viewer, session: Session):
    records, task, dataset = await source_records(payload.source, actor, session)
    report, _ = await run_in_threadpool(analyze, records, task)
    report["source_fingerprint"] = fingerprint(records)
    report["summary"] = {
        "name": dataset.name if dataset else "Unregistered upload",
        "version": dataset.version if dataset else "",
        "task": task,
        "source": dataset.source_name if dataset else "",
        "source_url": dataset.source_url if dataset else "",
        "license": dataset.license_name if dataset else "",
        "description": dataset.description if dataset else "",
        "preparation": dataset.preprocessing_config if dataset else {},
    }
    return report


@router.post("/rows")
async def rows(payload: RowsRequest, actor: Viewer, session: Session):
    records, task, _ = await source_records(payload.source, actor, session)
    _, flags = await run_in_threadpool(analyze, records, task)
    filtered = [
        r
        for r in records
        if (not payload.issue or payload.issue in flags[r["id"]])
        and (not payload.label or r["label"] == payload.label)
        and (not payload.split or r["split"] == payload.split)
        and (not payload.search or payload.search.casefold() in r["text"].casefold())
    ]
    return {
        "total": len(filtered),
        "items": [
            {**r, "issues": sorted(flags[r["id"]])}
            for r in filtered[payload.offset : payload.offset + payload.limit]
        ],
    }


@router.post("/preview")
async def preparation_preview(
    payload: ResearchRequest, actor: Editor, session: Session
):
    records, task, _ = await source_records(payload.source, actor, session)
    try:
        result, _, _ = await run_in_threadpool(
            preview, records, payload.preparation, task
        )
        return result
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/register", response_model=DatasetVersionRead, status_code=201)
async def register(
    payload: ResearchRegister, request: Request, actor: Editor, session: Session
):
    records, task, parent = await source_records(payload.source, actor, session)
    try:
        result, prepared, changes = await run_in_threadpool(
            preview, records, payload.preparation, task
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if result["token"] != payload.preview_token:
        raise HTTPException(
            409, "Source or preparation changed. Generate a fresh preview."
        )
    if not result["can_register"]:
        raise HTTPException(422, "; ".join(result["errors"]))
    # Serialize identity checks without relying on a nonexistent legacy unique constraint.
    await session.execute(text("SELECT pg_advisory_xact_lock(72310944)"))
    repo = DatasetVersionRepository(session)
    if await repo.get_by_identity(
        name=payload.name, version=payload.version, task=AnalysisTask(task)
    ):
        raise HTTPException(409, "This name and version already exist for the task.")
    identity = uuid.uuid4()
    directory = ROOT_DIR / "research/data/processed" / str(identity)
    metadata = {
        k: getattr(payload, k)
        for k in (
            "source_name",
            "source_url",
            "license_name",
            "collection_notes",
            "cleaning_notes",
            "limitations",
            "label_definitions",
        )
    }
    committed = False
    try:
        checksum = await run_in_threadpool(
            write_version,
            directory,
            records,
            prepared,
            changes,
            result["report"],
            payload.preparation,
            str(parent.id) if parent else None,
            metadata,
        )
        if payload.source.upload_id:
            original_dir = directory / "originals"
            original_dir.mkdir()
            upload_dir = UPLOAD_ROOT / str(payload.source.upload_id)
            for original in upload_dir.glob("*.csv"):
                shutil.copy2(original, original_dir / original.name)
        config = {
            "workflow": "research_preparation",
            "parent_dataset_version_id": str(parent.id) if parent else None,
            "source_fingerprint": fingerprint(records),
            "source_mapping": payload.source.model_dump(mode="json"),
            "preparation": payload.preparation.model_dump(),
            "summary": metadata,
            "split_strategy": payload.preparation.split_strategy,
            "random_seed": payload.preparation.seed,
            "cleaning_counts": {
                k: result[k]
                for k in ("before_rows", "after_rows", "removed_rows", "changed_rows")
            },
            "change_report_path": str(directory / "change-report.json"),
        }
        dataset = DatasetVersion(
            id=identity,
            name=payload.name,
            version=payload.version,
            task=AnalysisTask(task),
            description=payload.collection_notes
            or (parent.description if parent else ""),
            source_name=payload.source_name or (parent.source_name if parent else None),
            source_url=payload.source_url or (parent.source_url if parent else None),
            license_name=payload.license_name
            or (parent.license_name if parent else None),
            total_samples=len(prepared),
            train_samples=result["report"]["splits"].get("train", 0),
            validation_samples=result["report"]["splits"].get("validation", 0),
            test_samples=result["report"]["splits"].get("test", 0),
            manifest_path=str(directory / "manifest.json"),
            checksum=checksum,
            label_schema={
                "labels": sorted(result["report"]["labels"]),
                "distribution": result["report"]["labels"],
            },
            preprocessing_config=config,
        )
        session.add(dataset)
        await session.flush()
        await AuditService(session).record(
            request=request,
            action="dataset.prepared",
            user_id=actor.id,
            resource_type="dataset_version",
            resource_id=str(identity),
            details={
                "parent_dataset_version_id": config["parent_dataset_version_id"],
                "source_fingerprint": config["source_fingerprint"],
                "counts": config["cleaning_counts"],
            },
        )
        committed = True
        await session.refresh(dataset)
        return dataset
    except Exception as exc:
        await session.rollback()
        if not committed:
            shutil.rmtree(directory, ignore_errors=True)
        if isinstance(exc, IntegrityError):
            raise HTTPException(
                409, "Dataset registration conflicts with an existing record."
            ) from exc
        raise


@router.get("/{dataset_id}/change-report")
async def change_report(dataset_id: uuid.UUID, actor: Exporter, session: Session):
    dataset = await dataset_or_404(session, dataset_id)
    stored = (dataset.preprocessing_config or {}).get("change_report_path")
    if not stored:
        raise HTTPException(404, "No preparation report exists for this version.")
    path = Path(stored).resolve()
    root = (ROOT_DIR / "research/data/processed").resolve()
    if not path.is_relative_to(root) or path.name != "change-report.json":
        raise HTTPException(422, "Invalid report location.")
    if not path.is_file():
        raise HTTPException(404, "Report file is unavailable.")
    return FileResponse(
        path,
        media_type="application/json",
        filename=f"dataset-{dataset.id}-change-report.json",
    )


@router.get("/{dataset_id}/compare/{other_id}")
async def compare(
    dataset_id: uuid.UUID, other_id: uuid.UUID, actor: Viewer, session: Session
):
    left = await dataset_or_404(session, dataset_id)
    right = await dataset_or_404(session, other_id)
    if left.task != right.task:
        raise HTTPException(422, "Compare datasets for the same task.")
    a, _, _ = await source_records(ResearchSource(dataset_id=left.id), actor, session)
    b, _, _ = await source_records(ResearchSource(dataset_id=right.id), actor, session)
    from collections import Counter

    ac, bc = (
        Counter((r["text"], r["label"]) for r in a),
        Counter((r["text"], r["label"]) for r in b),
    )
    return {
        "left": {
            "id": str(left.id),
            "name": left.name,
            "version": left.version,
            "rows": len(a),
            "labels": dict(Counter(r["label"] for r in a)),
            "splits": dict(Counter(r["split"] for r in a)),
            "preparation": left.preprocessing_config,
        },
        "right": {
            "id": str(right.id),
            "name": right.name,
            "version": right.version,
            "rows": len(b),
            "labels": dict(Counter(r["label"] for r in b)),
            "splits": dict(Counter(r["split"] for r in b)),
            "preparation": right.preprocessing_config,
        },
        "removed_row_occurrences": sum((ac - bc).values()),
        "added_row_occurrences": sum((bc - ac).values()),
        "shared_row_occurrences": sum((ac & bc).values()),
        "note": "Exact text + label multiset comparison. Changed text/labels count as a removal and addition; split counts and preparation are shown separately.",
    }


@router.post("/preview-report")
async def preview_report(payload: ResearchRequest, actor: Editor, session: Session):
    records, task, _ = await source_records(payload.source, actor, session)
    try:
        report, prepared, changes = await run_in_threadpool(
            preview, records, payload.preparation, task
        )
        return {
            **report,
            "changes": changes,
            "provenance": [
                {"source_id": r["id"], "target_split": r["split"]} for r in prepared
            ],
        }
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
