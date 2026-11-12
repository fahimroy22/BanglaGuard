from __future__ import annotations

import csv
import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import ROOT_DIR
from app.db.models import (
    DatasetExport,
    DatasetVersion,
    Feedback,
)
from app.db.repositories.dataset_export import (
    DatasetExportRepository,
)
from app.db.repositories.dataset_version import (
    DatasetVersionRepository,
)
from app.db.repositories.feedback import (
    FeedbackRepository,
)
from app.domain.enums import (
    DatasetExportStatus,
)
from app.domain.services.research_loop import (
    LoopStore,
    decision,
    filter_export,
    text_key,
)
from app.schemas.dataset_export import (
    DatasetExportCreate,
)


class DatasetExportError(Exception):
    """Base exception for dataset export failures."""


class DatasetExportSelectionError(DatasetExportError):
    """Raised when selected feedback is invalid."""


class DatasetExportTaskMismatchError(DatasetExportError):
    """Raised when records contain another task."""


class DatasetExportEmptyError(DatasetExportError):
    """Raised when no dataset-ready rows remain."""


class DatasetExportService:
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self.session = session

        self.export_repository = DatasetExportRepository(session)

        self.feedback_repository = FeedbackRepository(session)

        self.dataset_repository = DatasetVersionRepository(session)

    async def create_export(
        self,
        *,
        payload: DatasetExportCreate,
        created_by_id: uuid.UUID,
    ) -> DatasetExport:
        selected_ids = list(payload.selected_feedback_ids)

        export_format_value = str(payload.export_format)

        task_value = str(payload.task)

        export_id = uuid.uuid4()

        export_record = DatasetExport(
            id=export_id,
            created_by_id=created_by_id,
            dataset_version_id=None,
            name=payload.name.strip(),
            version=payload.version.strip(),
            task=payload.task,
            export_format=payload.export_format,
            status=DatasetExportStatus.PENDING,
            selected_records=len(selected_ids),
            exported_records=0,
            skipped_records=0,
            selected_feedback_ids=[str(feedback_id) for feedback_id in selected_ids],
            artifact_path=None,
            manifest_path=None,
            checksum=None,
            configuration=dict(payload.configuration),
            error_message=None,
            completed_at=None,
        )

        self.session.add(export_record)

        await self.session.commit()
        await self.session.refresh(export_record)

        try:
            export_record.status = DatasetExportStatus.PROCESSING

            await self.session.commit()

            # Serialize exports of the same task and lock source corrections until publication.
            if (
                self.session.bind is not None
                and self.session.bind.dialect.name == "postgresql"
            ):
                await self.session.execute(
                    text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
                    {"key": "feedback-export:" + task_value},
                )
            await self.session.scalars(
                select(Feedback).where(Feedback.id.in_(selected_ids)).with_for_update()
            )
            result = await self.feedback_repository.list_dataset_builder_items(
                feedback_ids=selected_ids,
                limit=len(selected_ids),
                offset=0,
            )

            raw_items = result.get(
                "items",
                [],
            )

            if not isinstance(
                raw_items,
                list,
            ):
                raw_items = []

            found_ids = {str(item["feedback_id"]) for item in raw_items}

            missing_ids = [
                str(feedback_id)
                for feedback_id in selected_ids
                if str(feedback_id) not in found_ids
            ]

            if missing_ids:
                raise (
                    DatasetExportSelectionError(
                        "Some selected feedback "
                        "records were not found: " + ", ".join(missing_ids)
                    )
                )

            requested_task = task_value

            mismatched_ids = [
                str(item["feedback_id"])
                for item in raw_items
                if str(item["task"]) != requested_task
            ]

            if mismatched_ids:
                raise (
                    DatasetExportTaskMismatchError(
                        "Selected feedback contains "
                        "records from another task: " + ", ".join(mismatched_ids)
                    )
                )

            ready_items = [
                item for item in raw_items if bool(item.get("is_dataset_ready"))
            ]

            skipped_items = [
                item for item in raw_items if not bool(item.get("is_dataset_ready"))
            ]

            store = LoopStore()
            for item in ready_items:
                review = store.get("reviews", item["feedback_id"])
                if review and (
                    decision(review)["state"] != "accepted"
                    or decision(review)["label"] != item["final_label"]
                ):
                    raise DatasetExportSelectionError(
                        "Independent review is incomplete or disagrees with the saved correction."
                    )
            prior = (
                await self.session.scalars(
                    select(DatasetExport).where(
                        DatasetExport.status == DatasetExportStatus.COMPLETED,
                        DatasetExport.task == payload.task,
                    )
                )
            ).all()
            prior_keys = {
                key
                for previous in prior
                for key in (previous.configuration or {}).get("text_fingerprints", [])
            }
            existing_versions = (
                await self.session.scalars(
                    select(DatasetVersion).where(DatasetVersion.task == payload.task)
                )
            ).all()
            prior_keys.update(
                key
                for dataset in existing_versions
                for key in (dataset.preprocessing_config or {}).get(
                    "text_fingerprints", []
                )
            )
            project_id = payload.configuration.get("research_project_id")
            checked_datasets = []
            if project_id:
                project = store.get("projects", project_id)
                from app.db.models import User

                actor = await self.session.get(User, created_by_id)
                if not project or (
                    str(actor.role) != "admin"
                    and str(created_by_id)
                    not in [project["owner"], *project["members"]]
                ):
                    raise DatasetExportSelectionError("Project access denied")
                from app.domain.services.dataset_research import load_registered

                for linked in project["links"]:
                    if linked["kind"] != "dataset":
                        continue
                    dataset = await self.session.get(
                        DatasetVersion, uuid.UUID(linked["resource_id"])
                    )
                    if not dataset:
                        raise DatasetExportSelectionError(
                            "A linked dataset is unavailable. Restore it before duplicate checking."
                        )
                    # Older feedback exports are already checked through their recorded fingerprints.
                    if (dataset.preprocessing_config or {}).get("text_fingerprints"):
                        prior_keys.update(
                            dataset.preprocessing_config["text_fingerprints"]
                        )
                    else:
                        try:
                            records = await run_in_threadpool(load_registered, dataset)
                        except Exception as exc:
                            raise DatasetExportSelectionError(
                                "Could not check linked dataset duplicates: "
                                + dataset.name
                            ) from exc
                        prior_keys.update(text_key(row["text"]) for row in records)
                    checked_datasets.append(str(dataset.id))
            ready_items, duplicate_items = filter_export(ready_items, prior_keys)
            skipped_items.extend(duplicate_items)
            export_record.configuration = {
                **dict(payload.configuration),
                "intended_use": "training_pool",
                "evaluation_policy": "Existing evaluation splits are unchanged. Create and document a separate evaluation version explicitly.",
                "included_feedback_ids": [
                    str(item["feedback_id"]) for item in ready_items
                ],
                "text_fingerprints": [
                    text_key(item.get("text") or item.get("normalized_text"))
                    for item in ready_items
                ],
                "duplicate_check": {
                    "method": "NFC + whitespace + casefold exact matching",
                    "checked_dataset_ids": checked_datasets,
                    "tracked_prior_exports_checked": sum(bool((e.configuration or {}).get("text_fingerprints")) for e in prior),
                    "legacy_exports_without_fingerprints": sum(not bool((e.configuration or {}).get("text_fingerprints")) for e in prior),
                    "skipped": [
                        {
                            "feedback_id": str(item["feedback_id"]),
                            "reasons": item["readiness_reasons"],
                        }
                        for item in duplicate_items
                    ],
                },
            }
            if not ready_items:
                raise DatasetExportEmptyError(
                    "None of the selected feedback records are dataset-ready."
                )

            export_directory = ROOT_DIR / "storage" / "dataset-exports" / str(export_id)

            export_directory.mkdir(
                parents=True,
                exist_ok=True,
            )

            safe_name = _safe_filename(payload.name)

            extension = "csv" if export_format_value == "csv" else "jsonl"

            artifact_path = export_directory / (
                f"{safe_name}-{_safe_filename(payload.version)}.{extension}"
            )

            manifest_path = export_directory / "manifest.json"

            export_rows = [_prepare_export_row(item) for item in ready_items]

            if export_format_value == "csv":
                _write_csv(
                    artifact_path,
                    export_rows,
                )
            else:
                _write_jsonl(
                    artifact_path,
                    export_rows,
                )

            processed_path = (
                artifact_path
                if export_format_value == "csv"
                else export_directory / "processed.csv"
            )
            if export_format_value != "csv":
                _write_csv(processed_path, export_rows)

            checksum = _calculate_checksum(artifact_path)

            label_distribution = _calculate_label_distribution(export_rows)

            dataset_version = DatasetVersion(
                name=payload.name.strip(),
                version=payload.version.strip(),
                description=(
                    "Dataset generated from reviewed BanglaGuard feedback records."
                ),
                source_name=("BanglaGuard Dataset Builder"),
                source_url=None,
                license_name=(payload.configuration.get("license_name")),
                task=payload.task,
                total_samples=len(export_rows),
                train_samples=0,
                validation_samples=0,
                test_samples=0,
                manifest_path=str(manifest_path),
                checksum=checksum,
                label_schema={
                    "labels": sorted(label_distribution),
                    "distribution": (label_distribution),
                },
                preprocessing_config={
                    "source": ("reviewed_feedback"),
                    "export_format": export_format_value,
                    "dataset_ready_only": True,
                    "selected_records": len(selected_ids),
                    "exported_records": len(export_rows),
                    "skipped_records": len(skipped_items),
                    **dict(export_record.configuration),
                },
            )

            self.session.add(dataset_version)

            await self.session.flush()

            manifest = {
                "files": {"processed": str(processed_path)},
                "export_id": str(export_id),
                "dataset_version_id": str(dataset_version.id),
                "name": payload.name.strip(),
                "version": (payload.version.strip()),
                "task": requested_task,
                "export_format": export_format_value,
                "status": "completed",
                "created_by_id": str(created_by_id),
                "created_at": (datetime.now(timezone.utc).isoformat()),
                "selected_records": len(selected_ids),
                "exported_records": len(export_rows),
                "skipped_records": len(skipped_items),
                "selected_feedback_ids": [
                    str(feedback_id) for feedback_id in selected_ids
                ],
                "skipped_feedback": [
                    {
                        "feedback_id": str(item["feedback_id"]),
                        "reasons": list(
                            item.get(
                                "readiness_reasons",
                                [],
                            )
                        ),
                    }
                    for item in skipped_items
                ],
                "label_distribution": (label_distribution),
                "artifact": {
                    "path": str(artifact_path),
                    "filename": (artifact_path.name),
                    "checksum_sha256": (checksum),
                    "size_bytes": (artifact_path.stat().st_size),
                },
                "configuration": dict(export_record.configuration),
                "included_feedback_ids": export_record.configuration[
                    "included_feedback_ids"
                ],
            }

            manifest_path.write_text(
                json.dumps(
                    manifest,
                    ensure_ascii=False,
                    indent=2,
                    default=str,
                ),
                encoding="utf-8",
            )

            export_record.dataset_version_id = dataset_version.id

            export_record.status = DatasetExportStatus.COMPLETED

            export_record.exported_records = len(export_rows)

            export_record.skipped_records = len(skipped_items)

            export_record.artifact_path = str(artifact_path)

            export_record.manifest_path = str(manifest_path)

            export_record.checksum = checksum

            export_record.error_message = None

            export_record.completed_at = datetime.now(timezone.utc)

            await self.session.commit()
            await self.session.refresh(export_record)

            return export_record

        except Exception as exc:
            await self.session.rollback()

            failed_export = await self.export_repository.get(export_id)

            if failed_export is not None:
                failed_export.status = DatasetExportStatus.FAILED

                failed_export.error_message = str(exc)[:4000]

                failed_export.completed_at = datetime.now(timezone.utc)

                await self.session.commit()
                await self.session.refresh(failed_export)

            raise


def _prepare_export_row(
    item: dict[str, Any],
) -> dict[str, Any]:
    text_value = item.get("text") or item.get("normalized_text") or ""

    return {
        "text": str(text_value),
        "normalized_text": (item.get("normalized_text") or ""),
        "label": (item.get("final_label") or ""),
        "task": item.get("task"),
        "predicted_label": item.get("predicted_label"),
        "corrected_label": item.get("corrected_label"),
        "verdict": item.get("verdict"),
        "confidence": item.get("confidence"),
        "probabilities": item.get("probabilities"),
        "model_name": item.get("model_name"),
        "model_version": item.get("model_version"),
        "model_version_id": str(item.get("model_version_id") or ""),
        "feedback_id": str(item.get("feedback_id") or ""),
        "prediction_id": str(item.get("prediction_id") or ""),
        "reviewer_name": item.get("reviewer_name"),
        "reviewer_email": item.get("reviewer_email"),
        "reviewed_by_id": str(item.get("reviewed_by_id") or ""),
        "user_comment": item.get("user_comment"),
        "reviewer_note": item.get("reviewer_note"),
        "feedback_created_at": (item.get("feedback_created_at")),
        "prediction_created_at": (item.get("prediction_created_at")),
        "reviewed_at": item.get("reviewed_at"),
    }


def _write_csv(
    path: Path,
    rows: list[dict[str, Any]],
) -> None:
    fieldnames = [
        "text",
        "normalized_text",
        "label",
        "task",
        "predicted_label",
        "corrected_label",
        "verdict",
        "confidence",
        "probabilities",
        "model_name",
        "model_version",
        "model_version_id",
        "feedback_id",
        "prediction_id",
        "reviewer_name",
        "reviewer_email",
        "reviewed_by_id",
        "user_comment",
        "reviewer_note",
        "feedback_created_at",
        "prediction_created_at",
        "reviewed_at",
    ]

    with path.open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        writer = csv.DictWriter(
            file,
            fieldnames=fieldnames,
            extrasaction="ignore",
        )

        writer.writeheader()

        for row in rows:
            writer.writerow(
                {key: _serialize_csv_value(row.get(key)) for key in fieldnames}
            )


def _write_jsonl(
    path: Path,
    rows: list[dict[str, Any]],
) -> None:
    with path.open(
        "w",
        encoding="utf-8",
    ) as file:
        for row in rows:
            file.write(
                json.dumps(
                    row,
                    ensure_ascii=False,
                    default=str,
                )
            )

            file.write("\n")


def _serialize_csv_value(
    value: Any,
) -> str | int | float:
    if value is None:
        return ""

    if isinstance(
        value,
        (dict, list),
    ):
        return json.dumps(
            value,
            ensure_ascii=False,
            default=str,
        )

    if isinstance(
        value,
        datetime,
    ):
        return value.isoformat()

    if isinstance(
        value,
        (str, int, float),
    ):
        return value

    return str(value)


def _calculate_checksum(
    path: Path,
) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as file:
        while chunk := file.read(8192):
            digest.update(chunk)

    return digest.hexdigest()


def _calculate_label_distribution(
    rows: list[dict[str, Any]],
) -> dict[str, int]:
    distribution: dict[str, int] = {}

    for row in rows:
        label = str(row.get("label") or "").strip()

        if not label:
            continue

        distribution[label] = (
            distribution.get(
                label,
                0,
            )
            + 1
        )

    return distribution


def _safe_filename(
    value: str,
) -> str:
    cleaned = re.sub(
        r"[^a-zA-Z0-9._-]+",
        "-",
        value.strip(),
    )

    cleaned = cleaned.strip("-._")

    return cleaned.lower() or "banglaguard-dataset"
