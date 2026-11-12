import json
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.domain.services.dataset_artifacts import (
    DatasetArtifactFileNotFoundError,
    DatasetArtifactKeyError,
    DatasetArtifactPathError,
    DatasetArtifactService,
)


def create_dataset(
    manifest_path: Path,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        manifest_path=str(manifest_path),
    )


def test_processed_dataset_manifest_and_files(
    tmp_path: Path,
) -> None:
    processed_root = tmp_path / "research" / "data" / "processed" / "dataset-1"

    processed_root.mkdir(parents=True)

    processed_file = processed_root / "processed.csv"

    train_file = processed_root / "train.csv"

    processed_file.write_text(
        "text,label\nsample,positive\n",
        encoding="utf-8",
    )

    train_file.write_text(
        "text,label\nsample,positive\n",
        encoding="utf-8",
    )

    manifest_path = processed_root / "manifest.json"

    manifest_path.write_text(
        json.dumps(
            {
                "dataset_id": ("example-dataset"),
                "files": {
                    "processed": (str(processed_file)),
                    "train": (str(train_file)),
                },
            }
        ),
        encoding="utf-8",
    )

    service = DatasetArtifactService(root_directory=tmp_path)

    dataset = create_dataset(manifest_path)

    manifest = service.get_manifest(dataset_version=dataset)

    assert manifest["manifest_type"] == "processed_dataset"

    inventory = service.get_file_inventory(dataset_version=dataset)

    assert inventory["total_files"] == 3
    assert inventory["available_files"] == 3
    assert inventory["missing_files"] == []

    keys = {item["key"] for item in inventory["files"]}

    assert keys == {
        "manifest",
        "processed",
        "train",
    }


def test_export_manifest_is_supported(
    tmp_path: Path,
) -> None:
    export_root = tmp_path / "storage" / "dataset-exports" / "export-1"

    export_root.mkdir(parents=True)

    artifact_path = export_root / "dataset.csv"

    artifact_path.write_text(
        "text,label\nsample,hateful\n",
        encoding="utf-8",
    )

    manifest_path = export_root / "manifest.json"

    manifest_path.write_text(
        json.dumps(
            {
                "export_id": "export-1",
                "export_format": "csv",
                "artifact": {
                    "path": str(artifact_path),
                    "filename": (artifact_path.name),
                },
            }
        ),
        encoding="utf-8",
    )

    service = DatasetArtifactService(root_directory=tmp_path)

    inventory = service.get_file_inventory(
        dataset_version=create_dataset(manifest_path)
    )

    assert inventory["manifest_type"] == "dataset_export"

    assert inventory["total_files"] == 2
    assert inventory["available_files"] == 2


def test_path_outside_storage_is_rejected(
    tmp_path: Path,
) -> None:
    unsafe_manifest = tmp_path / "unsafe-manifest.json"

    unsafe_manifest.write_text(
        "{}",
        encoding="utf-8",
    )

    service = DatasetArtifactService(root_directory=tmp_path)

    with pytest.raises(DatasetArtifactPathError):
        service.get_manifest(dataset_version=create_dataset(unsafe_manifest))


def test_download_file_resolves_allowed_artifact(
    tmp_path: Path,
) -> None:
    processed_root = tmp_path / "research" / "data" / "processed" / "dataset-download"

    processed_root.mkdir(parents=True)

    train_path = processed_root / "train.csv"

    train_path.write_text(
        "text,label\nsample,positive\n",
        encoding="utf-8",
    )

    manifest_path = processed_root / "manifest.json"

    manifest_path.write_text(
        json.dumps(
            {
                "dataset_id": "dataset-download",
                "files": {
                    "train": str(train_path),
                },
            }
        ),
        encoding="utf-8",
    )

    service = DatasetArtifactService(root_directory=tmp_path)

    result = service.get_download_file(
        dataset_version=create_dataset(manifest_path),
        file_key="train",
    )

    assert result["key"] == "train"
    assert result["filename"] == "train.csv"
    assert result["exists"] is True
    assert result["media_type"] == "text/csv"
    assert Path(result["path"]) == train_path.resolve()


def test_download_file_rejects_unsupported_key(
    tmp_path: Path,
) -> None:
    processed_root = (
        tmp_path / "research" / "data" / "processed" / "dataset-invalid-key"
    )

    processed_root.mkdir(parents=True)

    manifest_path = processed_root / "manifest.json"

    manifest_path.write_text(
        json.dumps(
            {
                "dataset_id": "dataset-invalid-key",
                "files": {},
            }
        ),
        encoding="utf-8",
    )

    service = DatasetArtifactService(root_directory=tmp_path)

    with pytest.raises(DatasetArtifactKeyError):
        service.get_download_file(
            dataset_version=create_dataset(manifest_path),
            file_key="../../etc/passwd",
        )


def test_download_file_reports_missing_artifact(
    tmp_path: Path,
) -> None:
    processed_root = (
        tmp_path / "research" / "data" / "processed" / "dataset-missing-file"
    )

    processed_root.mkdir(parents=True)

    missing_path = processed_root / "train.csv"

    manifest_path = processed_root / "manifest.json"

    manifest_path.write_text(
        json.dumps(
            {
                "dataset_id": "dataset-missing-file",
                "files": {
                    "train": str(missing_path),
                },
            }
        ),
        encoding="utf-8",
    )

    service = DatasetArtifactService(root_directory=tmp_path)

    with pytest.raises(DatasetArtifactFileNotFoundError):
        service.get_download_file(
            dataset_version=create_dataset(manifest_path),
            file_key="train",
        )


def test_preview_file_returns_paginated_rows(
    tmp_path: Path,
) -> None:
    processed_root = tmp_path / "research" / "data" / "processed" / "dataset-preview"

    processed_root.mkdir(parents=True)

    train_path = processed_root / "train.csv"

    train_path.write_text(
        (
            "text,label\n"
            "বাংলা বাক্য ১,hateful\n"
            "বাংলা বাক্য ২,non_hateful\n"
            "বাংলা বাক্য ৩,hateful\n"
            "বাংলা বাক্য ৪,non_hateful\n"
        ),
        encoding="utf-8",
    )

    manifest_path = processed_root / "manifest.json"

    manifest_path.write_text(
        json.dumps(
            {
                "dataset_id": "dataset-preview",
                "files": {
                    "train": str(train_path),
                },
            }
        ),
        encoding="utf-8",
    )

    service = DatasetArtifactService(root_directory=tmp_path)

    result = service.preview_file(
        dataset_version=create_dataset(manifest_path),
        file_key="train",
        limit=2,
        offset=1,
    )

    assert result["file_key"] == "train"
    assert result["filename"] == "train.csv"

    assert result["columns"] == [
        "text",
        "label",
    ]

    assert result["total_rows"] == 4

    assert result["limit"] == 2
    assert result["offset"] == 1

    assert result["has_previous"] is True
    assert result["has_next"] is True

    assert len(result["rows"]) == 2

    assert result["rows"][0] == {
        "text": "বাংলা বাক্য ২",
        "label": "non_hateful",
    }


def test_preview_file_handles_last_page(
    tmp_path: Path,
) -> None:
    processed_root = (
        tmp_path / "research" / "data" / "processed" / "dataset-preview-last-page"
    )

    processed_root.mkdir(parents=True)

    test_path = processed_root / "test.csv"

    test_path.write_text(
        ("text,label\none,a\ntwo,b\nthree,a\n"),
        encoding="utf-8",
    )

    manifest_path = processed_root / "manifest.json"

    manifest_path.write_text(
        json.dumps(
            {
                "dataset_id": ("dataset-preview-last-page"),
                "files": {
                    "test": str(test_path),
                },
            }
        ),
        encoding="utf-8",
    )

    service = DatasetArtifactService(root_directory=tmp_path)

    result = service.preview_file(
        dataset_version=create_dataset(manifest_path),
        file_key="test",
        limit=2,
        offset=2,
    )

    assert result["total_rows"] == 3
    assert len(result["rows"]) == 1

    assert result["has_previous"] is True
    assert result["has_next"] is False


def test_preview_file_rejects_manifest_key(
    tmp_path: Path,
) -> None:
    processed_root = (
        tmp_path / "research" / "data" / "processed" / "dataset-preview-manifest"
    )

    processed_root.mkdir(parents=True)

    manifest_path = processed_root / "manifest.json"

    manifest_path.write_text(
        json.dumps(
            {
                "dataset_id": ("dataset-preview-manifest"),
                "files": {},
            }
        ),
        encoding="utf-8",
    )

    service = DatasetArtifactService(root_directory=tmp_path)

    with pytest.raises(DatasetArtifactKeyError):
        service.preview_file(
            dataset_version=create_dataset(manifest_path),
            file_key="manifest",
            limit=20,
            offset=0,
        )


def create_registered_dataset(
    *,
    manifest_path: Path,
    checksum: str,
    total_samples: int,
    train_samples: int,
    validation_samples: int,
    test_samples: int,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        name="Quality Dataset",
        version="1.0.0",
        manifest_path=str(manifest_path),
        checksum=checksum,
        total_samples=total_samples,
        train_samples=train_samples,
        validation_samples=(validation_samples),
        test_samples=test_samples,
    )


def test_quality_report_marks_clean_dataset_ready(
    tmp_path: Path,
) -> None:
    processed_root = tmp_path / "research" / "data" / "processed" / "quality-clean"

    processed_root.mkdir(parents=True)

    processed_path = processed_root / "processed.csv"

    train_path = processed_root / "train.csv"

    validation_path = processed_root / "validation.csv"

    test_path = processed_root / "test.csv"

    rows = [
        "text,label",
        "বাংলা এক,hateful",
        "বাংলা দুই,non_hateful",
        "বাংলা তিন,hateful",
        "বাংলা চার,non_hateful",
    ]

    processed_path.write_text(
        "\n".join(rows) + "\n",
        encoding="utf-8",
    )

    train_path.write_text(
        "\n".join(rows[:3]) + "\n",
        encoding="utf-8",
    )

    validation_path.write_text(
        "text,label\nবাংলা তিন,hateful\n",
        encoding="utf-8",
    )

    test_path.write_text(
        "text,label\nবাংলা চার,non_hateful\n",
        encoding="utf-8",
    )

    service = DatasetArtifactService(root_directory=tmp_path)

    checksum = service._calculate_checksum(processed_path)

    manifest_path = processed_root / "manifest.json"

    manifest_path.write_text(
        json.dumps(
            {
                "dataset_id": ("quality-clean"),
                "samples": {
                    "total": 4,
                    "train": 2,
                    "validation": 1,
                    "test": 1,
                },
                "files": {
                    "processed": str(processed_path),
                    "train": str(train_path),
                    "validation": str(validation_path),
                    "test": str(test_path),
                },
                "checksum_sha256": (checksum),
            }
        ),
        encoding="utf-8",
    )

    dataset = create_registered_dataset(
        manifest_path=manifest_path,
        checksum=checksum,
        total_samples=4,
        train_samples=2,
        validation_samples=1,
        test_samples=1,
    )

    result = service.get_quality_report(dataset_version=dataset)

    assert result["status"] == "ready"

    assert result["training_ready"] is True

    assert result["quality_score"] == 100.0

    assert result["errors"] == []


def test_quality_report_blocks_damaged_dataset(
    tmp_path: Path,
) -> None:
    processed_root = tmp_path / "research" / "data" / "processed" / "quality-damaged"

    processed_root.mkdir(parents=True)

    processed_path = processed_root / "processed.csv"

    train_path = processed_root / "train.csv"

    validation_path = processed_root / "validation.csv"

    test_path = processed_root / "test.csv"

    processed_path.write_text(
        ("text,label\nভাঙা� লেখা,hateful\nসুস্থ লেখা,non_hateful\n"),
        encoding="utf-8",
    )

    train_path.write_text(
        ("text,label\nভাঙা� লেখা,hateful\n"),
        encoding="utf-8",
    )

    validation_path.write_text(
        ("text,label\nসুস্থ লেখা,non_hateful\n"),
        encoding="utf-8",
    )

    test_path.write_text(
        "text,label\n",
        encoding="utf-8",
    )

    service = DatasetArtifactService(root_directory=tmp_path)

    checksum = service._calculate_checksum(processed_path)

    manifest_path = processed_root / "manifest.json"

    manifest_path.write_text(
        json.dumps(
            {
                "dataset_id": ("quality-damaged"),
                "samples": {
                    "total": 2,
                    "train": 1,
                    "validation": 1,
                    "test": 0,
                },
                "files": {
                    "processed": str(processed_path),
                    "train": str(train_path),
                    "validation": str(validation_path),
                    "test": str(test_path),
                },
                "checksum_sha256": (checksum),
            }
        ),
        encoding="utf-8",
    )

    dataset = create_registered_dataset(
        manifest_path=manifest_path,
        checksum=checksum,
        total_samples=2,
        train_samples=1,
        validation_samples=1,
        test_samples=0,
    )

    result = service.get_quality_report(dataset_version=dataset)

    assert result["status"] == "not_ready"

    assert result["training_ready"] is False

    assert result["summary"]["processed_replacement_character_rows"] == 1

    assert any(
        (check["key"] == "replacement_character_threshold" and check["passed"] is False)
        for check in result["checks"]
    )
